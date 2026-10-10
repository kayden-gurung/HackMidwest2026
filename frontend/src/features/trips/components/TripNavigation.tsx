import { useState, type ReactNode } from "react";
import { Action, EmptyState, ErrorState, Icon, LoadingState } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import type { TripSummary } from "../types";

/** "Italy · $3,200" when known, otherwise where the journey stands. */
function tripMeta(trip: TripSummary): string {
  const known = [trip.country, trip.budgetUsd === undefined ? undefined : formatUsd(trip.budgetUsd)].filter(Boolean);
  if (known.length > 0) return known.join(" · ");
  return trip.isDraft ? "Not started yet" : "Planning in progress";
}

function matchesQuery(trip: TripSummary, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${trip.title} ${trip.country ?? ""}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** Sidebar block: "New journey", optional screen links, trip search, and the recent journeys list. */
export function TripNavigation({
  trips,
  status,
  activeTripId,
  onSelect,
  onNewTrip,
  onRetry,
  links,
}: {
  trips: TripSummary[];
  status: "loading" | "success" | "error";
  activeTripId?: string;
  onSelect: (tripId: string) => void;
  onNewTrip: () => void;
  onRetry: () => void;
  /** Rendered under "New journey", e.g. the My trips / Explore links. */
  links?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const visibleTrips = searching ? trips.filter((trip) => matchesQuery(trip, query)) : trips;

  return (
    <>
      <Action
        onClick={() => {
          // A new journey always lands at the top, so clear the filter that might hide it.
          setQuery("");
          onNewTrip();
        }}
        className="mt-5 flex items-center gap-2 rounded-xl bg-ink px-3.5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sea"
      >
        <Icon name="plus" className="size-4" /> New journey
      </Action>

      {links}

      <div className="mt-7 flex items-center gap-2 rounded-xl border border-line bg-white/60 px-3 py-2.5 text-sm text-muted transition-colors focus-within:border-sea focus-within:bg-white">
        <Icon name="search" className="size-4 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setQuery("")}
          placeholder="Search your trips"
          aria-label="Search your trips"
          className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
        />
        {searching && (
          <Action label="Clear search" onClick={() => setQuery("")} className="grid size-5 shrink-0 place-items-center rounded-full hover:text-ink">
            <Icon name="plus" className="size-4 rotate-45" />
          </Action>
        )}
      </div>

      <div className="mt-7 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">{searching ? "Matching journeys" : "Recent journeys"}</div>
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {status === "loading" && <LoadingState label="Loading trips…" />}
        {status === "error" && <ErrorState message="Couldn’t load trips." onRetry={onRetry} />}
        {status === "success" && trips.length === 0 && <EmptyState message="No trips yet. Start a new journey." />}
        {status === "success" && trips.length > 0 && visibleTrips.length === 0 && <EmptyState message={`No trips match “${query.trim()}”.`} />}
        {visibleTrips.map((trip) => {
          const active = trip.id === activeTripId;
          return (
            <Action key={trip.id} onClick={() => onSelect(trip.id)} className={`group rounded-xl px-3 py-3 ${active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{trip.title}</div>
                  <div className="mt-1 text-xs text-muted">{tripMeta(trip)}</div>
                </div>
                {active && <Icon name="more" className="mt-0.5 size-4 shrink-0 text-muted" />}
              </div>
            </Action>
          );
        })}
      </div>
    </>
  );
}
