/** Data contracts for the chat feature. */
import type { ItinerarySnapshot } from "../itinerary/types";

export interface DestinationRecommendation {
  destination: string;
  stops: string[];
  imageUrl?: string;
  imageAlt?: string;
  /** Legacy demo score. The postcard uses a recommendation label instead. */
  matchPercent?: number;
  estimatedTotalUsd: number | null;
  flightPricePerPersonUsd?: number;
  pace?: string;
  headline?: string;
  description?: string;
  budgetUsd?: number | null;
  unknownCosts?: number;
  dateLabel?: string;
  durationDays?: number;
}

export interface FlightOption {
  departTime: string;
  departAirport: string;
  arriveTime: string;
  arriveAirport: string;
  /** Days after departure the flight lands (1 renders as "+1"). */
  arriveDayOffset: number;
  duration: string;
  stops: number;
  pricePerPersonUsd: number;
  withinBudget: boolean;
}

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  text: string;
  recommendation?: DestinationRecommendation;
  flight?: FlightOption;
  /** Follow-up prompts shown as chips; clicking one sends it as a message. */
  suggestions?: string[];
  itinerary?: ItinerarySnapshot;
  /** Actual streamed tool calls, retained so planning checks stay visible after the reply. */
  toolSteps?: string[];
}

export type ChatMessage = UserMessage | AssistantMessage;

/** The traveler's settings that shape what Roam plans. The page passes these in from the settings feature. */
export interface TravelPreferences {
  interests: string[];
  pace?: string;
  stayStyle?: string;
  planningStyle?: string;
  currency?: string;
  homeAirport?: string;
  travelers?: string;
}

/** Body of POST /api/ask (backend/routers/ask.py). `preferences` mirrors `Preferences` in backend/schemas.py. */
export interface AskRequest {
  prompt: string;
  history?: { role: "user" | "assistant"; content: string }[];
  mode?: "Hands-on" | "Co-pilot" | "Surprise me";
  current_itinerary?: ItinerarySnapshot;
  /** Car mode from the trip header: the backend plans by car and removes every flight. */
  car_mode?: boolean;
  /** The trip header's Plane / Road toggle: plane plans flights with airports and ticket links, road plans a road trip. */
  travel_mode?: "plane" | "road";
  /** Car mode only: most miles to drive in one day (50–1500). */
  max_drive_miles_per_day?: number;
  /** Trip types chosen on the New journey screen; the backend keeps the AI to them on every message. */
  trip_types?: string[];
  preferences?: {
    interests: string[];
    pace?: string;
    stay_style?: string;
    planning_style?: string;
    currency?: string;
    home_airport?: string;
    travelers?: string;
  };
}

/** Response of POST /api/ask. */
export interface AskResponse {
  reply: string;
  itinerary?: ItinerarySnapshot;
  approval?: PlanApproval;
}

export interface XrayEvent {
  id: string;
  agent: "orchestrator" | "places" | "transport" | "budget";
  kind: "agent_started" | "agent_finished" | "model_started" | "model_finished" | "tool_started" | "tool_finished" | "consent_resolved";
  timestamp: string;
  tool?: string;
  call_id?: string;
  status?: string;
  duration_ms?: number | null;
}

export interface PlanProposal {
  kind: "itinerary_replan";
  summary: string;
  changes: { type: "added" | "removed" | "changed"; before?: ItinerarySnapshot["items"][number]; after?: ItinerarySnapshot["items"][number] }[];
  unchanged_stops: number;
  before_total_usd: number;
  after_total_usd: number;
  unknown_costs: number;
  accuracy_notes?: string[];
  itinerary: ItinerarySnapshot;
}

export interface PlanApproval {
  run_id: string;
  interrupts: { id: string; name: string; reason: PlanProposal }[];
  expires_in_seconds: number;
}
