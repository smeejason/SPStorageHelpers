import { getGraphClient } from './graphClient'
import type { DashboardCache } from '../types'

// ─── Config ───────────────────────────────────────────────────────────────────

const SP_SITE_ID = import.meta.env.VITE_SP_SITE_ID ?? ''
const SP_LIST_ID = import.meta.env.VITE_SP_LIST_ID ?? ''
const CACHE_TITLE = 'DashboardCache'

function listItemsApi(): string {
  return `/sites/${SP_SITE_ID}/lists/${SP_LIST_ID}/items`
}

// ─── Find cache item ──────────────────────────────────────────────────────────

/** Fetch all list items and find the cache entry by title (avoids $filter index requirement) */
async function findCacheItem(): Promise<{ id: string; siteData: string | null } | null> {
  const client = getGraphClient()
  const response = await client
    .api(listItemsApi())
    .expand('fields($select=Title,SiteData)')
    .top(50)
    .get()

  for (const item of response.value ?? []) {
    if (item.fields?.Title === CACHE_TITLE) {
      return { id: item.id, siteData: item.fields.SiteData ?? null }
    }
  }
  return null
}

// ─── Read cache ───────────────────────────────────────────────────────────────

/** Load the cached dashboard data from the SP list. Returns null if not found. */
export async function loadDashboardCache(): Promise<DashboardCache | null> {
  if (!SP_SITE_ID || !SP_LIST_ID) {
    console.warn('[Cache] VITE_SP_SITE_ID or VITE_SP_LIST_ID not configured')
    return null
  }

  try {
    const item = await findCacheItem()
    if (!item?.siteData) return null

    const cache = JSON.parse(item.siteData) as DashboardCache
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
    const existing = await findCacheItem()

    if (existing) {
      // Update existing item
      await client
        .api(`${listItemsApi()}/${existing.id}/fields`)
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
