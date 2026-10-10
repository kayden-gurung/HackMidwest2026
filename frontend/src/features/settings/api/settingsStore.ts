import { profileStore } from "../../profile";
import { settingsDefaults } from "./mockData";

/** Everything the traveler can change on the Settings screen. */
export interface Settings {
  interests: string[];
  pace: string;
  stay: string;
  planningStyle: string;
  currency: string;
  notifications: { price: boolean; itinerary: boolean; inspiration: boolean };
}

/** The settings that affect what Roam plans. Sent to the backend with each message. */
export interface TravelPreferences {
  interests: string[];
  pace: string;
  stayStyle: string;
  planningStyle: string;
  currency: string;
  homeAirport: string;
  travelers: string;
}

/*
 * LOCAL STORE: settings live in this module's memory, so they survive leaving the Settings
 * screen and are available to the chat, and reset when the page reloads.
 * The object is replaced on every change, never mutated, so React can tell when it changed.
 */
let settings: Settings = structuredClone(settingsDefaults);
let preferences = toPreferences(settings);
const listeners = new Set<() => void>();

function toPreferences(current: Settings): TravelPreferences {
  return {
    interests: current.interests,
    pace: current.pace,
    stayStyle: current.stay,
    planningStyle: current.planningStyle,
    currency: current.currency,
    // Edited on the Settings profile card, kept in the profile store.
    homeAirport: profileStore.get().homeAirport,
    travelers: profileStore.get().defaultTravelers,
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

// Profile edits (e.g. a new home airport) change the preferences sent to the agent, so recompute them.
profileStore.subscribe(() => {
  preferences = toPreferences(settings);
  notify();
});

export const settingsStore = {
  get: (): Settings => settings,
  getPreferences: (): TravelPreferences => preferences,
  update(changes: Partial<Settings>) {
    settings = { ...settings, ...changes };
    preferences = toPreferences(settings);
    notify();
  },
  /** For React's useSyncExternalStore. Returns the unsubscribe function. */
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
