import { useSyncExternalStore } from "react";
import { itineraryStore } from "../../itinerary/api/itineraryStore";

/** How a journey travels, set from the Plane / Road toggle in the trip header. Road is car mode: drive the whole trip, never fly. */
export interface TravelMode {
  carMode: boolean;
  /** Most miles the traveler wants to drive in one day. Only used in car mode. */
  maxMilesPerDay: number;
}

/** Choices in the header's miles-per-day picker. */
export const MILES_PER_DAY_OPTIONS = [200, 300, 400, 500, 600] as const;
const DEFAULT_MODE: TravelMode = { carMode: false, maxMilesPerDay: 400 };

/*
 * LOCAL STORE, like the chats: kept in browser memory per journey, reset when the page reloads.
 * Objects are replaced, never mutated, so React can tell when a journey's mode changed.
 */
const modes = new Map<string, TravelMode>();
const listeners = new Set<() => void>();

export const travelModeStore = {
  get: (tripId: string): TravelMode => modes.get(tripId) ?? DEFAULT_MODE,
  set(tripId: string, changes: Partial<TravelMode>) {
    const next = { ...travelModeStore.get(tripId), ...changes };
    modes.set(tripId, next);
    if (changes.carMode) removeFlightsFromPlan(tripId);
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Turning car mode on takes flights off the current plan right away, so the panels never show one.
 * The backend also strips flights from every plan it returns in car mode, including ones the AI
 * files under another category.
 */
function removeFlightsFromPlan(tripId: string) {
  const plan = itineraryStore.snapshot(tripId);
  if (plan && plan.items.some((item) => item.category === "Flights")) {
    itineraryStore.set(tripId, { ...plan, items: plan.items.filter((item) => item.category !== "Flights") });
  }
}

export type TravelBy = "plane" | "road";

export function useTravelMode(tripId: string) {
  const mode = useSyncExternalStore(travelModeStore.subscribe, () => travelModeStore.get(tripId));
  return {
    ...mode,
    travelBy: (mode.carMode ? "road" : "plane") as TravelBy,
    setTravelBy: (travelBy: TravelBy) => travelModeStore.set(tripId, { carMode: travelBy === "road" }),
    setCarMode: (carMode: boolean) => travelModeStore.set(tripId, { carMode }),
    setMaxMilesPerDay: (maxMilesPerDay: number) => travelModeStore.set(tripId, { maxMilesPerDay }),
  };
}
