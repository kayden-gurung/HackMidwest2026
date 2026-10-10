import { formatUsd } from "../../lib/format";
import { describeLength, formatTripDates } from "./lib/dates";
import type { JourneyRequest } from "./types";

/** (2, 1) -> "2 adults and 1 child" */
export function describeParty(adults: number, children: number): string {
  const adultLabel = `${adults} adult${adults === 1 ? "" : "s"}`;
  if (children === 0) return adultLabel;
  return `${adultLabel} and ${children} ${children === 1 ? "child" : "children"}`;
}

/**
 * How the traveler gets there, written as an instruction Roam can act on.
 * With the road trip switch off, Roam is still told to fall back to driving when flights don't fit the budget.
 */
export function describeTransport(request: Pick<JourneyRequest, "roadTrip" | "budgetUsd">): string {
  if (request.roadTrip) {
    return "Getting there: road trip. Plan this as a drive with no flights: choose somewhere within a comfortable driving distance, and include the route, driving time each day, overnight stops and fuel in the budget.";
  }
  if (request.budgetUsd === null) return "Getting there: flying or driving, no preference.";
  return "Getting there: flying or driving, no preference. Check whether flights for everyone fit the budget; if they don't, plan a road trip instead and say why.";
}

/**
 * Turns the New journey choices into the first chat message for Roam, e.g.
 * "A warm beach week with great food. Vibe: Beach & coast. Travelers: 2 adults and 1 child, leaving from Omaha, NE.
 *  Budget: $3,000 total. Dates: Jun 18–25 (2029-06-18 to 2029-06-25, 7 nights). Getting there: road trip. ..."
 */
export function describeJourney(request: JourneyRequest): string {
  const opening = request.prompt || `Plan me a ${request.vibe.toLowerCase()} trip.`;
  const ending = /[.!?]$/.test(opening) ? "" : ".";
  const origin = request.origin.trim();
  const { dates } = request;
  return [
    `${opening}${ending}`,
    `Vibe: ${request.vibe}.`,
    `Travelers: ${describeParty(request.adults, request.children)}${origin ? `, leaving from ${origin}` : ""}.`,
    `Budget: ${request.budgetUsd === null ? "flexible, no set limit" : `${formatUsd(request.budgetUsd)} total`}.`,
    `Dates: ${dates ? `${formatTripDates(dates)} (${dates.start} to ${dates.end}, ${describeLength(dates).toLowerCase()})` : "flexible"}.`,
    describeTransport(request),
  ].join(" ");
}
