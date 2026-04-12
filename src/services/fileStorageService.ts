import { getGraphClient } from './graphClient'
import type { SiteAnalysisData } from '../types'

// ─── Config ───────────────────────────────────────────────────────────────────

const SP_SITE_ID = import.meta.env.VITE_SP_SITE_ID ?? ''
const FOLDER_PATH = 'SPStorage'

// ─── Ensure folder exists ─────────────────────────────────────────────────────

let folderChecked = false

async function ensureFolder(): Promise<void> {
  if (folderChecked) return
  const client = getGraphClient()

  try {
    await client
      .api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}`)
      .get()
    folderChecked = true
  } catch {
    // Folder doesn't exist — create it
    await client
      .api(`/sites/${SP_SITE_ID}/drive/root/children`)
      .post({
        name: FOLDER_PATH,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      })
    folderChecked = true
    console.log('[FileStorage] Created SPStorage folder')
  }
}

// ─── File name helper ─────────────────────────────────────────────────────────

/** Build a safe file name from a site ID (replace commas with underscores) */
function siteFileName(siteId: string): string {
  return `${siteId.replace(/,/g, '_')}.json`
}

// ─── Read analysis ────────────────────────────────────────────────────────────

/** Load cached site analysis from Documents/SPStorage/{siteId}.json */
export async function loadSiteAnalysis(siteId: string): Promise<SiteAnalysisData | null> {
  if (!SP_SITE_ID) return null

  const client = getGraphClient()
  const fileName = siteFileName(siteId)

  try {
    const response = await client
      .api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}/${fileName}:/content`)
      .get()

    // Response is the JSON content
    const data = (typeof response === 'string' ? JSON.parse(response) : response) as SiteAnalysisData
    console.log('[FileStorage] Loaded analysis for', data.siteName, 'from', data.lastAnalysed)
    return data
  } catch {
    // File doesn't exist yet
    return null
  }
}

// ─── Write analysis ───────────────────────────────────────────────────────────

/** Save site analysis to Documents/SPStorage/{siteId}.json */
export async function saveSiteAnalysis(data: SiteAnalysisData): Promise<void> {
  if (!SP_SITE_ID) {
    console.warn('[FileStorage] VITE_SP_SITE_ID not configured — skipping save')
    return
  }

  const client = getGraphClient()
  await ensureFolder()

  const fileName = siteFileName(data.siteId)
  const content = JSON.stringify(data, null, 2)

  try {
    await client
      .api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}/${fileName}:/content`)
      .put(content)
    console.log('[FileStorage] Saved analysis for', data.siteName)
  } catch (err) {
    console.error('[FileStorage] Failed to save analysis', err)
    throw err
  }
}

// ─── List all cached analyses ─────────────────────────────────────────────────

/** List all cached site analysis files */
export async function listCachedAnalyses(): Promise<Array<{ siteId: string; fileName: string; lastModified: string }>> {
  if (!SP_SITE_ID) return []

  const client = getGraphClient()

  try {
    const response = await client
      .api(`/sites/${SP_SITE_ID}/drive/root:/${FOLDER_PATH}:/children`)
      .select('name,lastModifiedDateTime')
      .filter("name ne '.gitkeep'")
      .get()

    return (response.value ?? [])
      .filter((item: { name: string }) => item.name.endsWith('.json'))
      .map((item: { name: string; lastModifiedDateTime: string }) => ({
        siteId: item.name.replace('.json', '').replace(/_/g, ','),
        fileName: item.name,
        lastModified: item.lastModifiedDateTime,
      }))
  } catch {
    return []
  }
}
