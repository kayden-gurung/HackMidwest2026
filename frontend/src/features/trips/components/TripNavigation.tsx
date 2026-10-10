import { Action, EmptyState, ErrorState, Icon, LoadingState } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { useTripList } from "../hooks/useTrips";

/** Sidebar block: "New journey", trip search, and the recent journeys list. */
export function TripNavigation({ activeTripId }: { activeTripId: string }) {
  const trips = useTripList();

  return (
    <>
      <Action className="mt-5 flex items-center gap-2 rounded-xl bg-ink px-3.5 py-3 text-sm font-semibold text-white shadow-sm">
        <Icon name="plus" className="size-4" /> New journey
      </Action>

      <div className="mt-7 flex items-center gap-2 rounded-xl border border-line bg-white/60 px-3 py-2.5 text-sm text-muted">
        <Icon name="search" className="size-4" />
        <div>Search your trips</div>
      </div>

      <div className="mt-7 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Recent journeys</div>
      <div className="mt-2 space-y-1">
        {trips.status === "loading" && <LoadingState label="Loading trips…" />}
        {trips.status === "error" && <ErrorState message="Couldn’t load trips." onRetry={trips.reload} />}
        {trips.status === "success" && trips.data.length === 0 && <EmptyState message="No trips yet. Start a new journey." />}
        {trips.data?.map((trip) => {
          const active = trip.id === activeTripId;
          return (
            <Action key={trip.id} className={`group rounded-xl px-3 py-3 ${active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{trip.title}</div>
                  <div className="mt-1 text-xs text-muted">
                    {trip.country} · {formatUsd(trip.budgetUsd)}
                  </div>
                </div>
                {active && <Icon name="more" className="mt-0.5 size-4 text-muted" />}
              </div>
            </Action>
          );
        })}
      </div>
    </>
  );
}
