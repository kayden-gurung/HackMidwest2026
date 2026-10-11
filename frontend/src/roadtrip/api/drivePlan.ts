import type { DriveDraft, DrivePlan } from "../types"
import { planTrip } from "./tripPlanner"

/**
 * Plans a drive with the backend's route planner (POST /api/trips/plan, see
 * docs/ROUTE_PLANNER.md): the road line between the two cities, and the stops along it matched to
 * the interests, each with its measured detour, gas cost, and OpenStreetMap source.
 *
 * `includePlaces: false` returns the route and driving days only, in a few seconds, so the map
 * can show while the stops are still being searched (plan.live.pending is then true).
 *
 * Throws an Error with a plain-language message when the drive can't be planned.
 * The cached Kansas City → St. Louis demo (demoPlan in ../data/mockData) stays for saved trips.
 */
export async function fetchDrivePlan(draft: DriveDraft, includePlaces = true): Promise<DrivePlan> {
  return planTrip(draft, fetch, includePlaces)
}
