import type { DriveDraft, DrivePlan, DriveStop, LatLng, PlanItem } from "../types"

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
  /** False for the quick route-only answer. */
  complete?: boolean
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// The public map servers can take a while on a first search; give up well after they would.
const TIMEOUT_MS = 90_000

export function planRequest(draft: DriveDraft, includePlaces = true) {
  return {
    include_places: includePlaces,
    start: draft.start.trim(),
    destination: draft.destination.trim(),
    interests: draft.interests,
    // Whole minutes, within what the backend accepts (0-600, like the Trip setup field).
    detour_budget_minutes: Math.min(600, Math.max(0, Math.round(draft.detourBudget || 0))),
    // The form allows "Flexible"; only a real date is sent.
    departure_date: ISO_DATE.test(draft.departureDate.trim()) ? draft.departureDate.trim() : null,
    max_miles_per_day: draft.maxMilesPerDay,
    // Left out when not filled in (0), so the backend uses its default instead of refusing.
    ...(draft.mpg > 0 ? { mpg: draft.mpg } : {}),
    ...(draft.gasPrice > 0 ? { gas_price: draft.gasPrice } : {}),
  }
}

function shortName(name: string) {
  return name.split(",")[0].trim()
}

function toStop(stop: PlannedStop): DriveStop {
  return {
    id: stop.id,
    name: stop.name,
    category: stop.category,
    reason: stop.reason,
    detourMinutes: stop.detour_minutes,
    gasCost: stop.gas_cost_usd,
    visitMinutes: stop.visit_minutes,
    interests: stop.interests,
    lat: stop.lat,
    lng: stop.lng,
    // The map's Google Maps link uses the address when there is one, else the town.
    address: stop.address ?? (stop.town ?? undefined),
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

/** The backend's answer in the shape the drive tab draws (DrivePlan in ../types). */
export function toDrivePlan(response: TripPlanResponse, draft: DriveDraft): DrivePlan {
  const path = response.route.path.map(([lat, lng]) => [lat, lng] as LatLng)
  const first = path[0] ?? ([0, 0] as LatLng)
  const last = path[path.length - 1] ?? first
  // Chosen stops first in route order, then the alternatives, also in route order.
  const byMiles = (a: PlannedStop, b: PlannedStop) => a.miles_from_start - b.miles_from_start
  return {
    route: {
      origin: { name: shortName(draft.start), lat: first[0], lng: first[1] },
      destination: { name: shortName(draft.destination), lat: last[0], lng: last[1] },
      path,
      distanceMiles: response.route.miles,
      baseMinutes: Math.round(response.route.hours * 60),
    },
    stops: [...[...response.stops].sort(byMiles), ...[...response.more_stops].sort(byMiles)].map(toStop),
    // Community photos are not part of the planner yet; the demo's samples belong to its own route.
    discoveries: [],
    live: {
      chosenIds: response.stops.map((s) => s.id),
      itinerary: response.itinerary,
      notes: response.notes,
      pending: response.complete === false,
      response,
    },
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

/**
 * `includePlaces: false` asks for the route and driving days only, which comes back in a few
 * seconds, to show while the full plan (stops, meals, stays) is still being searched.
 */
export async function planTrip(draft: DriveDraft, fetcher: typeof fetch = fetch, includePlaces = true): Promise<DrivePlan> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetcher("/api/trips/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planRequest(draft, includePlaces)),
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
  return toDrivePlan((await response.json()) as TripPlanResponse, draft)
}
