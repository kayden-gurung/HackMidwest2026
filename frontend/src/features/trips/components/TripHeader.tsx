import type { ReactNode } from "react";
import { Icon, Toggle } from "../../../components/ui";
import { formatDateRange } from "../../../lib/format";
import { useSettings } from "../../settings";
import { useTrip } from "../hooks/useTrips";
import { useItinerary } from "../../itinerary/hooks/useItinerary";
import { MILES_PER_DAY_OPTIONS, useTravelMode } from "../api/travelModeStore";

/** Top bar: current trip title and summary, the car mode switch, and the planning-mode label. */
export function TripHeader({ tripId, title, leading }: { tripId: string; title: string; leading?: ReactNode }) {
  // The title comes from the sidebar's list so it updates the moment a journey is named.
  const trip = useTrip(tripId, title);
  const plan = useItinerary(tripId).data;
  const details = trip.status === "success" ? trip.data : undefined;
  const summary = [
    plan ? formatDateRange(plan.startDate, plan.endDate) : details?.startDate && details.endDate ? formatDateRange(details.startDate, details.endDate) : undefined,
    details?.travelers ? `${details.travelers} ${details.travelers === 1 ? "traveler" : "travelers"}` : undefined,
    details?.origin ? `From ${details.origin}` : undefined,
  ].filter(Boolean);
  // Chosen under "How should Roam help?" in Settings.
  const { planningStyle } = useSettings().settings;

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line bg-canvas/90 px-5 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        {leading}
        <div>
          <div className="font-display text-lg font-semibold">{title}</div>
          <div className="hidden text-xs text-muted sm:block">{trip.status === "loading" ? "\u00a0" : summary.length > 0 ? summary.join(" · ") : "No dates yet. Tell Roam where you want to go."}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <CarModeSwitch tripId={tripId} />
        {/* Shows the planning style; change it in Settings. */}
        <div className="hidden rounded-full border border-line bg-surface p-1 sm:block">
          <div className="rounded-full bg-deep px-3 py-1.5 text-xs font-semibold text-white">{planningStyle}</div>
        </div>
      </div>
    </header>
  );
}

/** Car mode for this journey: Roam plans the whole trip by car, never flights, within a daily driving limit. */
function CarModeSwitch({ tripId }: { tripId: string }) {
  const { carMode, maxMilesPerDay, setCarMode, setMaxMilesPerDay } = useTravelMode(tripId);
  return (
    <div
      className={`flex items-center gap-2 rounded-full border py-1 pl-3 pr-1.5 transition-colors ${carMode ? "border-sea bg-mint/50" : "border-line bg-surface"}`}
      title={carMode ? "Car mode: Roam plans the whole trip by car, with no flights." : "Turn on to plan this trip by car, with no flights."}
    >
      <Icon name="car" className={`size-4 ${carMode ? "text-sea" : "text-muted"}`} />
      <span className="text-xs font-semibold">Car</span>
      {carMode && (
        <select
          aria-label="Most miles to drive per day"
          value={maxMilesPerDay}
          onChange={(event) => setMaxMilesPerDay(Number(event.target.value))}
          className="cursor-pointer rounded-md border-l border-line bg-transparent py-0.5 pl-2 text-xs font-semibold text-sea outline-none focus-visible:ring-2 focus-visible:ring-sea"
        >
          {MILES_PER_DAY_OPTIONS.map((miles) => (
            <option key={miles} value={miles}>
              {miles} mi/day
            </option>
          ))}
        </select>
      )}
      <Toggle label="Car mode: drive the whole trip, no flights" checked={carMode} onChange={() => setCarMode(!carMode)} />
    </div>
  );
}
