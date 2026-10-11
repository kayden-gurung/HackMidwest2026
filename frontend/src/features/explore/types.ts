/** Data contracts for the Explore feature. */
import type { ChatMessage } from "../chat/types";
import type { Itinerary } from "../itinerary/types";
import type { TripDetails, TripSummary } from "../trips/types";

export type ExploreTag = "Beach" | "Food" | "Outdoors" | "Culture";

/** A suggested destination on the Explore screen. */
export interface DestinationIdea {
  /** Matches the id of the sample trip it opens. */
  id: string;
  /** Short theme, e.g. "Coastal quiet". */
  title: string;
  place: string;
  /** What the sample trip costs in total, flights included. Used by the "Under $2,500" filter. */
  fromPriceUsd: number;
  days: number;
  /** How many people `fromPriceUsd` covers. */
  travelers: number;
  tags: ExploreTag[];
  imageUrl: string;
}

/**
 * A premade trip behind an Explore card: the same chat, plan, map and budget a planned journey
 * has, but not listed under "Recent journeys". Its ids are shared by the chat, itinerary and
 * trips stores, so opening the card opens this trip in the planner.
 */
export interface SampleTrip {
  id: string;
  idea: DestinationIdea;
  summary: TripSummary;
  details: TripDetails;
  conversation: ChatMessage[];
  itinerary: Itinerary;
}
