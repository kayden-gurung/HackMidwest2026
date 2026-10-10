import { useState, type ReactNode } from "react";
import { Action, Icon } from "../../../components/ui";
import { formatDateRange } from "../../../lib/format";
import { useTrip } from "../hooks/useTrips";
import type { PlanningMode } from "../types";

const planningModes: PlanningMode[] = ["Co-pilot", "Surprise me"];

/** Top bar: current trip title and summary, planning-mode toggle, and the overflow menu button. */
export function TripHeader({ tripId, title, leading }: { tripId: string; title: string; leading?: ReactNode }) {
  // The title comes from the sidebar's list so it updates the moment a journey is named.
  const trip = useTrip(tripId, title);
  const details = trip.status === "success" ? trip.data : undefined;
  const summary = [
    details?.startDate && details.endDate ? formatDateRange(details.startDate, details.endDate) : undefined,
    details?.travelers ? `${details.travelers} ${details.travelers === 1 ? "traveler" : "travelers"}` : undefined,
    details?.origin ? `From ${details.origin}` : undefined,
  ].filter(Boolean);
  // Only visual for now. Lift into the page and pass to the chat feature when the backend uses it.
  const [mode, setMode] = useState<PlanningMode>("Co-pilot");

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
