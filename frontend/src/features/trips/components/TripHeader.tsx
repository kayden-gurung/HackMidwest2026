import type { ReactNode } from "react";
import { Icon } from "../../../components/ui";
import { formatDateRange } from "../../../lib/format";
import { useTrip } from "../hooks/useTrips";
import { useItinerary } from "../../itinerary/hooks/useItinerary";
import { MILES_PER_DAY_OPTIONS, useTravelMode } from "../api/travelModeStore";
import { useTripTypes } from "../../journey/api/tripTypesStore";

/** Top bar: current trip title and summary, a "New trip" button on small screens, and the Plane / Road toggle. */
export function TripHeader({ tripId, title, leading, onNewJourney }: { tripId: string; title: string; leading?: ReactNode; onNewJourney?: () => void }) {
  // The title comes from the sidebar's list so it updates the moment a journey is named.
  const trip = useTrip(tripId, title);
  const tripTypes = useTripTypes(tripId);
  const plan = useItinerary(tripId).data;
  const details = trip.status === "success" ? trip.data : undefined;
  const summary = [
    plan ? formatDateRange(plan.startDate, plan.endDate) : details?.startDate && details.endDate ? formatDateRange(details.startDate, details.endDate) : undefined,
    details?.travelers ? `${details.travelers} ${details.travelers === 1 ? "traveler" : "travelers"}` : undefined,
    details?.origin ? `From ${details.origin}` : undefined,
    // The trip types Roam is following for this journey, so it's clear they still apply.
    tripTypes.length > 0 ? tripTypes.join(", ") : undefined,
  ].filter(Boolean);

  return (
    <header className="flex min-h-[72px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-canvas/90 px-5 py-3 backdrop-blur md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-semibold">{title}</div>
          <div className="hidden text-xs text-muted sm:block">{trip.status === "loading" ? "\u00a0" : summary.length > 0 ? summary.join(" · ") : "No dates yet. Tell Roam where you want to go."}</div>
        </div>
      </div>
      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
        {onNewJourney && <button type="button" onClick={onNewJourney} aria-label="New journey" className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold hover:border-sea hover:text-sea lg:hidden"><Icon name="plus" className="size-3.5" />New trip</button>}
        <TravelModeToggle tripId={tripId} />
      </div>
    </header>
  );
}

/** How this journey travels: by plane (airports, flight ticket links) or by road (miles, routes, a daily driving limit). */
function TravelModeToggle({ tripId }: { tripId: string }) {
  const { travelBy, maxMilesPerDay, setTravelBy, setMaxMilesPerDay } = useTravelMode(tripId);
  const options = [
    { value: "plane", label: "Plane", icon: "plane", hint: "Fly: Roam finds airports and links to flight tickets." },
    { value: "road", label: "Road", icon: "car", hint: "Drive: Roam plans miles, routes and overnight stops. No flights." },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Travel by" className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      {options.map((option) => {
        const selected = travelBy === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            onClick={() => setTravelBy(option.value)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${selected ? "bg-deep text-white" : "text-muted hover:text-ink"}`}
          >
            <Icon name={option.icon} className="size-3.5" />
            {option.label}
          </button>
        );
      })}
      {travelBy === "road" && (
        <select
          aria-label="Most miles to drive per day"
          value={maxMilesPerDay}
          onChange={(event) => setMaxMilesPerDay(Number(event.target.value))}
          className="cursor-pointer rounded-full bg-mint/60 py-1.5 pl-2.5 pr-1 text-xs font-semibold text-sea outline-none focus-visible:ring-2 focus-visible:ring-sea"
        >
          {MILES_PER_DAY_OPTIONS.map((miles) => (
            <option key={miles} value={miles}>
              {miles} mi/day
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
