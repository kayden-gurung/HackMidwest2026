import { config } from "../../../config/env";
import { api } from "../../../lib/apiClient";
import { mockResponse } from "../../../lib/mock";
import type { Itinerary } from "../types";
import { mockItineraries } from "./mockData";

export interface ItineraryService {
  getItinerary(tripId: string): Promise<Itinerary>;
}

export const mockItineraryService: ItineraryService = {
  getItinerary: async (tripId) => {
    const itinerary = mockItineraries[tripId];
    if (!itinerary) throw new Error(`No mock itinerary for trip "${tripId}"`);
    return mockResponse(itinerary);
  },
};

/** PROPOSED endpoint: not implemented in backend/ yet. */
export const httpItineraryService: ItineraryService = {
  getItinerary: (tripId) => api.get<Itinerary>(`/api/trips/${encodeURIComponent(tripId)}/itinerary`),
};

export const itineraryService: ItineraryService = config.useMocks ? mockItineraryService : httpItineraryService;
