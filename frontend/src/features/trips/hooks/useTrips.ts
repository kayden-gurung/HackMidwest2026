import { useCallback, useEffect, useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { tripsService } from "../api/tripsService";
import type { TripSummary } from "../types";

/** Details for the planner header. `title` is a dependency so the header refetches after a rename. */
export function useTrip(tripId: string, title: string) {
  return useAsync(() => tripsService.getTrip(tripId), [tripId, title]);
}

/** Cards for the My trips screen. */
export function useTripCards() {
  return useAsync(() => tripsService.listTripCards(), []);
}

/** Longest title made from a first message before it is cut with an ellipsis. */
const MAX_TITLE_LENGTH = 42;

/** "I want a relaxing beach trip somewhere in Europe with great food" -> "I want a relaxing beach trip somewhere in…" */
export function titleFromMessage(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (text.length <= MAX_TITLE_LENGTH) return text;
  const cut = text.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, "")}…`;
}

/**
 * The sidebar's journey list plus the actions that change it. Loads once through tripsService,
 * then keeps the list in state and applies each create / rename result, so the list never flashes
 * back to "loading" while the traveler is using it.
 */
export function useTrips() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    tripsService.listTrips().then(
      (list) => {
        if (cancelled) return;
        setTrips(list);
        setStatus("success");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  /** Returns the journey to open for "New journey": the existing empty draft if there is one, otherwise a new one. */
  const startNewTrip = useCallback(async (): Promise<TripSummary> => {
    const existingDraft = trips.find((trip) => trip.isDraft);
    if (existingDraft) return existingDraft;
    const created = await tripsService.createTrip();
    setTrips((current) => [created, ...current]);
    return created;
  }, [trips]);

  /** Titles a draft journey after the traveler's first message. Does nothing for journeys that already have a title. */
  const nameDraftFromMessage = useCallback(
    async (tripId: string, message: string) => {
      if (!trips.find((trip) => trip.id === tripId)?.isDraft) return;
      const title = titleFromMessage(message);
      if (!title) return;
      const renamed = await tripsService.renameTrip(tripId, title);
      setTrips((current) => current.map((trip) => (trip.id === tripId ? renamed : trip)));
    },
    [trips],
  );

  /**
   * Opens a journey already titled after `message` (used by New journey's "Find my trip").
   * Done in one step because nameDraftFromMessage would not yet see a draft created in the same tick.
   */
  const startTripFromMessage = useCallback(
    async (message: string): Promise<TripSummary> => {
      const draft = await startNewTrip();
      const renamed = await tripsService.renameTrip(draft.id, titleFromMessage(message) || draft.title);
      setTrips((current) => current.map((trip) => (trip.id === draft.id ? renamed : trip)));
      return renamed;
    },
    [startNewTrip],
  );

  return { trips, status, reload, startNewTrip, nameDraftFromMessage, startTripFromMessage };
}
