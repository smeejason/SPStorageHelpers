import { getGraphClient } from './graphClient'
import type { DashboardCache } from '../types'

// ─── Config ───────────────────────────────────────────────────────────────────

const SP_SITE_ID = import.meta.env.VITE_SP_SITE_ID ?? ''
const SP_LIST_ID = import.meta.env.VITE_SP_LIST_ID ?? ''
const CACHE_TITLE = 'DashboardCache'

function listItemsApi(): string {
  return `/sites/${SP_SITE_ID}/lists/${SP_LIST_ID}/items`
}

// ─── Detect column internal name ──────────────────────────────────────────────

let _siteDataColumn: string | null = null

/** Discover the internal name of the SiteData column from the list schema */
async function getSiteDataColumnName(): Promise<string> {
  if (_siteDataColumn) return _siteDataColumn

  const client = getGraphClient()
  try {
    const response = await client
      .api(`/sites/${SP_SITE_ID}/lists/${SP_LIST_ID}/columns`)
      .select('name,displayName')
      .get()

    console.log('[Cache] List columns:', (response.value ?? []).map(
      (c: { name: string; displayName: string }) => `${c.displayName} → ${c.name}`
    ))

    // Find the column by display name (case-insensitive)
    for (const col of response.value ?? []) {
      if ((col.displayName as string).toLowerCase() === 'sitedata') {
        _siteDataColumn = col.name as string
        console.log('[Cache] SiteData column internal name:', _siteDataColumn)
        return _siteDataColumn
      }
    }
  } catch (err) {
    console.warn('[Cache] Could not read list columns', err)
  }

  // Fallback — try common variants
  _siteDataColumn = 'SiteData'
  return _siteDataColumn
}

// ─── Find cache item ──────────────────────────────────────────────────────────

async function findCacheItem(): Promise<{ id: string; siteData: string | null } | null> {
  const client = getGraphClient()
  const colName = await getSiteDataColumnName()

  const response = await client
    .api(listItemsApi())
    .expand('fields')
    .top(50)
    .get()

  for (const item of response.value ?? []) {
    if (item.fields?.Title === CACHE_TITLE) {
      return { id: item.id, siteData: item.fields[colName] ?? null }
    }
  }
  return null
}

// ─── Read cache ───────────────────────────────────────────────────────────────

export async function loadDashboardCache(): Promise<DashboardCache | null> {
  if (!SP_SITE_ID || !SP_LIST_ID) {
    console.warn('[Cache] VITE_SP_SITE_ID or VITE_SP_LIST_ID not configured')
    return null
  }

  console.log('[Cache] Using site:', SP_SITE_ID, 'list:', SP_LIST_ID)

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

export async function saveDashboardCache(cache: DashboardCache): Promise<void> {
  if (!SP_SITE_ID || !SP_LIST_ID) {
    console.warn('[Cache] VITE_SP_SITE_ID or VITE_SP_LIST_ID not configured — skipping save')
    return
  }

  const client = getGraphClient()
  const colName = await getSiteDataColumnName()
  const siteDataJson = JSON.stringify(cache)

  try {
    const existing = await findCacheItem()

    if (existing) {
      await client
        .api(`${listItemsApi()}/${existing.id}/fields`)
        .patch({ [colName]: siteDataJson })
      console.log('[Cache] Updated dashboard cache')
    } else {
      await client
        .api(listItemsApi())
        .post({
          fields: {
            Title: CACHE_TITLE,
            [colName]: siteDataJson,
          },
        })
      console.log('[Cache] Created dashboard cache item')
    }
  } catch (err) {
    console.error('[Cache] Failed to save dashboard cache', err)
    throw err
  }
}
