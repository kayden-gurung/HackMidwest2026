export type AppScreen = "dashboard" | "setup" | "drive" | "explore" | "settings"


export type DriveDraft = {
  start: string
  destination: string
  interests: string[]
  // Extra driving minutes for detours: 15-120 on the slider, or any typed amount up to 600.
  detourBudget: number
  departureDate: string
  maxMilesPerDay: number
}

export type DriveStop = {
  id: string
  name: string
  category: string
  reason: string
  detourMinutes: number
  gasCost: number
  visitMinutes: number
  image?: string
  interests: string[]
  // Where the place is. Optional so a stop whose lookup came back without a location still
  // lists normally; it just isn't drawn on the map.
  lat?: number
  lng?: number
  // Street address or "Town, ST". Used to make the Google Maps link when it's present.
  address?: string
  /** "live": found by the route planner from OpenStreetMap; the others are demo states. */
  lookup: "demo" | "pending" | "failed" | "live"
  sourceLabel: string
  sourceUrl?: string
  town?: string
  milesFromStart?: number
  /** True when the routing service could not measure the detour and it was estimated from distance. */
  detourEstimated?: boolean
  websiteUrl?: string
  lessExplored?: boolean
  learned: string
}

// A point on the map, in degrees.
export type LatLng = [lat: number, lng: number]

export type RoutePlace = {
  name: string
  lat: number
  lng: number
}

// The base drive before any stops are added.
export type DriveRoute = {
  origin: RoutePlace
  destination: RoutePlace
  // The road line from origin to destination, in drive order.
  path: LatLng[]
  distanceMiles: number
  // Driving time with no detours.
  baseMinutes: number
}

// One line of the plan's day-by-day list (backend ItinerarySnapshot items).
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

// What only a plan from the backend's route planner has (docs/ROUTE_PLANNER.md).
export type LivePlanDetails = {
  // The stops the planner put in the plan; the rest are alternatives to add.
  chosenIds: string[]
  // Each day's drive, stops, lunch and overnight stay.
  itinerary: { startDate: string; endDate: string; items: PlanItem[]; summary: string; assumptions: string[] }
  // Anything the traveler should know, e.g. live place data was unavailable.
  notes: string[]
  // True while only the route is known and the stops are still being searched.
  pending: boolean
  // The backend's full answer, to hand to the chat as current_itinerary later.
  response: unknown
}

// Everything the drive tab shows for one request. The backend fills this in.
export type DrivePlan = {
  route: DriveRoute
  stops: DriveStop[]
  discoveries: CommunityDiscovery[]
  // Present for a plan from the route planner; absent for the cached demo.
  live?: LivePlanDetails
}

export type CommunityDiscovery = {
  id: string
  place: string
  caption: string
  image: string
  lat: number
  lng: number
  // How many people have pinned this place. The map shows it as a badge.
  count: number
  sample?: boolean
}

export type TripSummary = {
  id: string
  title: string
  route: string
  date: string
  status: string
  image: string
}
