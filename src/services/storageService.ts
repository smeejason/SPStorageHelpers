import { getGraphClient } from './graphClient';
import { store } from '../store/store';
import type {
  SiteStorageInfo,
  TenantStorageSummary,
  LargeFileInfo,
  RecycleBinItem,
} from '../types';

/** Fetch all SharePoint sites with storage usage via Graph API */
export async function fetchSiteStorage(): Promise<SiteStorageInfo[]> {
  const client = getGraphClient();
  store.dispatch({ type: 'SET_LOADING', payload: true });
  store.dispatch({ type: 'SET_ERROR', payload: null });

  try {
    // Use the SharePoint admin reports endpoint to get site usage
    const response = await client
      .api('/reports/getSharePointSiteUsageDetail(period=\'D7\')')
      .responseType('text' as never)
      .get();

    const sites = parseSharePointSiteUsageCSV(response as string);
    store.dispatch({ type: 'SET_SITES', payload: sites });
    return sites;
  } catch (err) {
    // Fallback: enumerate sites from the search API
    try {
      const sites = await fetchSitesViaSearch();
      store.dispatch({ type: 'SET_SITES', payload: sites });
      return sites;
    } catch (fallbackErr) {
      const message =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : 'Failed to fetch site storage';
      store.dispatch({ type: 'SET_ERROR', payload: message });
      throw fallbackErr;
    }
  } finally {
    store.dispatch({ type: 'SET_LOADING', payload: false });
  }
}

/** Parse the CSV returned by the SharePoint usage report */
function parseSharePointSiteUsageCSV(csv: string): SiteStorageInfo[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  const nameIdx = headers.indexOf('Site URL');
  const usedIdx = headers.indexOf('Storage Used (Byte)');
  const allocIdx = headers.indexOf('Storage Allocated (Byte)');
  const lastModIdx = headers.indexOf('Last Activity Date');
  const ownerIdx = headers.indexOf('Owner Display Name');
  const siteIdIdx = headers.indexOf('Site Id');

  return lines.slice(1).map((line, i) => {
    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
    const used = parseInt(cols[usedIdx] || '0', 10);
    const alloc = parseInt(cols[allocIdx] || '0', 10);
    return {
      id: cols[siteIdIdx] || `site-${i}`,
      displayName: cols[nameIdx]?.split('/').pop() || `Site ${i}`,
      webUrl: cols[nameIdx] || '',
      storageUsedInBytes: used,
      storageAllocatedInBytes: alloc,
      storageUsedPercentage: alloc > 0 ? (used / alloc) * 100 : 0,
      lastModifiedDateTime: cols[lastModIdx] || '',
      owner: cols[ownerIdx] || undefined,
    };
  });
}

/** Fallback: fetch sites via Graph search endpoint */
async function fetchSitesViaSearch(): Promise<SiteStorageInfo[]> {
  const client = getGraphClient();
  const response = await client
    .api('/sites?search=*&$select=id,displayName,webUrl,createdDateTime')
    .top(100)
    .get();

  const sites: SiteStorageInfo[] = [];
  for (const site of response.value ?? []) {
    sites.push({
      id: site.id,
      displayName: site.displayName ?? 'Unnamed Site',
      webUrl: site.webUrl ?? '',
      storageUsedInBytes: 0,
      storageAllocatedInBytes: 0,
      storageUsedPercentage: 0,
      lastModifiedDateTime: site.createdDateTime ?? '',
    });
  }
  return sites;
}

/** Build a tenant-level summary from site data */
export function buildTenantSummary(
  sites: SiteStorageInfo[],
): TenantStorageSummary {
  const totalUsed = sites.reduce((s, site) => s + site.storageUsedInBytes, 0);
  const totalAlloc = sites.reduce(
    (s, site) => s + site.storageAllocatedInBytes,
    0,
  );

  const summary: TenantStorageSummary = {
    totalStorageInBytes: totalAlloc,
    usedStorageInBytes: totalUsed,
    availableStorageInBytes: totalAlloc - totalUsed,
    usedPercentage: totalAlloc > 0 ? (totalUsed / totalAlloc) * 100 : 0,
    siteCount: sites.length,
    lastRefreshed: new Date().toISOString(),
  };

  store.dispatch({ type: 'SET_TENANT_SUMMARY', payload: summary });
  return summary;
}

/** Fetch large files across sites (top N by size) */
export async function fetchLargeFiles(
  siteId: string,
  minSizeBytes: number = 10 * 1024 * 1024,
): Promise<LargeFileInfo[]> {
  const client = getGraphClient();
  store.dispatch({ type: 'SET_LOADING', payload: true });

  try {
    // Get drives for the site
    const drivesResp = await client
      .api(`/sites/${siteId}/drives`)
      .select('id,name')
      .get();

    const largeFiles: LargeFileInfo[] = [];

    for (const drive of drivesResp.value ?? []) {
      const itemsResp = await client
        .api(`/drives/${drive.id}/root/search(q='*')`)
        .select('id,name,size,webUrl,lastModifiedDateTime,lastModifiedBy')
        .top(200)
        .orderby('size desc')
        .get();

      for (const item of itemsResp.value ?? []) {
        if (item.size >= minSizeBytes) {
          largeFiles.push({
            id: item.id,
            name: item.name,
            size: item.size,
            webUrl: item.webUrl ?? '',
            siteName: '',
            siteId,
            libraryName: drive.name,
            lastModifiedDateTime: item.lastModifiedDateTime ?? '',
            lastModifiedBy:
              item.lastModifiedBy?.user?.displayName ?? 'Unknown',
          });
        }
      }
    }

    largeFiles.sort((a, b) => b.size - a.size);
    store.dispatch({ type: 'SET_LARGE_FILES', payload: largeFiles });
    return largeFiles;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch large files';
    store.dispatch({ type: 'SET_ERROR', payload: message });
    throw err;
  } finally {
    store.dispatch({ type: 'SET_LOADING', payload: false });
  }
}

/** Fetch recycle bin items for a site (requires Sites.ReadWrite.All) */
export async function fetchRecycleBinItems(
  siteId: string,
): Promise<RecycleBinItem[]> {
  const client = getGraphClient();

  try {
    const response = await client
      .api(`/sites/${siteId}/recycleBin/items`)
      .top(200)
      .get();

    const items: RecycleBinItem[] = (response.value ?? []).map(
      (item: Record<string, unknown>) => ({
        id: item.id as string,
        title: (item.name as string) ?? 'Untitled',
        size: (item.size as number) ?? 0,
        deletedDateTime: (item.deletedDateTime as string) ?? '',
        deletedBy: '',
        siteName: '',
        siteId,
        itemType: (item.type as string) ?? 'unknown',
      }),
    );

    store.dispatch({ type: 'SET_RECYCLE_BIN', payload: items });
    return items;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Failed to fetch recycle bin items';
    store.dispatch({ type: 'SET_ERROR', payload: message });
    throw err;
  }
}
