import { useState } from "react";
import { BrandMark, EmptyState, ErrorState, LoadingState } from "../components/ui";
import { ChatPanel } from "../features/chat";
import { TripPanel } from "../features/itinerary";
import { ProfilePanel } from "../features/profile";
import { TripHeader, TripNavigation, useTrips } from "../features/trips";

/**
 * The trip planner screen. It lays out feature components and owns the one piece of state they
 * share: which journey is open. Everything else lives in the features.
 */
export function PlannerPage() {
  const { trips, status, reload, startNewTrip, nameDraftFromMessage } = useTrips();
  const [selectedTripId, setSelectedTripId] = useState<string>();
  // Until the traveler picks one, the newest journey is open.
  const activeTrip = trips.find((trip) => trip.id === selectedTripId) ?? trips[0];

  const openNewTrip = () => {
    startNewTrip().then((trip) => setSelectedTripId(trip.id), () => undefined);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sidebar p-4 lg:flex lg:h-screen">
          <div className="flex items-center gap-2.5 px-2 py-3">
            <BrandMark />
            <div className="font-display text-xl font-semibold tracking-tight">Roam</div>
          </div>
          <TripNavigation trips={trips} status={status} activeTripId={activeTrip?.id} onSelect={setSelectedTripId} onNewTrip={openNewTrip} onRetry={reload} />
          <div className="mt-3 shrink-0">
            <ProfilePanel />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col lg:h-screen">
          {activeTrip ? (
            <>
              <TripHeader tripId={activeTrip.id} title={activeTrip.title} leading={<BrandMark className="lg:hidden" />} />
              <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_390px]">
                {/* Keyed by trip so each journey gets its own composer and scroll position. */}
                <ChatPanel key={activeTrip.id} tripId={activeTrip.id} onUserMessage={(text) => nameDraftFromMessage(activeTrip.id, text)} />
                <TripPanel key={`panel-${activeTrip.id}`} tripId={activeTrip.id} />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8">
              {status === "loading" && <LoadingState label="Loading your journeys…" />}
              {status === "error" && <ErrorState message="Couldn’t load your journeys." onRetry={reload} />}
              {status === "success" && <EmptyState message="No journeys yet. Start one with “New journey”." />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
