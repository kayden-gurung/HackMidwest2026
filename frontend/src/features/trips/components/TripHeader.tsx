import { useState, type ReactNode } from "react";
import { Action, Icon } from "../../../components/ui";
import { formatDateRange } from "../../../lib/format";
import { useTrip } from "../hooks/useTrips";
import type { PlanningMode } from "../types";

const planningModes: PlanningMode[] = ["Co-pilot", "Surprise me"];

/** Top bar: current trip title and summary, planning-mode toggle, and the overflow menu button. */
export function TripHeader({ tripId, leading }: { tripId: string; leading?: ReactNode }) {
  const trip = useTrip(tripId);
  // Only visual for now. Lift into the page and pass to the chat feature when the backend uses it.
  const [mode, setMode] = useState<PlanningMode>("Co-pilot");

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line bg-canvas/90 px-5 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        {leading}
        <div>
          {trip.status === "success" ? (
            <>
              <div className="font-display text-lg font-semibold">{trip.data.title}</div>
              <div className="hidden text-xs text-muted sm:block">
                {formatDateRange(trip.data.startDate, trip.data.endDate)} · {trip.data.travelers} travelers · From {trip.data.origin}
              </div>
            </>
          ) : (
            <div className="font-display text-lg font-semibold text-muted">{trip.status === "error" ? "Couldn’t load trip" : "Loading trip…"}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1 rounded-full border border-line bg-white p-1 sm:flex">
          {planningModes.map((item) => (
            <Action key={item} onClick={() => setMode(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mode === item ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
              {item}
            </Action>
          ))}
        </div>
        <Action className="grid size-9 place-items-center rounded-full border border-line bg-white">
          <Icon name="more" className="size-5" />
        </Action>
      </div>
    </header>
  );
}
