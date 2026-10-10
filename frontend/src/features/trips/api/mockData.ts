import type { TripDetails, TripSummary } from "../types";

// MOCK DATA: example content from the Figma design. Replace by switching tripsService to the http implementation.

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
