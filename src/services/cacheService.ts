import { getGraphClient } from './graphClient'
import type { DashboardCache } from '../types'

// ─── Config ───────────────────────────────────────────────────────────────────

const SP_SITE_ID = import.meta.env.VITE_SP_SITE_ID ?? ''
const SP_LIST_ID = import.meta.env.VITE_SP_LIST_ID ?? ''
const CACHE_TITLE = 'DashboardCache'

function listItemsApi(): string {
  return `/sites/${SP_SITE_ID}/lists/${SP_LIST_ID}/items`
}

// ─── Read cache ───────────────────────────────────────────────────────────────

/** Load the cached dashboard data from the SP list. Returns null if not found. */
export async function loadDashboardCache(): Promise<DashboardCache | null> {
  if (!SP_SITE_ID || !SP_LIST_ID) {
    console.warn('[Cache] VITE_SP_SITE_ID or VITE_SP_LIST_ID not configured')
    return null
  }

  const client = getGraphClient()

  try {
    const response = await client
      .api(listItemsApi())
      .filter(`fields/Title eq '${CACHE_TITLE}'`)
      .expand('fields')
      .top(1)
      .get()

    const items = response.value ?? []
    if (items.length === 0) return null

    const siteDataJson = items[0].fields?.SiteData
    if (!siteDataJson) return null

    const cache = JSON.parse(siteDataJson) as DashboardCache
    console.log('[Cache] Loaded dashboard cache from', cache.lastRefreshed)
    return cache
  } catch (err) {
    console.warn('[Cache] Failed to load dashboard cache', err)
    return null
  }
}

// ─── Write cache ──────────────────────────────────────────────────────────────

/** Save dashboard data to the SP list. Creates or updates the cache item. */
export async function saveDashboardCache(cache: DashboardCache): Promise<void> {
  if (!SP_SITE_ID || !SP_LIST_ID) {
    console.warn('[Cache] VITE_SP_SITE_ID or VITE_SP_LIST_ID not configured — skipping save')
    return
  }

  const client = getGraphClient()
  const siteDataJson = JSON.stringify(cache)

  try {
    // Check if cache item already exists
    const response = await client
      .api(listItemsApi())
      .filter(`fields/Title eq '${CACHE_TITLE}'`)
      .expand('fields')
      .select('id')
      .top(1)
      .get()

    const items = response.value ?? []

    if (items.length > 0) {
      // Update existing item
      const itemId = items[0].id
      await client
        .api(`${listItemsApi()}/${itemId}/fields`)
        .patch({ SiteData: siteDataJson })
      console.log('[Cache] Updated dashboard cache')
    } else {
      // Create new item
      await client
        .api(listItemsApi())
        .post({
          fields: {
            Title: CACHE_TITLE,
            SiteData: siteDataJson,
          },
        })
      console.log('[Cache] Created dashboard cache item')
    }
  } catch (err) {
    console.error('[Cache] Failed to save dashboard cache', err)
    throw err
  }
}
