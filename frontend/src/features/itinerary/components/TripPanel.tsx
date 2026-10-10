import { useState } from "react";
import { Action, EmptyState, ErrorState, LoadingState } from "../../../components/ui";
import { useItinerary } from "../hooks/useItinerary";
import { BudgetView } from "./BudgetView";
import { MapView } from "./MapView";
import { PlanView } from "./PlanView";

const views = ["Plan", "Map", "Budget"] as const;
type View = (typeof views)[number];

/** Right-hand panel with Plan / Map / Budget tabs for the current trip. */
export function TripPanel({ tripId }: { tripId: string }) {
  const [activeView, setActiveView] = useState<View>("Plan");
  // The stop highlighted on the map. Set from any tab's "Show on map", or by clicking a marker.
  const [focusedItemId, setFocusedItemId] = useState<string>();
  const itinerary = useItinerary(tripId);

  const showOnMap = (itemId: string) => {
    setFocusedItemId(itemId);
    setActiveView("Map");
  };

  return (
    <aside className="hidden min-h-0 flex-col bg-panel xl:flex">
      <div className="flex border-b border-line px-5">
        {views.map((view) => (
          <Action key={view} onClick={() => setActiveView(view)} className={`flex-1 border-b-2 px-2 py-4 text-center text-xs font-bold ${activeView === view ? "border-sea text-sea" : "border-transparent text-muted"}`}>
            {view}
          </Action>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {itinerary.status === "loading" && <LoadingState label="Loading itinerary…" />}
        {itinerary.status === "error" && <ErrorState message="Couldn’t load the itinerary." onRetry={itinerary.reload} />}
        {itinerary.status === "success" && !itinerary.data && <EmptyState message="Your plan and revisions appear in the conversation." />}
        {itinerary.status === "success" && itinerary.data && (
          <>
            {activeView === "Plan" && <PlanView itinerary={itinerary.data} onShowOnMap={showOnMap} onOpenBudget={() => setActiveView("Budget")} />}
            {activeView === "Map" && <MapView itinerary={itinerary.data} focusedItemId={focusedItemId} onFocusItem={setFocusedItemId} />}
            {activeView === "Budget" && <BudgetView itinerary={itinerary.data} onShowOnMap={showOnMap} />}
          </>
        )}
      </div>
    </aside>
  );
}
