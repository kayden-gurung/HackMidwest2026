import { useSyncExternalStore } from "react";

/*
 * The trip types ("vibes") a journey was started with, per journey, in browser memory like the chats.
 * Sent with every chat message, so Roam keeps following them on later changes too, not only in
 * the first message.
 */
const tripTypes = new Map<string, string[]>();
const listeners = new Set<() => void>();
const NONE: string[] = [];

export const tripTypesStore = {
  get: (tripId: string): string[] => tripTypes.get(tripId) ?? NONE,
  set(tripId: string, types: string[]) {
    tripTypes.set(tripId, [...types]);
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useTripTypes(tripId: string): string[] {
  return useSyncExternalStore(tripTypesStore.subscribe, () => tripTypesStore.get(tripId));
}
