import { formatDateRange } from "../../../../lib/format";
import type { AssistantMessage, FlightOption } from "../../../chat/types";
import { totalCost, tripDates } from "../../../itinerary/lib/itinerary";
import type { Itinerary } from "../../../itinerary/types";
import type { ExploreTag, SampleTrip } from "../../types";

/** Everything written by hand for one sample trip; `defineSampleTrip` derives the rest from it. */
export interface SampleTripSource {
  id: string;
  /** The journey's title in the planner header, e.g. "A slow week in Puglia". */
  title: string;
  /** Short theme on the Explore card, e.g. "A slow week". */
  theme: string;
  /** Destination as shown on the card and the chat postcard, e.g. "Puglia, Italy". */
  place: string;
  country: string;
  tags: ExploreTag[];
  /** Unsplash photo path, e.g. "photo-1770493967117-6ae3927c0d05". */
  photo: string;
  imageAlt: string;
  origin: string;
  travelers: number;
  plannedUsd: number;
  /** The traveler's first message. */
  prompt: string;
  reply: {
    text: string;
    headline: string;
    description: string;
    stops: string[];
    pace: string;
    suggestions: string[];
  };
  /** The outbound flight shown in the chat. Its price is per person, round trip. */
  flight: Omit<FlightOption, "withinBudget">;
  itinerary: Pick<Itinerary, "startDate" | "endDate" | "items" | "days" | "places">;
}

const unsplash = (photo: string, width: number) =>
  `https://images.unsplash.com/${photo}?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=${width}`;

/**
 * Builds a sample trip. The card's price and length, the chat postcard's totals and dates, and the
 * trip header all come from the itinerary, so they always agree with the Plan and Budget tabs.
 */
export function defineSampleTrip(source: SampleTripSource): SampleTrip {
  const { id, title, reply } = source;
  const itinerary: Itinerary = { tripId: id, ...source.itinerary, budget: { plannedUsd: source.plannedUsd } };
  const totalUsd = totalCost(itinerary.items);
  const days = tripDates(itinerary.startDate, itinerary.endDate).length;

  const assistant: AssistantMessage = {
    id: "m2",
    role: "assistant",
    text: reply.text,
    recommendation: {
      destination: source.place,
      headline: reply.headline,
      description: reply.description,
      budgetUsd: source.plannedUsd,
      stops: reply.stops,
      imageUrl: unsplash(source.photo, 1400),
      imageAlt: source.imageAlt,
      estimatedTotalUsd: totalUsd,
      flightPricePerPersonUsd: source.flight.pricePerPersonUsd,
      pace: reply.pace,
      dateLabel: formatDateRange(itinerary.startDate, itinerary.endDate),
      durationDays: days,
    },
    flight: { ...source.flight, withinBudget: totalUsd <= source.plannedUsd },
    suggestions: reply.suggestions,
  };

  return {
    id,
    idea: {
      id,
      title: source.theme,
      place: source.place,
      fromPriceUsd: totalUsd,
      days,
      travelers: source.travelers,
      tags: source.tags,
      imageUrl: unsplash(source.photo, 900),
    },
    summary: { id, title, country: source.country, budgetUsd: source.plannedUsd },
    details: { id, title, startDate: itinerary.startDate, endDate: itinerary.endDate, travelers: source.travelers, origin: source.origin },
    conversation: [{ id: "m1", role: "user", text: source.prompt }, assistant],
    itinerary,
  };
}
