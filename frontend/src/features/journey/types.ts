/** Data contracts for the New journey feature. */

/** Everything the traveler chose on the New journey screen, handed to the planner by "Find my trip". */
export interface JourneyRequest {
  /** Free text: a place or a feeling, e.g. "A warm, low-key beach week with incredible food". May be empty. */
  prompt: string;
  vibe: string;
  budgetUsd: number;
  flexibleDates: boolean;
  /** Display label for the chosen dates when not flexible, e.g. "Jun 18–25". */
  fixedDates: string;
  /** Departure airport, e.g. "New York · JFK". */
  origin: string;
  travelers: number;
}
