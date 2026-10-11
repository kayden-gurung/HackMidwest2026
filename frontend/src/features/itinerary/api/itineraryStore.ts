import { tripDates } from "../lib/itinerary";
import type { Itinerary, ItinerarySnapshot } from "../types";
import { sampleTrips } from "../../explore/api/sampleTrips";

// New journeys start without a plan; only the sample trips opened from Explore come with one.
const plans = new Map<string, Itinerary>(sampleTrips.map((trip) => [trip.id, structuredClone(trip.itinerary)]));
const listeners = new Set<() => void>();
const categories = ["Flights", "Driving", "Stays", "Food", "Activities"];
const money = (value: unknown): boolean => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const isoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Reject malformed updates atomically, keeping the last good plan visible. */
export function validateItinerary(value: unknown): ItinerarySnapshot {
  const plan = value as ItinerarySnapshot;
  const overview = plan?.overview;
  const road = plan?.roadTrip;
  if (road != null && (typeof road.origin !== "string" || !road.origin.trim() || typeof road.destination !== "string" || !road.destination.trim()
    || [road.distanceMiles, road.drivingMinutes, road.directMinutes, road.detourMinutes, road.detourBudgetMinutes,
      road.fuelCostUsd, road.extraFuelCostUsd, road.mpg, road.gasPrice].some((n) => !Number.isFinite(n) || n < 0)
    || road.mpg <= 0 || !Number.isInteger(road.routeOption) || road.routeOption < 0 || road.routeOption > 2
    || road.detourMinutes > road.detourBudgetMinutes + 0.05)) {
    throw new Error("Roam returned invalid driving estimates. Your previous plan is still here; please retry.");
  }
  if (!plan || !isoDate(plan.startDate) || !isoDate(plan.endDate) || plan.startDate > plan.endDate
    || (Date.parse(plan.endDate) - Date.parse(plan.startDate)) / 86400000 >= 60
    || !Array.isArray(plan.items) || plan.items.length > 100 || !plan.budget || !money(plan.budget.plannedUsd)
    || (plan.summary != null && typeof plan.summary !== "string")
    || (overview != null && (typeof overview.destination !== "string" || !overview.destination.trim()
      || [overview.headline, overview.pace, overview.imageUrl, overview.imageAlt].some((field) => field != null && typeof field !== "string")))
    || (plan.assumptions != null && (!Array.isArray(plan.assumptions) || !plan.assumptions.every((item) => typeof item === "string")))) {
    throw new Error("Roam returned an invalid plan. Your previous plan is still here; please retry.");
  }
  const dates = tripDates(plan.startDate, plan.endDate);
  const ids = new Set<string>();
  for (const item of plan.items) {
    const location = item?.location;
    const hasLat = location?.lat != null;
    const hasLng = location?.lng != null;
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)
      || typeof item.title !== "string" || !item.title || !dates.includes(item.date)
      || !categories.includes(item.category) || !money(item.costUsd)
      || (item.time != null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time))
      || (item.description != null && typeof item.description !== "string")
      || (item.websiteUrl != null && typeof item.websiteUrl !== "string")
      || (item.sourceUrls != null && (!Array.isArray(item.sourceUrls) || !item.sourceUrls.every((url) => typeof url === "string")))
      || (item.route != null && (!Array.isArray(item.route) || item.route.length > 400 || !item.route.every((point) => Array.isArray(point) && point.length === 2
        && Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 && Number.isFinite(point[1]) && Math.abs(point[1]) <= 180)))
      || (location != null && (typeof location.name !== "string" || !location.name || hasLat !== hasLng
        || (hasLat && (!Number.isFinite(location.lat) || Math.abs(location.lat!) > 90 || !Number.isFinite(location.lng) || Math.abs(location.lng!) > 180))))) {
      throw new Error("Roam returned an invalid stop. Your previous plan is still here; please retry.");
    }
    ids.add(item.id);
  }
  return plan;
}

export const itineraryStore = {
  get: (tripId: string): Itinerary | null => plans.get(tripId) ?? null,
  snapshot(tripId: string): ItinerarySnapshot | undefined {
    const plan = plans.get(tripId);
    if (!plan) return undefined;
    const { startDate, endDate, items, budget, summary, assumptions, overview, roadTrip } = plan;
    return { startDate, endDate, items, budget, summary, assumptions, overview, roadTrip };
  },
  set(tripId: string, snapshot: ItinerarySnapshot) {
    plans.set(tripId, { ...snapshot, tripId });
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
