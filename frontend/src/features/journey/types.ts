/** Data contracts for the New journey feature. */

/** A trip window picked on the calendar. Dates are "YYYY-MM-DD"; a one-day trip has start === end. */
export interface DateRange {
  start: string;
  end: string;
}

/** Everything the traveler chose on the New journey screen, handed to the planner by "Find my trip". */
export interface JourneyRequest {
  /** Free text: a place or a feeling, e.g. "A warm, low-key beach week with incredible food". May be empty. */
  prompt: string;
  vibe: string;
  /** Whole-dollar total for all travelers, or null when the traveler left it blank (no budget limit). */
  budgetUsd: number | null;
  /** The chosen trip window, or null when the traveler's dates are flexible. */
  dates: DateRange | null;
  /** Where the trip starts: any free-text place, e.g. "New York · JFK" or "Omaha, NE". May be empty. */
  origin: string;
  /**
   * True when the traveler wants to drive rather than fly. False means no preference: Roam may still
   * suggest driving when flights would not fit the budget.
   */
  roadTrip: boolean;
  /** At least 1. */
  adults: number;
  /** Travelers under 18. */
  children: number;
}
