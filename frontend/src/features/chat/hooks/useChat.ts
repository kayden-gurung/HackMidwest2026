import { useCallback, useSyncExternalStore } from "react";
import { chatService } from "../api/chatService";
import { conversationStore } from "../api/conversationStore";
import type { AskRequest, TravelPreferences } from "../types";

export type { SendStatus } from "../api/conversationStore";

/** A trip's saved conversation, kept in sync with conversationStore, and a way to send new messages. */
export function useChat(tripId: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]) {
  const messages = useSyncExternalStore(conversationStore.subscribe, () => conversationStore.getMessages(tripId));
  const sendStatus = useSyncExternalStore(conversationStore.subscribe, () => conversationStore.getStatus(tripId));
  const error = useSyncExternalStore(conversationStore.subscribe, () => conversationStore.getError(tripId));

  const send = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt || conversationStore.getStatus(tripId) === "sending") return;
      // Failures are recorded in the store as the "error" status, which the panel renders.
      chatService.sendMessage(tripId, prompt, preferences, mode).catch(() => undefined);
    },
    [tripId, preferences, mode],
  );

  const retry = useCallback(() => { chatService.retryMessage(tripId, preferences, mode).catch(() => undefined); }, [tripId, preferences, mode]);
  return { messages, sendStatus, error, send, retry };
}
