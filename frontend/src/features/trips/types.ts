/** Data contracts for the trips feature. The http service expects the backend to return these shapes. */

/** A trip as listed under "Recent journeys". */
export interface TripSummary {
  id: string;
  title: string;
  /** Unknown until Roam has picked a destination. */
  country?: string;
  /** Unknown until the traveler has given a budget. */
  budgetUsd?: number;
  /** True for a journey created with "New journey" that has no messages yet. Its title is a placeholder. */
  isDraft?: boolean;
}

/** The trip open in the planner header. Dates are ISO "YYYY-MM-DD" and missing until the trip is planned. */
export interface TripDetails {
  id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  origin?: string;
}

export type PlanningMode = "Co-pilot" | "Surprise me";
