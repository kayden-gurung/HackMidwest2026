import { ApiError, api } from "../../../lib/apiClient";
import type { Itinerary } from "../types";
import { itineraryStore } from "./itineraryStore";

export interface ItineraryService {
  /** Resolves with null when the trip has no plan yet (a new journey, for example). */
  getItinerary(tripId: string): Promise<Itinerary | null>;
}

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

// Plans are kept per journey in itineraryStore: the Explore sample trips start with one, and chat replies add the rest.
export const itineraryService: ItineraryService = {
  getItinerary: async (tripId) => itineraryStore.get(tripId),
};
