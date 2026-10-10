import { useCallback, useSyncExternalStore } from "react";
import { chatService } from "../api/chatService";
import { conversationStore } from "../api/conversationStore";

export type { SendStatus } from "../api/conversationStore";

/** A trip's saved conversation, kept in sync with conversationStore, and a way to send new messages. */
export function useChat(tripId: string) {
  const messages = useSyncExternalStore(conversationStore.subscribe, () => conversationStore.getMessages(tripId));
  const sendStatus = useSyncExternalStore(conversationStore.subscribe, () => conversationStore.getStatus(tripId));

  const send = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt || conversationStore.getStatus(tripId) === "sending") return;
      // Failures are recorded in the store as the "error" status, which the panel renders.
      chatService.sendMessage(tripId, prompt).catch(() => undefined);
    },
    [tripId],
  );

  return { messages, sendStatus, send };
}
