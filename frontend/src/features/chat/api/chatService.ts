import { config } from "../../../config/env";
import { api, ApiError } from "../../../lib/apiClient";
import { createId, mockResponse } from "../../../lib/mock";
import type { AskRequest, AskResponse, AssistantMessage, ChatMessage, PlanApproval, TravelPreferences, XrayEvent } from "../types";
import { agentStore } from "./agentStore";
import { conversationStore } from "./conversationStore";
import { mockReply } from "./mockData";
import { itineraryStore, validateItinerary } from "../../itinerary/api/itineraryStore";
import { travelModeStore } from "../../trips/api/travelModeStore";
import { tripTypesStore } from "../../journey/api/tripTypesStore";
import { roadTripStore } from "../../../roadtrip/api/roadTripStore";

export interface ChatService {
  /** Earlier messages for a trip. */
  getConversation(tripId: string): Promise<ChatMessage[]>;
  /**
   * Saves the prompt and eventual reply. Returns undefined while the agent awaits consent.
   * `preferences` are the traveler's settings; they go to the backend with the prompt.
   */
  sendMessage(tripId: string, prompt: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]): Promise<AssistantMessage | undefined>;
  retryMessage(tripId: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]): Promise<AssistantMessage | undefined>;
  resolveApproval(tripId: string, approved: boolean): Promise<AssistantMessage | undefined>;
}

/** Where Roam's reply comes from. This is the only part that differs between mock and real mode. */
type ReplySource = (tripId: string, prompt: string, preferences?: TravelPreferences, mode?: AskRequest["mode"]) => Promise<AssistantMessage | undefined>;

const mockReplySource: ReplySource = () => mockResponse({ id: createId(), role: "assistant", text: mockReply }, 600);
const runContexts = new Map<string, string>();

function planningContext(tripId: string) {
  return JSON.stringify({ itinerary: itineraryStore.snapshot(tripId), travelMode: travelModeStore.get(tripId), tripTypes: tripTypesStore.get(tripId), roadTrip: roadTripStore.get(tripId) });
}

function checkPlanningContext(tripId: string) {
  const previous = runContexts.get(tripId);
  if (previous !== undefined && previous !== planningContext(tripId)) {
    throw new Error("Your trip settings or plan changed during this review. Send your change again for a fresh proposal.");
  }
}

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
  const { carMode, maxMilesPerDay } = travelModeStore.get(tripId);
  const body: AskRequest = {
    prompt,
    history: historyFor(tripId),
    mode,
    preferences: preferences && toRequestPreferences(preferences),
    current_itinerary: itineraryStore.snapshot(tripId),
    car_mode: carMode,
    travel_mode: carMode ? "road" : "plane",
    max_drive_miles_per_day: carMode ? maxMilesPerDay : undefined,
    trip_types: tripTypesStore.get(tripId),
    road_trip: roadTripStore.get(tripId),
  };
  agentStore.begin(tripId);
  runContexts.set(tripId, planningContext(tripId));
  return streamReply(tripId, "/api/ask/stream", body);
};

