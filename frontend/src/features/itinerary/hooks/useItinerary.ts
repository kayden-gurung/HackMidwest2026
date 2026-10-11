import { useSyncExternalStore } from "react";
import { conversationStore } from "../../chat/api/conversationStore";
import { itineraryStore } from "../api/itineraryStore";

export function useItinerary(tripId: string) {
  const data = useSyncExternalStore(itineraryStore.subscribe, () => itineraryStore.get(tripId));
  const sendStatus = useSyncExternalStore(conversationStore.subscribe, () => conversationStore.getStatus(tripId));
  return { data, updating: sendStatus === "sending", awaitingApproval: sendStatus === "awaiting_approval", failed: sendStatus === "error" };
}
