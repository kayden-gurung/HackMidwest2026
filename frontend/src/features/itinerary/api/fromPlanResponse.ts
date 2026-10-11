import { addDays } from "../lib/itinerary";
import type { BudgetCategory, Itinerary, ItineraryItem } from "../types";

/*
 * Adapter from the backend's planning contract (TEAM_PLAN.md, POST /api/trips/plan and
 * /api/trips/revise) to the shape the Plan / Map / Budget panel renders.
 * NOT CALLED YET: wire it in where the plan response arrives.
 *
 * The four optional activity fields are NOT in TEAM_PLAN.md yet. Without them the panel still
 * works, but every cost is counted under "Activities" and nothing gets a map marker.
 * Ask the agent and tools owners to add them.
 */

export interface PlanActivity {
  day: number;
  time?: string;
  title: string;
  description?: string;
  location?: string;
  estimated_cost_usd?: number;
  source_urls?: string[];
  // Proposed additions:
  category?: BudgetCategory;
  lat?: number;
  lng?: number;
  website_url?: string;
}

export interface PlanResponse {
  summary: string;
  activities: PlanActivity[];
  estimated_total_usd: number;
  assumptions: string[];
  changes: string[];
}

/** The parts of the original plan request the panel needs. */
export interface PlanRequestDates {
  start_date: string;
  days: number;
  budget_usd: number;
}

const categories: BudgetCategory[] = ["Flights", "Driving", "Stays", "Food", "Activities"];

export function itineraryFromPlan(tripId: string, request: PlanRequestDates, plan: PlanResponse): Itinerary {
  const items: ItineraryItem[] = plan.activities.map((activity, index) => ({
    id: `${activity.day}-${index}`,
    date: addDays(request.start_date, Math.max(activity.day, 1) - 1),
    time: activity.time,
    title: activity.title,
    description: activity.description,
    category: activity.category && categories.includes(activity.category) ? activity.category : "Activities",
    costUsd: Number.isFinite(activity.estimated_cost_usd) ? Math.max(activity.estimated_cost_usd ?? 0, 0) : null,
    location: activity.location ? { name: activity.location, lat: activity.lat, lng: activity.lng } : undefined,
    websiteUrl: activity.website_url,
    sourceUrls: activity.source_urls,
  }));

  return {
    tripId,
    startDate: request.start_date,
    endDate: addDays(request.start_date, Math.max(request.days, 1) - 1),
    items,
    budget: { plannedUsd: request.budget_usd },
  };
}
