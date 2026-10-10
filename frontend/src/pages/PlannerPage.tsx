import { BrandMark } from "../components/ui";
import { ChatPanel } from "../features/chat";
import { TripPanel } from "../features/itinerary";
import { ProfilePanel } from "../features/profile";
import { TripHeader, TripNavigation } from "../features/trips";

// Until "New journey" and trip switching exist, the planner always shows this trip.
const CURRENT_TRIP_ID = "puglia";

/** The trip planner screen. It only lays out feature components; logic lives in the features. */
export function PlannerPage() {
  const tripId = CURRENT_TRIP_ID;

  return (
    <div className="min-h-screen bg-canvas text-ink lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sidebar p-4 lg:flex">
          <div className="flex items-center gap-2.5 px-2 py-3">
            <BrandMark />
            <div className="font-display text-xl font-semibold tracking-tight">Roam</div>
          </div>
          <TripNavigation activeTripId={tripId} />
          <div className="mt-auto">
            <ProfilePanel />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <TripHeader tripId={tripId} leading={<BrandMark className="lg:hidden" />} />
          <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_390px]">
            <ChatPanel key={tripId} tripId={tripId} />
            <TripPanel tripId={tripId} />
          </div>
        </main>
      </div>
    </div>
  );
}
