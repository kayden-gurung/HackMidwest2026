import type { ProfileChanges, UserProfile } from "../types";
import { mockProfile } from "./mockData";

/*
 * LOCAL STORE: the signed-in traveler's profile lives in this module's memory, so edits show up
 * everywhere at once (sidebar, Settings, the preferences sent to the agent) and reset on reload.
 * The object is replaced on every change, never mutated, so React can tell when it changed.
 */
let profile: UserProfile = structuredClone(mockProfile);
const listeners = new Set<() => void>();

export const profileStore = {
  get: (): UserProfile => profile,
  update(changes: ProfileChanges) {
    profile = { ...profile, ...changes };
    listeners.forEach((listener) => listener());
  },
  /** For React's useSyncExternalStore. Returns the unsubscribe function. */
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
