import { getGraphClient } from './graphClient'
import type {
  FileInventoryItem,
  FileVersionDetail,
  LibraryInventory,
  SiteFileInventory,
} from '../types'

// ─── Fetch full file inventory for a site ─────────────────────────────────────

export async function fetchSiteFileInventory(
  siteId: string,
  siteName: string,
  onProgress?: (msg: string) => void,
): Promise<SiteFileInventory> {
  const client = getGraphClient()

  // Get all drives
  onProgress?.('Fetching document libraries...')
  const drivesResp = await client
    .api(`/sites/${siteId}/drives`)
    .select('id,name,quota')
    .get()

  const libraries: LibraryInventory[] = []

  for (const drive of drivesResp.value ?? []) {
    const driveName = drive.name ?? 'Unnamed'
    onProgress?.(`Scanning library: ${driveName}...`)

    const q = drive.quota ?? {}
    const files: FileInventoryItem[] = []

    // Use delta to enumerate all items in the drive
    try {
      let deltaLink: string | null = `/drives/${drive.id}/root/delta`
      while (deltaLink) {
        const resp = await client.api(deltaLink).top(200).get()

        for (const item of resp.value ?? []) {
          // Only process files (skip folders)
          if (!item.file) continue

          const parentPath = item.parentReference?.path ?? ''
          // Strip the drive root prefix to get the relative path
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

        deltaLink = resp['@odata.nextLink']
          ? resp['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
          : null
      }
    } catch (err) {
      console.warn(`[Inventory] Failed to enumerate drive ${driveName}`, err)
    }

    // Fetch versions for each file
    onProgress?.(`Fetching versions for ${files.length} files in ${driveName}...`)
    for (const file of files) {
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
        // Set the current version label from the first version (most recent)
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

  return {
    siteId,
    siteName,
    libraries,
    lastScanned: new Date().toISOString(),
  }
}
