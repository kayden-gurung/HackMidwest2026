import { config } from "../../../config/env";
import { api } from "../../../lib/apiClient";
import { createId, mockResponse } from "../../../lib/mock";
import type { AskRequest, AskResponse, AssistantMessage, ChatMessage } from "../types";
import { conversationStore } from "./conversationStore";
import { mockReply } from "./mockData";

export interface ChatService {
  /** Earlier messages for a trip. */
  getConversation(tripId: string): Promise<ChatMessage[]>;
  /** Sends the user's prompt and resolves with Roam's reply. Both are saved to the trip's conversation. */
  sendMessage(tripId: string, prompt: string): Promise<AssistantMessage>;
}

/** Where Roam's reply comes from. This is the only part that differs between mock and real mode. */
type ReplySource = (tripId: string, prompt: string) => Promise<AssistantMessage>;

const mockReplySource: ReplySource = () => mockResponse({ id: createId(), role: "assistant", text: mockReply }, 600);

// IMPLEMENTED: POST /api/ask. It doesn't know about trips yet, so tripId is not sent.
const httpReplySource: ReplySource = async (_tripId, prompt) => {
  const body: AskRequest = { prompt };
  const { reply } = await api.post<AskResponse>("/api/ask", body);
  return { id: createId(), role: "assistant", text: reply };
};

const replySource: ReplySource = config.useMocks ? mockReplySource : httpReplySource;

/*
 * Conversation history is kept in conversationStore (browser memory) in both modes, because the
 * backend has no GET /api/trips/{id}/messages yet. When it does, load the history from there.
 * The reply is written to the store even if the traveler has switched to another journey meanwhile.
 */
export const chatService: ChatService = {
  getConversation: async (tripId) => conversationStore.getMessages(tripId),
  sendMessage: async (tripId, prompt) => {
    conversationStore.append(tripId, { id: createId(), role: "user", text: prompt });
    conversationStore.setStatus(tripId, "sending");
    try {
      const reply = await replySource(tripId, prompt);
      conversationStore.append(tripId, reply);
      conversationStore.setStatus(tripId, "idle");
      return reply;
    } catch (error) {
      conversationStore.setStatus(tripId, "error");
      throw error;
    }
  },
};
