import { config } from "../../../config/env";
import { ApiError, api } from "../../../lib/apiClient";
import { mockResponse } from "../../../lib/mock";
import type { Itinerary } from "../types";
import { mockItineraries } from "./mockData";
import { itineraryStore } from "./itineraryStore";

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

// Live plans arrive with chat replies, and are stored per journey in browser memory.
export const itineraryService: ItineraryService = config.useMocks ? mockItineraryService : {
  getItinerary: async (tripId) => itineraryStore.get(tripId),
};
