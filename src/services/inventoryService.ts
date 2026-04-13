import { getGraphClient } from './graphClient'
import type {
  FileInventoryItem,
  FileVersionDetail,
  LibraryInventory,
  SiteFileInventory,
} from '../types'

/** Progress info passed back to the UI */
export interface InventoryProgress {
  phase: 'libraries' | 'files' | 'versions' | 'done'
  message: string
  /** Current item index (0-based) */
  current: number
  /** Total items in this phase */
  total: number
}

// ─── Fetch full file inventory for a site ─────────────────────────────────────

export async function fetchSiteFileInventory(
  siteId: string,
  siteName: string,
  onProgress?: (p: InventoryProgress) => void,
): Promise<SiteFileInventory> {
  const client = getGraphClient()

  // Get all drives
  onProgress?.({ phase: 'libraries', message: 'Fetching document libraries...', current: 0, total: 0 })
  const drivesResp = await client
    .api(`/sites/${siteId}/drives`)
    .select('id,name,quota')
    .get()

  const driveList = drivesResp.value ?? []
  const libraries: LibraryInventory[] = []

  for (let di = 0; di < driveList.length; di++) {
    const drive = driveList[di]
    const driveName = drive.name ?? 'Unnamed'
    onProgress?.({
      phase: 'files',
      message: `Scanning library ${di + 1}/${driveList.length}: ${driveName}...`,
      current: di,
      total: driveList.length,
    })

    const q = drive.quota ?? {}
    const files: FileInventoryItem[] = []

    // Use delta to enumerate all items in the drive
    try {
      let deltaLink: string | null = `/drives/${drive.id}/root/delta`
      let pageCount = 0
      while (deltaLink) {
        const resp = await client.api(deltaLink).top(200).get()
        pageCount++

        for (const item of resp.value ?? []) {
          if (!item.file) continue

          const parentPath = item.parentReference?.path ?? ''
          const rootPrefix = `/drives/${drive.id}/root:`
          const relativePath = parentPath.startsWith(rootPrefix)
            ? parentPath.slice(rootPrefix.length)
            : parentPath.split(':').pop() ?? ''

          files.push({
            id: item.id,
            driveId: drive.id,
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
          message: `Scanning ${driveName}: ${files.length} files found (page ${pageCount})...`,
          current: di,
          total: driveList.length,
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
        current: fi,
        total: files.length,
      })

      try {
        const versionsResp = await client
          .api(`/drives/${drive.id}/items/${file.id}/versions`)
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
        // Versions may not be accessible for some files
      }
    }

    libraries.push({
      driveId: drive.id,
      driveName,
      usedBytes: q.used ?? 0,
      totalBytes: q.total ?? 0,
      files,
    })
  }

  onProgress?.({ phase: 'done', message: 'Analysis complete', current: 0, total: 0 })

  return {
    siteId,
    siteName,
    libraries,
    lastScanned: new Date().toISOString(),
  }
}
