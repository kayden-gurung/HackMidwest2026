import type { DriveRoute, DriveStop, LatLng } from "../types"

/** A stop can be drawn only when the lookup gave it a location. */
export function hasCoordinates(
  stop: DriveStop,
): stop is DriveStop & { lat: number; lng: number } {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
}

/** Links come from the backend, so only plain web links are ever rendered. */
export function safeWebUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : undefined
  } catch {
    return undefined
  }
}

// Google's documented URL scheme: opens Google Maps for free, no API key.
const MAPS = "https://www.google.com/maps"

/** The stop on Google Maps. Uses the name and town when known, else the exact coordinates. */
export function googleMapsPlaceUrl(stop: DriveStop): string | undefined {
  const query = stop.address
    ? stop.address.toLowerCase().includes(stop.name.toLowerCase())
      ? stop.address
      : `${stop.name}, ${stop.address}`
    : hasCoordinates(stop)
      ? `${stop.lat},${stop.lng}`
      : undefined
  return query
    ? `${MAPS}/search/?api=1&query=${encodeURIComponent(query)}`
    : undefined
}

/** Index of the route vertex closest to the point, so stops can be put in driving order. */
function nearestPathIndex(path: LatLng[], lat: number, lng: number): number {
  const scale = Math.cos((lat * Math.PI) / 180)
  let best = 0
  let bestDistance = Infinity
  path.forEach(([pathLat, pathLng], index) => {
    const distance = (pathLat - lat) ** 2 + ((pathLng - lng) * scale) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/** The stops that can be drawn, ordered from the start of the route to the end. */
export function inDriveOrder(
  stops: DriveStop[],
  route: DriveRoute,
): (DriveStop & { lat: number; lng: number })[] {
  return stops
    .filter(hasCoordinates)
    .map((stop) => ({
      stop,
      at: nearestPathIndex(route.path, stop.lat, stop.lng),
    }))
    .sort((a, b) => a.at - b.at)
    .map(({ stop }) => stop)
}

// Google Maps accepts at most nine waypoints in a link.
const MAX_WAYPOINTS = 9

/** The whole drive on Google Maps, with each added stop as a waypoint in driving order. */
export function googleMapsDirectionsUrl(
  route: DriveRoute,
  stops: DriveStop[],
): string {
  const point = (place: { lat: number; lng: number }) =>
    `${place.lat},${place.lng}`
  const params = new URLSearchParams({
    api: "1",
    origin: point(route.origin),
    destination: point(route.destination),
    travelmode: "driving",
  })
  const waypoints = inDriveOrder(stops, route)
    .slice(0, MAX_WAYPOINTS)
    .map(point)
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"))
  return `${MAPS}/dir/?${params.toString()}`
}
