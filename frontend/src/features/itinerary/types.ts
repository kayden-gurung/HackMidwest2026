/**
 * Data contracts for the itinerary feature (the right-hand Plan / Map / Budget panel).
 * Dates are ISO "YYYY-MM-DD". Times are 24-hour "HH:MM" in the destination's local time.
 *
 * The backend only has to send `startDate`, `endDate`, `items` and `budget.plannedUsd`.
 * Day titles, budget totals per category and map markers are all worked out from `items`.
 */

export type DayAccent = "blue" | "yellow" | "green" | "coral";

/** Optional headline for one day. Days without one are titled from their items. */
export interface ItineraryDay {
  date: string;
  title: string;
  detail: string;
  accent?: DayAccent;
}

/** "Driving" covers fuel, car hire, tolls and parking on a road trip. */
export type BudgetCategory = "Flights" | "Driving" | "Stays" | "Food" | "Activities";

export interface ItemLocation {
  /** What to search for in Google Maps, e.g. "Grotta Palazzese". */
  name: string;
  address?: string;
  /** Both are needed for the item to get a marker on the Map tab. */
  lat?: number;
  lng?: number;
}

/** One bookable or visitable thing in the trip: a flight, a stay, a meal or an activity. */
export interface ItineraryItem {
  id: string;
  /** The day it happens. For a stay, the check-in day. */
  date: string;
  time?: string;
  title: string;
  description?: string;
  /** Which Budget section the cost is counted under. */
  category: BudgetCategory;
  /** Estimated total for all travelers, in USD. Null means unknown; 0 means free. */
  costUsd: number | null;
  location?: ItemLocation;
  /** The place's own website. Only http(s) links are shown. */
  websiteUrl?: string;
  /** Where the facts came from (tool results). Shown as "Source" links. */
  sourceUrls?: string[];
}

/** A highlighted stay or restaurant card in the Plan tab. Optional extra, not needed for the core flow. */
export type Place =
  | { id: string; kind: "stay"; name: string; pricePerNightUsd: number; rating: number }
  | { id: string; kind: "restaurant"; name: string; cuisine: string; rating: number };

/** Optional cover metadata for the trip's chat postcard. */
export interface TripOverview {
  destination: string;
  headline?: string | null;
  pace?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
}

export interface Itinerary {
  tripId: string;
  startDate: string;
  endDate: string;
  items: ItineraryItem[];
  budget: { plannedUsd: number | null };
  summary?: string;
  assumptions?: string[];
  overview?: TripOverview | null;
  days?: ItineraryDay[];
  places?: Place[];
}

/** Structured plan sent with chat, without the browser's journey ID or demo extras. */
export type ItinerarySnapshot = Pick<Itinerary, "startDate" | "endDate" | "items" | "budget" | "summary" | "assumptions" | "overview">;
