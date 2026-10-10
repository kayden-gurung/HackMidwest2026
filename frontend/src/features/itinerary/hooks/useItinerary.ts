import { useAsync } from "../../../hooks/useAsync";
import { itineraryService } from "../api/itineraryService";

export function useItinerary(tripId: string) {
  return useAsync(() => itineraryService.getItinerary(tripId), [tripId]);
}
