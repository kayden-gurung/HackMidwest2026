/** Data contracts for the trips feature. The http service expects the backend to return these shapes. */

/** A trip as listed under "Recent journeys". */
export interface TripSummary {
  id: string;
  title: string;
  country: string;
  budgetUsd: number;
}

/** The trip open in the planner header. Dates are ISO "YYYY-MM-DD". */
export interface TripDetails {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  travelers: number;
  origin: string;
}

export type PlanningMode = "Co-pilot" | "Surprise me";
