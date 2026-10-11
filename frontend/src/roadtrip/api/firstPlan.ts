import { conversationStore } from "../../features/chat/api/conversationStore";
import { itineraryStore, validateItinerary } from "../../features/itinerary/api/itineraryStore";
import type { ItinerarySnapshot } from "../../features/itinerary/types";
import type { DriveDraft } from "../types";

/*
 * The first plan for a new drive, built by the backend's route planner without the AI
 * (POST /api/trips/plan, see docs/ROUTE_PLANNER.md): the route, stops along it that fit the
 * interests and detour budget, lunch and a bed for each day, all from live map data.
 *
 * It goes into the same itinerary store the Strands chat uses, so every change after it ("a
 * different town", "another restaurant") goes through the chat and its approval step as usual.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Give up well after the planner would (about 20 s on a first search of a route).
const TIMEOUT_MS = 60_000;

interface PlanResponse {
  itinerary: ItinerarySnapshot;
  route: { miles: number; hours: number };
  stops: { name: string; town: string | null }[];
  detour_minutes_used: number;
  notes: string[];
  complete?: boolean;
}

export function firstPlanRequest(draft: DriveDraft, includePlaces = true) {
  return {
    include_places: includePlaces,
    start: draft.start.trim(),
    destination: draft.destination.trim(),
    interests: draft.interests,
    detour_budget_minutes: Math.min(600, Math.max(0, Math.round(draft.detourBudget || 0))),
    // The form allows "Flexible"; only a real date is sent.
    departure_date: ISO_DATE.test(draft.departureDate.trim()) ? draft.departureDate.trim() : null,
    max_miles_per_day: draft.maxMilesPerDay,
    // No mpg or gas price: the backend's defaults (28 mpg, $3.25/gal) match roadTripStore's assumptions.
  };
}

async function requestPlan(draft: DriveDraft, includePlaces: boolean, fetcher: typeof fetch): Promise<PlanResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher("/api/trips/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(firstPlanRequest(draft, includePlaces)),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The route planner answered ${response.status}.`);
    return (await response.json()) as PlanResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** The chat's opening message for the first plan: what it is, where it came from, and how to change it. */
export function firstPlanMessage(plan: PlanResponse, seconds: number): string {
  const stops = plan.stops.map((stop) => (stop.town && !stop.name.includes(stop.town) ? `${stop.name} (${stop.town})` : stop.name));
  const lines = [
    `Here's a first plan from live map data, ready in ${Math.max(1, Math.round(seconds))} s: ${plan.route.miles} miles,`
      + ` about ${plan.route.hours.toFixed(1)} hours of driving`
      + (stops.length ? `, with ${stops.length} stop${stops.length > 1 ? "s" : ""} on the way: ${stops.join(", ")}.` : "."),
    plan.stops.length ? `The stops add about ${plan.detour_minutes_used} minutes of extra driving.` : "",
    ...plan.notes,
    "Every stop, meal and stay links to its OpenStreetMap source. Ask me to change anything (a different town,"
      + " attraction or restaurant, or another road) and I'll check the whole route before proposing it.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

/**
 * Plans the drive and puts it on screen: the route alone first (a few seconds), then the full plan.
 * Throws when the full plan can't be made, so the caller can fall back to planning with the chat.
 */
export async function planFirstDrive(tripId: string, draft: DriveDraft, fetcher: typeof fetch = fetch): Promise<void> {
  const started = Date.now();
  let fullDone = false;
  conversationStore.setStatus(tripId, "sending");
  // The route alone comes back in seconds: show it while the stops are being searched.
  requestPlan(draft, false, fetcher)
    .then((routeOnly) => {
      if (!fullDone && !itineraryStore.get(tripId)) itineraryStore.set(tripId, validateItinerary(routeOnly.itinerary));
    })
    .catch(() => {
      // The full request reports any problem.
    });
  try {
    const plan = await requestPlan(draft, true, fetcher);
    const itinerary = validateItinerary(plan.itinerary);
    fullDone = true;
    itineraryStore.set(tripId, itinerary);
    conversationStore.append(tripId, {
      id: `first-plan-${tripId}`,
      role: "assistant",
      text: firstPlanMessage(plan, (Date.now() - started) / 1000),
      itinerary,
      suggestions: ["Swap a stop for a different small town", "Find a different place for lunch"],
    });
    conversationStore.setStatus(tripId, "idle");
  } catch (error) {
    fullDone = true;
    conversationStore.setStatus(tripId, "idle");
    throw error;
  }
}
