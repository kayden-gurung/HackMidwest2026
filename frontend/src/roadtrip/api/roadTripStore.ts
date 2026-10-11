import type { DriveDraft } from "../types";

export interface RoadTripConstraints {
  origin: string;
  destination: string;
  detour_minutes: number;
  mpg: number;
  gas_price: number;
}

const constraints = new Map<string, RoadTripConstraints>();

export function roadTripConstraints(draft: DriveDraft): RoadTripConstraints {
  if (!draft.start.trim() || !draft.destination.trim()) throw new Error("Enter a starting city and destination.");
  if (!Number.isFinite(draft.mpg) || draft.mpg <= 0 || draft.mpg > 150
    || !Number.isFinite(draft.gasPrice) || draft.gasPrice < 0 || draft.gasPrice > 20
    || !Number.isInteger(draft.maxMilesPerDay) || draft.maxMilesPerDay < 50 || draft.maxMilesPerDay > 1500
    || ![15, 30, 60, 120].includes(draft.detourBudget)) throw new Error("Check your driving limits and fuel assumptions.");
  return { origin: draft.start.trim(), destination: draft.destination.trim(), detour_minutes: draft.detourBudget,
    mpg: draft.mpg, gas_price: draft.gasPrice };
}

export const roadTripStore = {
  get: (tripId: string) => constraints.get(tripId),
  set: (tripId: string, value: RoadTripConstraints) => constraints.set(tripId, { ...value }),
};

export function describeDrive(draft: DriveDraft): string {
  roadTripConstraints(draft);
  return [
    `Plan a one-way drive from ${draft.start} to ${draft.destination} for one traveler.`,
    `Interests: ${draft.interests.join(", ") || "interesting local stops"}.`,
    `Departure: ${draft.departureDate.trim() || "Flexible"}. If flexible, assume today and state the date.`,
    "There is no spending limit set. Use null for unknown meal, activity and lodging prices.",
    "Choose two to four verified, worthwhile stops along the route,",
    "within the total extra driving-time limit. Allow enough days for the daily driving limit.",
    "Create a complete drive itinerary. If live data is unavailable, say so.",
  ].join("\n");
}

export type DriveAction = "route" | "towns" | "activities" | "restaurants";

export function driveChangePrompt(action: DriveAction, city: string): string {
  const tasks: Record<DriveAction, string> = {
    route: "Find a different road route between the same starting city and destination. Keep the stops if feasible. If no alternative is available, keep the current plan and explain why.",
    towns: "Find different small towns along the same road route. Exclude towns already in my itinerary. Propose verified town stops that fit my interests.",
    activities: `Find different attractions in ${city.trim()}. Exclude places already in my itinerary. Replace only the relevant activity stops in that city.`,
    restaurants: `Find different restaurants in ${city.trim()}. Exclude places already in my itinerary. Replace only the relevant meal stops in that city.`,
  };
  if ((action === "activities" || action === "restaurants") && !city.trim()) throw new Error("Enter the city to search.");
  return tasks[action] + " Preserve unaffected stops and IDs. Check the entire route, fuel and budget, then propose the change for my approval. Do not apply it until I approve.";
}
