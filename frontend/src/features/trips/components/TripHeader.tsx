import type { ReactNode } from "react";
import { formatDateRange } from "../../../lib/format";
import { useSettings } from "../../settings";
import { useTrip } from "../hooks/useTrips";

/** Top bar: current trip title and summary, and the planning-mode label. */
export function TripHeader({ tripId, title, leading }: { tripId: string; title: string; leading?: ReactNode }) {
  // The title comes from the sidebar's list so it updates the moment a journey is named.
  const trip = useTrip(tripId, title);
  const details = trip.status === "success" ? trip.data : undefined;
  const summary = [
    details?.startDate && details.endDate ? formatDateRange(details.startDate, details.endDate) : undefined,
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
      {/* Shows the planning style; change it in Settings. */}
      <div className="hidden rounded-full border border-line bg-surface p-1 sm:block">
        <div className="rounded-full bg-deep px-3 py-1.5 text-xs font-semibold text-white">{planningStyle}</div>
      </div>
    </header>
  );
}
