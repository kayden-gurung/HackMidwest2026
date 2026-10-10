import { useCallback, useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { createId } from "../../../lib/mock";
import { chatService } from "../api/chatService";
import type { ChatMessage } from "../types";

export type SendStatus = "idle" | "sending" | "error";

/** Loads a trip's conversation and sends new messages through chatService. */
export function useChat(tripId: string) {
  const history = useAsync(() => chatService.getConversation(tripId), [tripId]);
  const [sent, setSent] = useState<ChatMessage[]>([]);
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      setSent((current) => [...current, { id: createId(), role: "user", text: prompt }]);
      setSendStatus("sending");
      try {
        const reply = await chatService.sendMessage(tripId, prompt);
        setSent((current) => [...current, reply]);
        setSendStatus("idle");
      } catch {
        setSendStatus("error");
      }
    },
    [tripId],
  );

  return {
    messages: [...(history.data ?? []), ...sent],
    historyStatus: history.status,
    reloadHistory: history.reload,
    sendStatus,
    send,
  };
}
