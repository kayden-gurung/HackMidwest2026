import type { Itinerary } from "../types";

export function MapView({ route }: { route: Itinerary["route"] }) {
  return (
    <div>
      <div className="font-display text-2xl font-semibold">Your route</div>
      <div className="mt-4 flex aspect-[4/5] flex-col justify-between rounded-2xl bg-map p-5 text-white">
        <div className="self-end rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink">{route.regionLabel}</div>
        <div className="space-y-3">
          {route.stops.map((place, index) => <div key={place} className="flex items-center gap-2 rounded-xl bg-ink/85 p-3 text-sm font-bold"><div className="grid size-6 place-items-center rounded-full bg-sun text-[10px] text-ink">{index + 1}</div>{place}</div>)}
        </div>
      </div>
    </div>
  );
}
