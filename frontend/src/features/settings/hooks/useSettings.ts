import { useSyncExternalStore } from "react";
import { settingsStore } from "../api/settingsStore";

/** The current settings and a way to change them. Changes are shared with every screen straight away. */
export function useSettings() {
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
  return { settings, update: settingsStore.update };
}

/** The settings Roam should plan with, in the shape the chat sends to the backend. */
export function useTravelPreferences() {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getPreferences);
}
