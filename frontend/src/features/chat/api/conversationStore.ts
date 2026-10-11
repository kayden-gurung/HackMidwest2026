import { config } from "../../../config/env";
import type { ChatMessage } from "../types";
import { mockConversations } from "./mockData";

export type SendStatus = "idle" | "sending" | "error";

/** A reply that is still streaming in: the text so far and, while one runs, the tool Roam is using. */
export interface ReplyDraft {
  text: string;
  tool?: string;
  toolSteps?: string[];
}

/*
 * LOCAL STORE: every journey's conversation lives in this module's memory, so a chat is still
 * there when the traveler switches away and back, and resets when the page reloads.
 * With mocks on it starts with the Figma sample conversation.
 *
 * Arrays are replaced, never mutated, so React can tell when a conversation changed.
 */
// With mocks off, only the Puglia example's conversation is kept (if showExample); new journeys start empty.
const seed = config.useMocks
  ? structuredClone(mockConversations)
  : config.showExample
    ? { puglia: structuredClone(mockConversations.puglia) }
    : {};
const conversations = new Map<string, ChatMessage[]>(Object.entries(seed));
const statuses = new Map<string, SendStatus>();
const errors = new Map<string, string>();
// The reply Roam is writing right now (streamed), and the tool it is using, per journey.
const drafts = new Map<string, ReplyDraft>();
const listeners = new Set<() => void>();
const EMPTY: ChatMessage[] = [];

function notify() {
  listeners.forEach((listener) => listener());
}

export const conversationStore = {
  getMessages: (tripId: string): ChatMessage[] => conversations.get(tripId) ?? EMPTY,
  getStatus: (tripId: string): SendStatus => statuses.get(tripId) ?? "idle",
  getError: (tripId: string): string | undefined => errors.get(tripId),
  setError(tripId: string, message: string) {
    errors.set(tripId, message);
    notify();
  },
  append(tripId: string, message: ChatMessage) {
    conversations.set(tripId, [...(conversations.get(tripId) ?? EMPTY), message]);
    notify();
  },
  getDraft: (tripId: string): ReplyDraft | undefined => drafts.get(tripId),
  setDraft(tripId: string, draft: ReplyDraft) {
    drafts.set(tripId, draft);
    notify();
  },
  setStatus(tripId: string, status: SendStatus) {
    if (status !== "error") errors.delete(tripId);
    // A draft only exists while a reply is on its way.
    if (status !== "sending") drafts.delete(tripId);
    statuses.set(tripId, status);
    notify();
  },
  /** For React's useSyncExternalStore. Returns the unsubscribe function. */
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
