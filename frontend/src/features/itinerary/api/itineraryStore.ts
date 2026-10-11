import { config } from "../../../config/env";
import { tripDates } from "../lib/itinerary";
import type { Itinerary, ItinerarySnapshot } from "../types";
import { mockItineraries } from "./mockData";
import { EXAMPLE_TRIP_ID } from "../../trips/api/mockData";

const seed = config.useMocks ? mockItineraries : config.showExample ? { [EXAMPLE_TRIP_ID]: mockItineraries[EXAMPLE_TRIP_ID] } : {};
const plans = new Map<string, Itinerary>(Object.entries(structuredClone(seed)));
const listeners = new Set<() => void>();
const categories = ["Flights", "Driving", "Stays", "Food", "Activities"];
const money = (value: unknown): boolean => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const isoDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

/** Reject malformed updates atomically, keeping the last good plan visible. */
export function validateItinerary(value: unknown): ItinerarySnapshot {
  const plan = value as ItinerarySnapshot;
  if (!plan || !isoDate(plan.startDate) || !isoDate(plan.endDate) || plan.startDate > plan.endDate
    || (Date.parse(plan.endDate) - Date.parse(plan.startDate)) / 86400000 >= 60
    || !Array.isArray(plan.items) || plan.items.length > 100 || !plan.budget || !money(plan.budget.plannedUsd)
    || (plan.summary != null && typeof plan.summary !== "string")
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
    const { startDate, endDate, items, budget, summary, assumptions } = plan;
    return { startDate, endDate, items, budget, summary, assumptions };
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
