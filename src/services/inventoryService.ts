import { getGraphClient } from './graphClient'
import type {
  FileInventoryItem,
  FileVersionDetail,
  LibraryInventory,
} from '../types'

/** Progress info passed back to the UI */
export interface InventoryProgress {
  phase: 'files' | 'versions' | 'done'
  message: string
  current: number
  total: number
}

/** Fetch the list of drives (libraries) for a site with quota info */
export async function fetchSiteDrives(
  siteId: string,
): Promise<Array<{ id: string; name: string; usedBytes: number; totalBytes: number }>> {
  const client = getGraphClient()
  const resp = await client
    .api(`/sites/${siteId}/drives`)
    .select('id,name,quota')
    .get()

  return (resp.value ?? []).map((d: Record<string, unknown>) => {
    const q = (d.quota ?? {}) as Record<string, number>
    return {
      id: d.id as string,
      name: (d.name as string) ?? 'Unnamed',
      usedBytes: q.used ?? 0,
      totalBytes: q.total ?? 0,
    }
  })
}

/** Scan a single library: enumerate all files and fetch their versions */
export async function scanLibrary(
  driveId: string,
  driveName: string,
  usedBytes: number,
  totalBytes: number,
  onProgress?: (p: InventoryProgress) => void,
): Promise<LibraryInventory> {
  const client = getGraphClient()
  const files: FileInventoryItem[] = []

  // Enumerate all files via delta
  try {
    let deltaLink: string | null = `/drives/${driveId}/root/delta`
    let pageCount = 0
    while (deltaLink) {
      const resp = await client.api(deltaLink).top(200).get()
      pageCount++

      for (const item of resp.value ?? []) {
        if (!item.file) continue

        const parentPath = item.parentReference?.path ?? ''
        const rootPrefix = `/drives/${driveId}/root:`
        const relativePath = parentPath.startsWith(rootPrefix)
          ? parentPath.slice(rootPrefix.length)
          : parentPath.split(':').pop() ?? ''

        files.push({
          id: item.id,
          driveId,
          libraryName: driveName,
          name: item.name ?? '',
          title: item.name ?? '',
          path: relativePath || '/',
          webUrl: item.webUrl ?? '',
          size: item.size ?? 0,
          createdDateTime: item.createdDateTime ?? '',
          createdBy: item.createdBy?.user?.displayName ?? 'Unknown',
          lastModifiedDateTime: item.lastModifiedDateTime ?? '',
          lastModifiedBy: item.lastModifiedBy?.user?.displayName ?? 'Unknown',
          versionLabel: '',
          versions: [],
        })
      }

      onProgress?.({
        phase: 'files',
        message: `${driveName}: ${files.length} files found (page ${pageCount})`,
        current: 0,
        total: 0,
      })

      deltaLink = resp['@odata.nextLink']
        ? resp['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
        : null
    }
  } catch (err) {
    console.warn(`[Inventory] Failed to enumerate drive ${driveName}`, err)
  }

  // Fetch versions for each file
  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi]
    onProgress?.({
      phase: 'versions',
      message: `${driveName}: fetching versions ${fi + 1} / ${files.length}`,
      current: fi + 1,
      total: files.length,
    })

    try {
      const versionsResp = await client
        .api(`/drives/${driveId}/items/${file.id}/versions`)
        .select('id,lastModifiedDateTime,lastModifiedBy,size')
        .top(100)
        .get()

      const versions: FileVersionDetail[] = []
      for (const v of versionsResp.value ?? []) {
        versions.push({
          versionId: v.id ?? '',
          versionLabel: v.id ?? '',
          size: v.size ?? 0,
          lastModifiedDateTime: v.lastModifiedDateTime ?? '',
          lastModifiedBy: v.lastModifiedBy?.user?.displayName ?? 'Unknown',
        })
      }
      file.versions = versions
      if (versions.length > 0) {
        file.versionLabel = versions[0].versionLabel
      }
    } catch {
      // Versions may not be accessible
    }
  }

  onProgress?.({ phase: 'done', message: `${driveName}: complete`, current: files.length, total: files.length })

  return { driveId, driveName, usedBytes, totalBytes, files }
}
