import type { Itinerary } from "../types";

// MOCK DATA: example itinerary from the Figma design.

export const mockItineraries: Record<string, Itinerary> = {
  puglia: {
    tripId: "puglia",
    startDate: "2029-06-18",
    endDate: "2029-06-25",
    days: [
      { date: "2029-06-18", title: "Arrive in Bari", detail: "Check in · Old Town walk", accent: "blue" },
      { date: "2029-06-19", title: "Polignano coast", detail: "Beach · Cave boat tour", accent: "yellow" },
      { date: "2029-06-20", title: "Alberobello", detail: "Trulli · Farm lunch", accent: "green" },
      { date: "2029-06-21", title: "Slow day", detail: "Market · Dinner at Grotta", accent: "coral" },
    ],
    places: [
      { id: "masseria-le-torri", kind: "stay", name: "Masseria Le Torri", pricePerNightUsd: 174, rating: 4.8 },
      { id: "grotta-palazzese", kind: "restaurant", name: "Grotta Palazzese", cuisine: "Seafood", rating: 4.7 },
    ],
    budget: {
      plannedUsd: 3200,
      lines: [
        { category: "Flights", amountUsd: 1296 },
        { category: "Stays", amountUsd: 1044 },
        { category: "Food", amountUsd: 460 },
        { category: "Activities", amountUsd: 280 },
      ],
    },
    route: { regionLabel: "Adriatic Sea", stops: ["Bari", "Polignano a Mare", "Alberobello"] },
  },
};
