// The Explore page's themes, from GET /api/explore/{theme}. Map lookups only, no AI.

export type ExploreThemeId = "river-towns" | "trailheads" | "historic-main-streets"

export type ExploreSpot = {
  id: string
  name: string
  /** What it is, e.g. "State park", "Riverfront", "State historic site". */
  kind: string
  /** "Boonville, MO", or the county when the place isn't in a town. */
  town: string | null
  lat: number
  lng: number
  drive_miles: number
  drive_minutes: number
  website_url: string | null
  wikipedia_url: string | null
  /** The OpenStreetMap record. */
  source_url: string
}

export type ExploreResult = {
  theme: ExploreThemeId
  title: string
  tags: string
  origin: { name: string; lat: number; lng: number }
  max_hours: number
  spots: ExploreSpot[]
}

export type ExploreRoute = {
  miles: number
  minutes: number
  /** [lat, lng] points, start to spot. */
  path: [number, number][]
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(typeof body?.detail === "string" ? body.detail : "Roam couldn't load these places right now.")
  }
  return response.json() as Promise<T>
}

export function fetchExplore(theme: ExploreThemeId, origin: string, maxHours: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ origin, max_hours: String(maxHours) })
  return getJson<ExploreResult>(`/api/explore/${theme}?${query}`, signal)
}

export function fetchExploreRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }, signal?: AbortSignal) {
  const query = new URLSearchParams({
    from_lat: String(from.lat), from_lng: String(from.lng), to_lat: String(to.lat), to_lng: String(to.lng),
  })
  return getJson<ExploreRoute>(`/api/explore/route?${query}`, signal)
}
