import { config } from "../../../config/env";
import { api } from "../../../lib/apiClient";
import { mockResponse } from "../../../lib/mock";
import type { TripDetails, TripSummary } from "../types";
import { mockTripDetails, mockTrips } from "./mockData";

export interface TripsService {
  listTrips(): Promise<TripSummary[]>;
  getTrip(tripId: string): Promise<TripDetails>;
}

export const mockTripsService: TripsService = {
  listTrips: () => mockResponse(mockTrips),
  getTrip: async (tripId) => {
    const trip = mockTripDetails[tripId];
    if (!trip) throw new Error(`No mock trip with id "${tripId}"`);
    return mockResponse(trip);
  },
};

/** PROPOSED endpoints: not implemented in backend/ yet. */
export const httpTripsService: TripsService = {
  listTrips: () => api.get<TripSummary[]>("/api/trips"),
  getTrip: (tripId) => api.get<TripDetails>(`/api/trips/${encodeURIComponent(tripId)}`),
};

export const tripsService: TripsService = config.useMocks ? mockTripsService : httpTripsService;
