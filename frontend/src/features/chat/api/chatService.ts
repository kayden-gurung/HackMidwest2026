import { config } from "../../../config/env";
import { api } from "../../../lib/apiClient";
import { createId, mockResponse } from "../../../lib/mock";
import type { AskRequest, AskResponse, AssistantMessage, ChatMessage, TravelPreferences } from "../types";
import { conversationStore } from "./conversationStore";
import { mockReply } from "./mockData";
import { itineraryStore, validateItinerary } from "../../itinerary/api/itineraryStore";

export interface ChatService {
  /** Earlier messages for a trip. */
  getConversation(tripId: string): Promise<ChatMessage[]>;
  /**
   * Sends the user's prompt and resolves with Roam's reply. Both are saved to the trip's conversation.
   * `preferences` are the traveler's settings; they go to the backend with the prompt.
   */
  sendMessage(tripId: string, prompt: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]): Promise<AssistantMessage>;
  retryMessage(tripId: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]): Promise<AssistantMessage>;
}

/** Where Roam's reply comes from. This is the only part that differs between mock and real mode. */
type ReplySource = (tripId: string, prompt: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]) => Promise<AssistantMessage>;

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

// Only successful exchanges from this journey are sent as model context.
function historyFor(tripId: string): NonNullable<AskRequest["history"]> {
  const messages = conversationStore.getMessages(tripId);
  const exchanges: NonNullable<AskRequest["history"]>[] = [];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === "assistant" && messages[i - 1].role === "user") {
      exchanges.push([
        { role: "user", content: messages[i - 1].text },
        { role: "assistant", content: messages[i].text },
      ]);
    }
  }
  return exchanges.slice(-20).flat();
}

const httpReplySource: ReplySource = async (tripId, prompt, preferences, mode) => {
  const body: AskRequest = { prompt, history: historyFor(tripId), mode, preferences: preferences && toRequestPreferences(preferences), current_itinerary: itineraryStore.snapshot(tripId) };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180000);
  try {
    const { reply, itinerary } = await api.post<AskResponse>("/api/ask", body, controller.signal);
    if (typeof reply !== "string" || !reply.trim()) throw new Error("Roam returned an empty reply. Please try again.");
    return { id: createId(), role: "assistant", text: reply, itinerary: itinerary == null ? undefined : validateItinerary(itinerary) };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Roam took too long to respond. Please try again.");
    if (error instanceof TypeError) throw new Error("Cannot reach Roam. Check your connection and try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

const replySource: ReplySource = config.useMocks ? mockReplySource : httpReplySource;

/*
 * Conversation history is kept in conversationStore (browser memory) in both modes, because the
 * backend has no GET /api/trips/{id}/messages yet. When it does, load the history from there.
 * The reply is written to the store even if the traveler has switched to another journey meanwhile.
 */
async function replyTo(tripId: string, prompt: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]): Promise<AssistantMessage> {
  conversationStore.setStatus(tripId, "sending");
  try {
    const reply = await replySource(tripId, prompt, preferences, mode);
    if (reply.itinerary) itineraryStore.set(tripId, reply.itinerary);
    conversationStore.append(tripId, reply);
    conversationStore.setStatus(tripId, "idle");
    return reply;
  } catch (error) {
    conversationStore.setError(tripId, error instanceof Error ? error.message : "Roam couldn’t reply. Please try again.");
    conversationStore.setStatus(tripId, "error");
    throw error;
  }
}

export const chatService: ChatService = {
  getConversation: async (tripId) => conversationStore.getMessages(tripId),
  sendMessage: async (tripId, prompt, preferences, mode) => {
    if (conversationStore.getStatus(tripId) === "sending") throw new Error("Roam is already responding to this journey.");
    const text = prompt.trim();
    if (!text) throw new Error("Enter a trip request first.");
    conversationStore.append(tripId, { id: createId(), role: "user", text });
    return replyTo(tripId, text, preferences, mode);
  },
  retryMessage: async (tripId, preferences, mode) => {
    const last = conversationStore.getMessages(tripId).at(-1);
    if (conversationStore.getStatus(tripId) !== "error" || last?.role !== "user") throw new Error("There is no failed message to retry.");
    return replyTo(tripId, last.text, preferences, mode);
  },
};
