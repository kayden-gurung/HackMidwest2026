/** Data contracts for the chat feature. */

export interface DestinationRecommendation {
  destination: string;
  stops: string[];
  imageUrl: string;
  imageAlt: string;
  matchPercent: number;
  estimatedTotalUsd: number;
  flightPricePerPersonUsd: number;
  pace: string;
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
}
