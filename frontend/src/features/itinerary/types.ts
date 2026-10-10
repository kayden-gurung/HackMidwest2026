/** Data contracts for the itinerary feature (the right-hand Plan / Map / Budget panel). Dates are ISO "YYYY-MM-DD". */

export type DayAccent = "blue" | "yellow" | "green" | "coral";

export interface ItineraryDay {
  date: string;
  title: string;
  detail: string;
  accent: DayAccent;
}

export type Place =
  | { id: string; kind: "stay"; name: string; pricePerNightUsd: number; rating: number }
  | { id: string; kind: "restaurant"; name: string; cuisine: string; rating: number };

export type BudgetCategory = "Flights" | "Stays" | "Food" | "Activities";

export interface BudgetLine {
  category: BudgetCategory;
  amountUsd: number;
}

export interface Itinerary {
  tripId: string;
  startDate: string;
  endDate: string;
  /** Highlighted days shown in the Plan tab. */
  days: ItineraryDay[];
  places: Place[];
  budget: { plannedUsd: number; lines: BudgetLine[] };
  route: { regionLabel: string; stops: string[] };
}
