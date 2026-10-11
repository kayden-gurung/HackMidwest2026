export type AppScreen = "dashboard" | "setup" | "drive" | "explore" | "settings"


export type DriveDraft = {
  start: string
  destination: string
  interests: string[]
  detourBudget: 15 | 30 | 60 | 120
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
  x: number
  y: number
  /** "live": found by the route planner from OpenStreetMap; the others are demo states. */
  lookup: "demo" | "pending" | "failed" | "live"
  sourceLabel: string
  sourceUrl?: string
  lessExplored?: boolean
  learned: string
  town?: string
  milesFromStart?: number
  /** True when the routing service could not measure the detour and it was estimated from distance. */
  detourEstimated?: boolean
  websiteUrl?: string
}

export type CommunityDiscovery = {
  id: string
  place: string
  caption: string
  image: string
  x: number
  y: number
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
