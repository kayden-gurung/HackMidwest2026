import { config } from "../../../config/env";
import { api } from "../../../lib/apiClient";
import { createId, mockResponse } from "../../../lib/mock";
import type { AskRequest, AskResponse, AssistantMessage, ChatMessage, TravelPreferences } from "../types";
import { conversationStore } from "./conversationStore";
import { mockReply } from "./mockData";

export interface ChatService {
  /** Earlier messages for a trip. */
  getConversation(tripId: string): Promise<ChatMessage[]>;
  /**
   * Sends the user's prompt and resolves with Roam's reply. Both are saved to the trip's conversation.
   * `preferences` are the traveler's settings; they go to the backend with the prompt.
   */
  sendMessage(tripId: string, prompt: string, preferences?: TravelPreferences): Promise<AssistantMessage>;
}

/** Where Roam's reply comes from. This is the only part that differs between mock and real mode. */
type ReplySource = (tripId: string, prompt: string, preferences?: TravelPreferences) => Promise<AssistantMessage>;

const mockReplySource: ReplySource = () => mockResponse({ id: createId(), role: "assistant", text: mockReply }, 600);

/** The backend's field names are snake_case. */
function toRequestPreferences(preferences: TravelPreferences): AskRequest["preferences"] {
  return {
    interests: preferences.interests,
    pace: preferences.pace,
    stay_style: preferences.stayStyle,
    planning_style: preferences.planningStyle,
    currency: preferences.currency,
    home_airport: preferences.homeAirport,
    travelers: preferences.travelers,
  };
}

// IMPLEMENTED: POST /api/ask. It doesn't know about trips yet, so tripId is not sent.
const httpReplySource: ReplySource = async (_tripId, prompt, preferences) => {
  const body: AskRequest = { prompt, preferences: preferences && toRequestPreferences(preferences) };
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
  sendMessage: async (tripId, prompt, preferences) => {
    conversationStore.append(tripId, { id: createId(), role: "user", text: prompt });
    conversationStore.setStatus(tripId, "sending");
    try {
      const reply = await replySource(tripId, prompt, preferences);
      conversationStore.append(tripId, reply);
      conversationStore.setStatus(tripId, "idle");
      return reply;
    } catch (error) {
      conversationStore.setStatus(tripId, "error");
      throw error;
    }
  },
};
