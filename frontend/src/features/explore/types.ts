/** Data contracts for the Explore feature. */

export type ExploreTag = "Beach" | "Food" | "Outdoors" | "Culture";

/** A suggested destination on the Explore screen. */
export interface DestinationIdea {
  id: string;
  /** Short theme, e.g. "Coastal quiet". */
  title: string;
  place: string;
  /** Starting price for the trip, used by the "Under $2,500" filter. */
  fromPriceUsd: number;
  days: number;
  tags: ExploreTag[];
  imageUrl: string;
}
