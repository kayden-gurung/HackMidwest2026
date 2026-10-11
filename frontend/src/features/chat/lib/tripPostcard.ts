import { formatDateRange } from "../../../lib/format";
import { inTripOrder, totalCost, tripDates } from "../../itinerary/lib/itinerary";
import type { ItinerarySnapshot } from "../../itinerary/types";
import type { DestinationRecommendation } from "../types";

/** Live plans and the example journey share one postcard, without guessing flight facts or match scores. */
export function postcardFromItinerary(plan: ItinerarySnapshot): DestinationRecommendation | undefined {
  if (plan.items.length === 0) return undefined;
  const ordered = inTripOrder(plan.items);
  const stops = [...new Set(ordered.filter((item) => item.category !== "Flights").flatMap((item) => item.location?.name ? [item.location.name] : []))].slice(0, 3);
  const knownCosts = plan.items.filter((item) => item.costUsd != null);
  return {
    destination: plan.overview?.destination ?? "Your journey",
    headline: plan.overview?.headline ?? "Your next chapter, taking shape.",
    description: plan.summary || undefined,
    imageUrl: plan.overview?.imageUrl ?? undefined,
    imageAlt: plan.overview?.imageAlt ?? undefined,
    pace: plan.overview?.pace ?? undefined,
    stops,
    estimatedTotalUsd: knownCosts.length ? totalCost(knownCosts) : null,
    budgetUsd: plan.budget.plannedUsd,
    unknownCosts: plan.items.length - knownCosts.length,
    dateLabel: plan.startDate === plan.endDate ? formatDateRange(plan.startDate, plan.endDate).split("–")[0] : formatDateRange(plan.startDate, plan.endDate),
    durationDays: tripDates(plan.startDate, plan.endDate).length,
  };
}
