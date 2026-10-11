import type { DriveDraft, DriveStop } from "../types"

/*
 * The first plan for a drive, from the backend's route planner (POST /api/trips/plan).
 * It is built in code with no AI, from OpenStreetMap and OSRM; see docs/ROUTE_PLANNER.md.
 */

/** One stop as the backend sends it (backend/tools/route_search.py RouteStop). */
export type PlannedStop = {
  id: string
  name: string
  town: string | null
  interests: string[]
  category: string
  kind: string
  reason: string
  lat: number
  lng: number
  address: string | null
  website_url: string | null
  source_urls: string[]
  miles_from_start: number
  detour_minutes: number
  detour_miles: number
  gas_cost_usd: number
  detour_estimated: boolean
  visit_minutes: number
  less_explored: boolean
}

export type PlanItem = {
  id: string
  date: string
  time: string | null
  title: string
  description: string | null
  category: "Driving" | "Stays" | "Food" | "Activities"
  sourceUrls: string[]
  websiteUrl: string | null
}

export type TripPlanResponse = {
  itinerary: { startDate: string; endDate: string; items: PlanItem[]; summary: string; assumptions: string[] }
  route: {
    origin: string
    destination: string
    miles: number
    hours: number
    fuel_cost_usd: number
    summary: string
    google_maps_url: string
    route_index: number
    route_count: number
    path: number[][]
  }
  stops: PlannedStop[]
  more_stops: PlannedStop[]
  detour_minutes_used: number
  notes: string[]
}

export type MapPoint = { x: number; y: number; label: string }

/** What the Drive screen needs, with every position already placed on its 0-100 map. */
export type LiveDrive = {
  id: string
  stops: DriveStop[]
  /** The stops the planner put in the plan; the rest are alternatives to add. */
  chosenIds: string[]
  start: MapPoint
  end: MapPoint
  /** SVG path for the route, in the map's 0-100 coordinates. */
  routePath: string
  route: TripPlanResponse["route"]
  itinerary: TripPlanResponse["itinerary"]
  notes: string[]
  /** The full response, kept to hand to the chat as current_itinerary later. */
  response: TripPlanResponse
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// The public map servers can take a while on a first search; give up well after they would.
const TIMEOUT_MS = 90_000
const MAP_PADDING = 8
const MAX_PATH_POINTS = 200

export function planRequest(draft: DriveDraft) {
  return {
    start: draft.start.trim(),
    destination: draft.destination.trim(),
    interests: draft.interests,
    detour_budget_minutes: draft.detourBudget,
    // The form allows "Flexible"; only a real date is sent.
    departure_date: ISO_DATE.test(draft.departureDate.trim()) ? draft.departureDate.trim() : null,
    max_miles_per_day: draft.maxMilesPerDay,
    mpg: draft.mpg,
    gas_price: draft.gasPrice,
  }
}

function shortName(name: string) {
  return name.split(",")[0].trim()
}

/** Places [lat, lng] points on the 0-100 map: north up, the route filling the map with a margin. */
function projector(points: number[][]) {
  const lats = points.map(([lat]) => lat)
  const lngs = points.map(([, lng]) => lng)
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const usable = 100 - 2 * MAP_PADDING
  // Keep a little height for a mostly east-west drive, so it is not a flat line.
  const latSpan = Math.max(maxLat - minLat, (maxLng - minLng) * 0.25, 0.01)
  const lngSpan = Math.max(maxLng - minLng, (maxLat - minLat) * 0.25, 0.01)
  const midLat = (minLat + maxLat) / 2
  const midLng = (minLng + maxLng) / 2
  return (lat: number, lng: number) => ({
    x: Math.round((50 + ((lng - midLng) / lngSpan) * usable) * 10) / 10,
    y: Math.round((50 - ((lat - midLat) / latSpan) * usable) * 10) / 10,
  })
}

function toStop(stop: PlannedStop, place: (lat: number, lng: number) => { x: number; y: number }): DriveStop {
  return {
    id: stop.id,
    name: stop.name,
    category: stop.category,
    reason: stop.reason,
    detourMinutes: stop.detour_minutes,
    gasCost: stop.gas_cost_usd,
    visitMinutes: stop.visit_minutes,
    interests: stop.interests,
    ...place(stop.lat, stop.lng),
    lookup: "live",
    sourceLabel: "OpenStreetMap",
    sourceUrl: stop.source_urls[0],
    lessExplored: stop.less_explored,
    learned: "",
    town: stop.town ?? undefined,
    milesFromStart: stop.miles_from_start,
    detourEstimated: stop.detour_estimated,
    websiteUrl: stop.website_url ?? undefined,
  }
}

export function toLiveDrive(response: TripPlanResponse, draft: DriveDraft): LiveDrive {
  const path = response.route.path
  const everything = [...path, ...[...response.stops, ...response.more_stops].map((s) => [s.lat, s.lng])]
  const place = projector(everything.length ? everything : [[0, 0]])
  const stride = Math.max(1, Math.ceil(path.length / MAX_PATH_POINTS))
  const thinned = path.filter((_, i) => i % stride === 0 || i === path.length - 1).map(([lat, lng]) => place(lat, lng))
  const routePath = thinned.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")
  const first = path[0] ? place(path[0][0], path[0][1]) : { x: MAP_PADDING, y: 50 }
  const last = path.length ? place(path[path.length - 1][0], path[path.length - 1][1]) : { x: 100 - MAP_PADDING, y: 50 }
  // Chosen stops first in route order, then the alternatives, also in route order.
  const byMiles = (a: PlannedStop, b: PlannedStop) => a.miles_from_start - b.miles_from_start
  const stops = [...[...response.stops].sort(byMiles), ...[...response.more_stops].sort(byMiles)].map((s) => toStop(s, place))
  return {
    id: `${draft.start}→${draft.destination}@${Date.now()}`,
    stops,
    chosenIds: response.stops.map((s) => s.id),
    start: { ...first, label: shortName(draft.start) },
    end: { ...last, label: shortName(draft.destination) },
    routePath,
    route: response.route,
    itinerary: response.itinerary,
    notes: response.notes,
    response,
  }
}

async function errorMessage(response: Response) {
  let detail = ""
  let fromBackend = false
  try {
    const body = await response.json()
    fromBackend = true
    detail = typeof body?.detail === "string" ? body.detail : ""
  } catch {
    // Not JSON: the dev proxy's own error page when the backend is down, or a crash page.
  }
  if (!fromBackend && response.status >= 500)
    return `The Roam backend didn't answer (error ${response.status}). Check that Docker is running and the backend is up, then try again.`
  if (response.status === 404) return detail || "No driving route was found between those places. Check the spelling of both cities."
  if (response.status === 422) return "Check the starting city and destination, then try again."
  if (response.status === 503) return "The free map servers are busy or not responding. Wait a moment and try again."
  return detail || `The planner had a problem (error ${response.status}). Try again.`
}

export async function planTrip(draft: DriveDraft, fetcher: typeof fetch = fetch): Promise<LiveDrive> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetcher("/api/trips/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planRequest(draft)),
      signal: controller.signal,
    })
  } catch (error) {
    throw new Error(
      (error as Error)?.name === "AbortError"
        ? "The map servers took too long to answer. Try again, or try a shorter drive."
        : "Can't reach the Roam backend. Check that Docker is running.",
    )
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new Error(await errorMessage(response))
  return toLiveDrive((await response.json()) as TripPlanResponse, draft)
}
