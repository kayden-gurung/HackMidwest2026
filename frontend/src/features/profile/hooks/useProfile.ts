import { useSyncExternalStore } from "react";
import { profileStore } from "../api/profileStore";

/** The signed-in traveler's profile. Re-renders whenever it is edited. */
export function useProfile() {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get);
}
