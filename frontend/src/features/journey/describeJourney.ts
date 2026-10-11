import { formatUsd } from "../../lib/format";
import { describeLength, formatTripDates } from "./lib/dates";
import type { JourneyRequest } from "./types";

/** (2, 1) -> "2 adults and 1 child" */
export function describeParty(adults: number, children: number): string {
  const adultLabel = `${adults} adult${adults === 1 ? "" : "s"}`;
  if (children === 0) return adultLabel;
  return `${adultLabel} and ${children} ${children === 1 ? "child" : "children"}`;
}

/** ["A", "B", "C"] -> "A, B and C" */
function listWithAnd(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Turns the New journey choices into the first chat message for Roam, e.g.
 * "A warm beach week with great food. Vibe: Beach & coast, Food first. Travelers: 2 adults and 1 child, leaving from Omaha, NE.
 *  Budget: $3,000 total. Dates: Jun 18–25 (2029-06-18 to 2029-06-25, 7 nights). Getting there: by plane."
 */
export function describeJourney(request: JourneyRequest): string {
  const { vibes } = request;
  const opening = request.prompt || (vibes.length ? `Plan me a ${listWithAnd(vibes).toLowerCase()} trip.` : "Plan me a trip.");
  const ending = /[.!?]$/.test(opening) ? "" : ".";
  const origin = request.origin.trim();
  const { dates } = request;
  return [
    `${opening}${ending}`,
    `Vibe: ${vibes.length ? vibes.join(", ") : "no preference"}.`,
    `Travelers: ${describeParty(request.adults, request.children)}${origin ? `, leaving from ${origin}` : ""}.`,
    `Budget: ${request.budgetUsd === null ? "flexible, no set limit" : `${formatUsd(request.budgetUsd)} total`}.`,
    `Dates: ${dates ? `${formatTripDates(dates)} (${dates.start} to ${dates.end}, ${describeLength(dates).toLowerCase()})` : "flexible"}.`,
    request.travelBy === "road"
      ? "Getting there: by road in our own car."
      : "Getting there: by plane.",
  ].join(" ");
}
