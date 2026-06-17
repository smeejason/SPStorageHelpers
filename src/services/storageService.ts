import { getGraphClient } from './graphClient'
import { store } from '../store/store'
import type {
  SiteStorageInfo,
  TenantStorageSummary,
  LargeFileInfo,
  RecycleBinItem,
} from '../types'

// ─── Site storage ─────────────────────────────────────────────────────────────

/**
 * Fetch SharePoint sites with storage usage.
 *
 * The Reports API (/reports/getSharePointSiteUsageDetail) redirects to a
 * download server that doesn't support CORS, so it can't be called from a
 * browser SPA. Instead we enumerate sites via the search API and fetch
 * drive quota per site.
 */
export async function fetchSiteStorage(): Promise<SiteStorageInfo[]> {
  const client = getGraphClient()
  store.dispatch({ type: 'SET_LOADING', payload: true })
  store.dispatch({ type: 'SET_ERROR', payload: null })

  try {
    // Step 1: Enumerate all sites
    const allSites: Array<{ id: string; displayName: string; webUrl: string; createdDateTime: string }> = []
    let nextLink: string | null = '/sites?search=*&$select=id,displayName,webUrl,createdDateTime&$top=100'

    while (nextLink) {
      const response = await client.api(nextLink).get()
      for (const site of response.value ?? []) {
        allSites.push({
          id: site.id,
          displayName: site.displayName ?? 'Unnamed Site',
          webUrl: site.webUrl ?? '',
          createdDateTime: site.createdDateTime ?? '',
        })
      }
      nextLink = response['@odata.nextLink']
        ? response['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
        : null
    }

    // Step 2: Fetch all drives per site and sum quota usage.
    // Uses /drives (plural) instead of /drive to avoid 404 on sites
    // without a default document library.
    const sites: SiteStorageInfo[] = []
    for (const site of allSites) {
      try {
        const drivesResp = await client
          .api(`/sites/${site.id}/drives`)
          .select('quota')
          .get()

        let used = 0
        let total = 0
        for (const drv of drivesResp.value ?? []) {
          const q = drv.quota ?? {}
          used += q.used ?? 0
          total += q.total ?? 0
        }

        sites.push({
          id: site.id,
          displayName: site.displayName,
          webUrl: site.webUrl,
          storageUsedInBytes: used,
          storageAllocatedInBytes: total,
          storageUsedPercentage: total > 0 ? (used / total) * 100 : 0,
          lastModifiedDateTime: site.createdDateTime,
        })
      } catch {
        // Site may not have any drives — include with zero storage
        sites.push({
          id: site.id,
          displayName: site.displayName,
          webUrl: site.webUrl,
          storageUsedInBytes: 0,
          storageAllocatedInBytes: 0,
          storageUsedPercentage: 0,
          lastModifiedDateTime: site.createdDateTime,
        })
      }
    }

    store.dispatch({ type: 'SET_SITES', payload: sites })
    return sites
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch site storage'
    store.dispatch({ type: 'SET_ERROR', payload: message })
    throw err
  } finally {
    store.dispatch({ type: 'SET_LOADING', payload: false })
  }
}

// ─── Tenant summary ───────────────────────────────────────────────────────────

export function buildTenantSummary(sites: SiteStorageInfo[]): TenantStorageSummary {
  const totalUsed = sites.reduce((s, site) => s + site.storageUsedInBytes, 0)
  const totalAlloc = sites.reduce((s, site) => s + site.storageAllocatedInBytes, 0)

  const summary: TenantStorageSummary = {
    totalStorageInBytes: totalAlloc,
    usedStorageInBytes: totalUsed,
    availableStorageInBytes: totalAlloc - totalUsed,
    usedPercentage: totalAlloc > 0 ? (totalUsed / totalAlloc) * 100 : 0,
    siteCount: sites.length,
    lastRefreshed: new Date().toISOString(),
  }

  store.dispatch({ type: 'SET_TENANT_SUMMARY', payload: summary })
  return summary
}

// ─── Large files ──────────────────────────────────────────────────────────────

export async function fetchLargeFiles(
  siteId: string,
  minSizeBytes: number = 10 * 1024 * 1024,
): Promise<LargeFileInfo[]> {
  const client = getGraphClient()
  store.dispatch({ type: 'SET_LOADING', payload: true })

  try {
    const drivesResp = await client
      .api(`/sites/${siteId}/drives`)
      .select('id,name')
      .get()

    const largeFiles: LargeFileInfo[] = []

    for (const drive of drivesResp.value ?? []) {
      try {
        // Use delta to enumerate all items in the drive (search endpoint is unreliable)
        let deltaLink: string | null = `/drives/${drive.id}/root/delta`
        while (deltaLink) {
          const resp = await client
            .api(deltaLink)
            .top(200)
            .get()

          for (const item of resp.value ?? []) {
            if (item.file && item.size >= minSizeBytes) {
              largeFiles.push({
                id: item.id,
                name: item.name,
                size: item.size,
                webUrl: item.webUrl ?? '',
                siteName: '',
                siteId,
                libraryName: drive.name,
                lastModifiedDateTime: item.lastModifiedDateTime ?? '',
                lastModifiedBy: item.lastModifiedBy?.user?.displayName ?? 'Unknown',
              })
            }
          }

          // Follow pagination (not the delta token — we only need one pass)
          deltaLink = resp['@odata.nextLink']
            ? resp['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
            : null
        }
      } catch {
        // Skip drives that can't be enumerated
      }
    }

    largeFiles.sort((a, b) => b.size - a.size)
    store.dispatch({ type: 'SET_LARGE_FILES', payload: largeFiles })
    return largeFiles
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch large files'
    store.dispatch({ type: 'SET_ERROR', payload: message })
    throw err
  } finally {
    store.dispatch({ type: 'SET_LOADING', payload: false })
  }
}

// ─── Recycle bin ──────────────────────────────────────────────────────────────

export async function fetchRecycleBinItems(siteId: string): Promise<RecycleBinItem[]> {
  const client = getGraphClient()

  try {
    // recycleBin endpoint requires beta API
    const response = await client
      .api(`/sites/${siteId}/recycleBin/items`)
      .version('beta')
      .top(200)
      .get()

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
    )

    store.dispatch({ type: 'SET_RECYCLE_BIN', payload: items })
    return items
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch recycle bin items'
    store.dispatch({ type: 'SET_ERROR', payload: message })
    throw err
  }
}
