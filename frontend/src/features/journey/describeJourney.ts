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
 * Turns the New journey choices into the first chat message for Roam, e.g.
 * "A warm beach week with great food. Vibe: Beach & coast. Travelers: 2 adults and 1 child, leaving from Omaha, NE.
 *  Budget: $3,000 total. Dates: Jun 18–25 (2029-06-18 to 2029-06-25, 7 nights)."
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
  ].join(" ");
}
