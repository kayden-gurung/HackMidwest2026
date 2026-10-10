import { config } from "../../../config/env";
import { api } from "../../../lib/apiClient";
import { createId, mockResponse } from "../../../lib/mock";
import type { AskRequest, AskResponse, AssistantMessage, ChatMessage } from "../types";
import { mockConversations, mockReply } from "./mockData";

export interface ChatService {
  /** Earlier messages for a trip. */
  getConversation(tripId: string): Promise<ChatMessage[]>;
  /** Sends the user's prompt and resolves with Roam's reply. */
  sendMessage(tripId: string, prompt: string): Promise<AssistantMessage>;
}

export const mockChatService: ChatService = {
  getConversation: (tripId) => mockResponse(mockConversations[tripId] ?? []),
  sendMessage: () => mockResponse({ id: createId(), role: "assistant", text: mockReply }, 600),
};

export const httpChatService: ChatService = {
  // PROPOSED endpoint: not implemented in backend/ yet.
  getConversation: (tripId) => api.get<ChatMessage[]>(`/api/trips/${encodeURIComponent(tripId)}/messages`),
  // IMPLEMENTED: POST /api/ask. It doesn't know about trips yet, so tripId is not sent.
  sendMessage: async (_tripId, prompt) => {
    const body: AskRequest = { prompt };
    const { reply } = await api.post<AskResponse>("/api/ask", body);
    return { id: createId(), role: "assistant", text: reply };
  },
};

export const chatService: ChatService = config.useMocks ? mockChatService : httpChatService;
