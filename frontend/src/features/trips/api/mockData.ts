import type { TripCard, TripSummary } from "../types";

// MOCK DATA: example content from the Figma design. Replace by switching tripsService to the http implementation.
// The Puglia example is no longer a journey: it is one of the Explore sample trips (features/explore/api/sampleTrips).

export const mockTrips: TripSummary[] = [
  { id: "patagonia", title: "Hiking in Patagonia", country: "Chile", budgetUsd: 4800 },
  { id: "tokyo", title: "Tokyo food weekend", country: "Japan", budgetUsd: 2700 },
  { id: "mexico-city", title: "Mexico City with friends", country: "Mexico", budgetUsd: 1900 },
];

/** Cards for the My trips screen. */
export const mockTripCards: TripCard[] = [
  {
    id: "patagonia",
    title: "Hiking in Patagonia",
    place: "Chile",
    dates: "Oct 4–13",
    status: "In progress",
    imageUrl: "https://images.unsplash.com/photo-1784583855764-55b2e78e32fb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=900",
  },
  {
    id: "tokyo",
    title: "Tokyo food weekend",
    place: "Japan",
    dates: "Nov 7–11",
    status: "Idea",
    imageUrl: "https://images.unsplash.com/photo-1774264489676-fce603d45068?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=900",
  },
];
