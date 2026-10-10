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

export type PlanningMode = "Hands-on" | "Co-pilot" | "Surprise me";

/** Where a trip stands. Drives the badge on its card and which My trips filter shows it. */
export type TripStatus = "Ready to book" | "In progress" | "Idea" | "Completed";

/** A trip as shown on the My trips screen. `id` matches the TripSummary, so a card opens that trip in the planner. */
export interface TripCard {
  id: string;
  title: string;
  place: string;
  /** Display label, e.g. "Jun 18–25". */
  dates: string;
  status: TripStatus;
  imageUrl?: string;
}
