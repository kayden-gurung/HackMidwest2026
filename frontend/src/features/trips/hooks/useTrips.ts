import { useAsync } from "../../../hooks/useAsync";
import { tripsService } from "../api/tripsService";

export function useTripList() {
  return useAsync(() => tripsService.listTrips(), []);
}

export function useTrip(tripId: string) {
  return useAsync(() => tripsService.getTrip(tripId), [tripId]);
}
