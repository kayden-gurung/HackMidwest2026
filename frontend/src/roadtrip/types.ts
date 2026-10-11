export type AppScreen = "dashboard" | "setup" | "drive" | "explore" | "settings"


export type DriveDraft = {
  start: string
  destination: string
  interests: string[]
  // Extra driving minutes for detours: 15-120 on the slider, or any typed amount up to 600.
  detourBudget: number
  departureDate: string
  maxMilesPerDay: number
  mpg: number
  gasPrice: number
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
  lookup: "demo" | "pending" | "failed"
  sourceLabel: string
  sourceUrl?: string
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

// Everything the drive tab shows for one request. The backend fills this in.
export type DrivePlan = {
  route: DriveRoute
  stops: DriveStop[]
  discoveries: CommunityDiscovery[]
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
