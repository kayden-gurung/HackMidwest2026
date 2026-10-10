import { config } from "../../../config/env";
import { api } from "../../../lib/apiClient";
import { createId, mockResponse } from "../../../lib/mock";
import type { TripCard, TripDetails, TripSummary } from "../types";
import { mockTripCards, mockTripDetails, mockTrips } from "./mockData";

export interface TripsService {
  listTrips(): Promise<TripSummary[]>;
  getTrip(tripId: string): Promise<TripDetails>;
  /** Creates an empty draft journey and resolves with it. */
  createTrip(): Promise<TripSummary>;
  /** Gives a journey its real title, which also ends its draft state. */
  renameTrip(tripId: string, title: string): Promise<TripSummary>;
  /** Cards for the My trips screen. */
  listTripCards(): Promise<TripCard[]>;
}

export const DRAFT_TITLE = "New journey";

/*
 * LOCAL STORE: journeys live in this module's memory, so they survive switching between
 * journeys but reset when the page reloads. With mocks on it starts with the Figma sample
 * trips; with mocks off it starts with one empty journey so the real backend gets a clean slate.
 */
const newDraft = (): TripSummary => ({ id: createId(), title: DRAFT_TITLE, isDraft: true });
let trips: TripSummary[] = config.useMocks ? structuredClone(mockTrips) : [newDraft()];
const details: Record<string, TripDetails> = config.useMocks ? structuredClone(mockTripDetails) : {};

export const localTripsService: TripsService = {
  listTrips: () => mockResponse(trips),
  getTrip: async (tripId) => {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip) throw new Error(`No trip with id "${tripId}"`);
    return mockResponse({ ...details[tripId], id: trip.id, title: trip.title });
  },
  createTrip: () => {
    const trip = newDraft();
    trips = [trip, ...trips];
    return mockResponse(trip);
  },
  renameTrip: async (tripId, title) => {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip) throw new Error(`No trip with id "${tripId}"`);
    const renamed: TripSummary = { ...trip, title, isDraft: false };
    trips = trips.map((item) => (item.id === tripId ? renamed : item));
    return mockResponse(renamed);
  },
  // The My trips cards are design samples in both modes until the backend stores trip status and photos.
  listTripCards: () => mockResponse(mockTripCards),
};

/** PROPOSED endpoints: not implemented in backend/ yet. */
export const httpTripsService: TripsService = {
  listTrips: () => api.get<TripSummary[]>("/api/trips"),
  getTrip: (tripId) => api.get<TripDetails>(`/api/trips/${encodeURIComponent(tripId)}`),
  createTrip: () => api.post<TripSummary>("/api/trips", {}),
  renameTrip: (tripId, title) => api.post<TripSummary>(`/api/trips/${encodeURIComponent(tripId)}/title`, { title }),
  listTripCards: () => api.get<TripCard[]>("/api/trips/cards"),
};

// The backend has no trips endpoints yet, so journeys are kept locally in both mock and real mode.
// Switch this to httpTripsService once backend/routers/trips.py exists.
export const tripsService: TripsService = localTripsService;
