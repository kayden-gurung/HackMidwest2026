export type TravelMode = "fly" | "drive"
export type AppScreen = "dashboard" | "setup" | "fly" | "drive" | "explore" | "settings"

export type FlyDraft = {
  departure: string
  destination: string
  dates: string
  travelers: number
  budget: number
  interests: string[]
  pace: string
}

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
  lookup: "demo" | "pending" | "failed"
  sourceLabel: string
  sourceUrl?: string
  lessExplored?: boolean
  learned: string
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
  mode: TravelMode
  title: string
  route: string
  date: string
  status: string
  image: string
}
