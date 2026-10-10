import { formatUsd } from "../../lib/format";
import type { JourneyRequest } from "./types";

/**
 * Turns the New journey choices into the first chat message for Roam, e.g.
 * "A warm beach week with great food. Vibe: Beach & coast. Budget: $3,000 total for 2 travelers,
 *  flying from New York · JFK. Dates: flexible."
 */
export function describeJourney(request: JourneyRequest): string {
  const opening = request.prompt || `Plan me a ${request.vibe.toLowerCase()} trip.`;
  const ending = /[.!?]$/.test(opening) ? "" : ".";
  return [
    `${opening}${ending}`,
    `Vibe: ${request.vibe}.`,
    `Budget: ${formatUsd(request.budgetUsd)} total for ${request.travelers} travelers, flying from ${request.origin}.`,
    `Dates: ${request.flexibleDates ? "flexible" : request.fixedDates}.`,
  ].join(" ");
}
