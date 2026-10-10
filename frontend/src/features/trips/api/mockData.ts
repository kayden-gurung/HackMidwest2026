import type { TripCard, TripDetails, TripSummary } from "../types";

// MOCK DATA: example content from the Figma design. Replace by switching tripsService to the http implementation.

/** The one fully built-out example journey, kept in the sidebar even with mocks off (config.showExample). */
export const EXAMPLE_TRIP_ID = "puglia";

export const mockTrips: TripSummary[] = [
  { id: "puglia", title: "A slow week in Puglia", country: "Italy", budgetUsd: 3200 },
  { id: "patagonia", title: "Hiking in Patagonia", country: "Chile", budgetUsd: 4800 },
  { id: "tokyo", title: "Tokyo food weekend", country: "Japan", budgetUsd: 2700 },
  { id: "mexico-city", title: "Mexico City with friends", country: "Mexico", budgetUsd: 1900 },
];

export const mockTripDetails: Record<string, TripDetails> = {
  puglia: {
    id: "puglia",
    title: "A slow week in Puglia",
    startDate: "2029-06-18",
    endDate: "2029-06-25",
    travelers: 2,
    origin: "New York",
  },
};

/** Cards for the My trips screen. */
export const mockTripCards: TripCard[] = [
  {
    id: "puglia",
    title: "A slow week in Puglia",
    place: "Italy",
    dates: "Jun 18–25",
    status: "Ready to book",
    imageUrl: "https://images.unsplash.com/photo-1770493967117-6ae3927c0d05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=900",
  },
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
