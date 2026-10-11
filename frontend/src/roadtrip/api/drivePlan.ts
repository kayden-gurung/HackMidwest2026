import { demoPlan } from "../data/mockData"
import type { DriveDraft, DrivePlan } from "../types"

/**
 * Plans a drive: the road line between the two cities, the stops along it matched to the
 * interests, and the community pins nearby.
 *
 * Today this returns the cached Kansas City → St. Louis demo whatever the draft says. To connect
 * the backend, replace the body with a call to it that returns a DrivePlan (see ../types):
 *   - route.path is the road as [lat, lng] points, in drive order; route.origin / destination
 *     are the two cities with coordinates.
 *   - each stop's lat / lng put it on the map; leave them out when the lookup has no location.
 *   - detourMinutes and gasCost are per stop, measured against route.baseMinutes.
 * Nothing else in the drive tab needs to change.
 */
export async function fetchDrivePlan(_draft: DriveDraft): Promise<DrivePlan> {
  return demoPlan
}