async function streamReply(tripId: string, path: string, body: unknown): Promise<AssistantMessage | undefined> {
  const controller = new AbortController();
  // A plan runs an orchestrator and up to three specialists over slow public map lookups.
  const timeout = window.setTimeout(() => controller.abort(), 300000);
  try {
    // Streamed so the reply appears as it is written and the panel can say which tool Roam is using.
    let streamed = "";
    const toolSteps: string[] = [];
    let afterTool = false;
    let reply: unknown;
    let itinerary: AskResponse["itinerary"] | undefined;
    let failure: ApiError | undefined;
    let approval: PlanApproval | undefined;
    let completed = false;
    const json = await api.postEvents<AskResponse>(
      path,
      body,
      (event) => {
        if (event.run && typeof (event.run as { id?: unknown }).id === "string") {
          agentStore.setRun(tripId, (event.run as { id: string }).id);
        } else if (event.xray) {
          agentStore.record(tripId, event.xray as XrayEvent);
        } else if (event.approval) {
          approval = event.approval as PlanApproval;
        } else if (event.done === true) {
          completed = true;
        } else if (typeof event.text === "string") {
          // Keep text written before and after a tool call from running together.
          streamed += (afterTool && streamed ? "\n\n" : "") + event.text;
          afterTool = false;
          conversationStore.setDraft(tripId, { text: streamed, toolSteps: [...toolSteps] });
        } else if (typeof event.tool === "string") {
          afterTool = true;
          toolSteps.push(event.tool);
          conversationStore.setDraft(tripId, { text: streamed, tool: event.tool, toolSteps: [...toolSteps] });
        } else if (typeof event.reply === "string") {
          reply = event.reply;
        } else if (event.itinerary) {
          itinerary = event.itinerary as AskResponse["itinerary"];
        } else if (typeof event.error === "string") {
          failure = new ApiError(event.error, typeof event.status === "number" ? event.status : 500);
        }
      },
      controller.signal,
    );
    // A plain JSON answer (older backend) carries the same fields as the final stream events.
    if (json) { ({ reply, itinerary, approval } = json); completed = true; }
    if (failure) throw failure;
    if (!completed) throw new Error("Roam’s connection ended before the plan was ready. Please try again.");
    if (approval) {
      if (!approval.run_id || !approval.interrupts?.length) throw new Error("Roam returned an incomplete review. Please try again.");
      agentStore.setApproval(tripId, approval);
      return undefined;
    }
    if (typeof reply !== "string" || !reply.trim()) throw new Error("Roam returned an empty reply. Please try again.");
    return { id: createId(), role: "assistant", text: reply, toolSteps, itinerary: itinerary == null ? undefined : validateItinerary(itinerary) };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Roam took too long to respond. Please try again.");
    if (error instanceof TypeError) throw new Error("Cannot reach Roam. Check your connection and try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

const replySource: ReplySource = config.useMocks ? mockReplySource : httpReplySource;

/*
 * Conversation history is kept in conversationStore (browser memory) in both modes, because the
 * backend has no GET /api/trips/{id}/messages yet. When it does, load the history from there.
 * The reply is written to the store even if the traveler has switched to another journey meanwhile.
 */
async function finishReply(tripId: string, source: () => Promise<AssistantMessage | undefined>): Promise<AssistantMessage | undefined> {
  conversationStore.setStatus(tripId, "sending");
  try {
    const reply = await source();
    if (!reply) {
      conversationStore.setStatus(tripId, "awaiting_approval");
      return undefined;
    }
    if (reply.itinerary) {
      checkPlanningContext(tripId);
      itineraryStore.set(tripId, reply.itinerary);
    }
    runContexts.delete(tripId);
    agentStore.setApproval(tripId, undefined);
    conversationStore.append(tripId, reply);
    conversationStore.setStatus(tripId, "idle");
    return reply;
  } catch (error) {
    runContexts.delete(tripId);
    agentStore.setApproval(tripId, undefined);
    conversationStore.setError(tripId, error instanceof Error ? error.message : "Roam couldn’t reply. Please try again.");
    conversationStore.setStatus(tripId, "error");
    throw error;
  }
}

export const chatService: ChatService = {
  getConversation: async (tripId) => conversationStore.getMessages(tripId),
  sendMessage: async (tripId, prompt, preferences, mode) => {
    if (["sending", "awaiting_approval"].includes(conversationStore.getStatus(tripId))) throw new Error("Roam is already responding to this journey. Review the pending plan first.");
    const text = prompt.trim();
    if (!text) throw new Error("Enter a trip request first.");
    conversationStore.append(tripId, { id: createId(), role: "user", text });
    return finishReply(tripId, () => replySource(tripId, text, preferences, mode));
  },
  retryMessage: async (tripId, preferences, mode) => {
    const last = conversationStore.getMessages(tripId).at(-1);
    if (conversationStore.getStatus(tripId) !== "error" || last?.role !== "user") throw new Error("There is no failed message to retry.");
    return finishReply(tripId, () => replySource(tripId, last.text, preferences, mode));
  },
  resolveApproval: async (tripId, approved) => {
    const approval = agentStore.get(tripId).approval;
    if (!approval || conversationStore.getStatus(tripId) !== "awaiting_approval") throw new Error("There is no pending plan to review.");
    return finishReply(tripId, () => {
      if (approved) checkPlanningContext(tripId);
      return streamReply(tripId, `/api/ask/${encodeURIComponent(approval.run_id)}/resume`, {
        interrupt_ids: approval.interrupts.map((item) => item.id), approved,
      });
    });
  },
};
