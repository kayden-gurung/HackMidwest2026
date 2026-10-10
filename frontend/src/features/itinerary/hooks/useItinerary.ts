import { useAsync } from "../../../hooks/useAsync";
import { itineraryService } from "../api/itineraryService";
import type { Itinerary } from "../types";

export function useItinerary(tripId: string) {
  return useAsync(() => itineraryService.getItinerary(tripId), [tripId]);
}

export function budgetTotals(budget: Itinerary["budget"]) {
  const spentUsd = budget.lines.reduce((sum, line) => sum + line.amountUsd, 0);
  return { spentUsd, remainingUsd: budget.plannedUsd - spentUsd, percentUsed: Math.round((spentUsd / budget.plannedUsd) * 100) };
}
