import type { SampleTrip } from "../../types";
import { busan } from "./busan";
import { madeira } from "./madeira";
import { naples } from "./naples";
import { puglia } from "./puglia";

/** The premade trips behind the Explore cards, in the order the cards appear. */
export const sampleTrips: SampleTrip[] = [puglia, madeira, busan, naples];

export function findSampleTrip(tripId: string | undefined): SampleTrip | undefined {
  return sampleTrips.find((trip) => trip.id === tripId);
}
