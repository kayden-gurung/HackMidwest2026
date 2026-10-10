import { config } from "../../../config/env";
import { ApiError, api } from "../../../lib/apiClient";
import { mockResponse } from "../../../lib/mock";
import type { Itinerary } from "../types";
import { mockItineraries } from "./mockData";

export interface ItineraryService {
  /** Resolves with null when the trip has no plan yet (a new journey, for example). */
  getItinerary(tripId: string): Promise<Itinerary | null>;
}

export const mockItineraryService: ItineraryService = {
  getItinerary: (tripId) => mockResponse(mockItineraries[tripId] ?? null),
};

/** PROPOSED endpoint: not implemented in backend/ yet. */
export const httpItineraryService: ItineraryService = {
  getItinerary: async (tripId) => {
    try {
      return await api.get<Itinerary>(`/api/trips/${encodeURIComponent(tripId)}/itinerary`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
};

/** Real backend for real journeys, but the example journey keeps its mock itinerary so the map and budget stay filled in. */
const realWithExample: ItineraryService = {
  getItinerary: (tripId) =>
    config.showExample && tripId in mockItineraries ? mockItineraryService.getItinerary(tripId) : httpItineraryService.getItinerary(tripId),
};

export const itineraryService: ItineraryService = config.useMocks ? mockItineraryService : realWithExample;
