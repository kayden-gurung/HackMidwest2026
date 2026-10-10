import { useState } from "react";
import { Action, EmptyState } from "../../../components/ui";
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
    <aside aria-label="Trip itinerary" aria-busy={itinerary.updating} className="hidden min-h-0 flex-col bg-panel xl:flex">
      <div className="flex border-b border-line px-5">
        {views.map((view) => (
          <Action key={view} onClick={() => setActiveView(view)} className={`flex-1 border-b-2 px-2 py-4 text-center text-xs font-bold ${activeView === view ? "border-sea text-sea" : "border-transparent text-muted"}`}>
            {view}
          </Action>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {itinerary.updating && <div role="status" className="mb-4 rounded-xl bg-sea/10 p-3 text-xs font-semibold text-sea">Roam is planning… These panels update with the reply.</div>}
        {itinerary.failed && <div className="mb-4 text-xs text-muted">Roam couldn’t finish that request. Retry in chat.{itinerary.data && " Your previous plan is still here."}</div>}
        {!itinerary.data && <EmptyState message={itinerary.updating ? "Building your trip from the conversation…" : "Tell Roam where you want to go. Your itinerary, map stops and estimated budget will appear here."} />}
        {itinerary.data && (
          <>
            {itinerary.data.summary && <p className="mb-4 text-sm leading-6 text-ink/80">{itinerary.data.summary}</p>}
            {activeView === "Plan" && <PlanView itinerary={itinerary.data} onShowOnMap={showOnMap} onOpenBudget={() => setActiveView("Budget")} />}
            {activeView === "Map" && <MapView itinerary={itinerary.data} focusedItemId={focusedItemId} onFocusItem={setFocusedItemId} />}
            {activeView === "Budget" && <BudgetView itinerary={itinerary.data} onShowOnMap={showOnMap} />}
            {itinerary.data.assumptions && itinerary.data.assumptions.length > 0 && <div className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted"><div className="font-bold">Planning assumptions</div><ul className="mt-1 list-disc space-y-1 pl-4">{itinerary.data.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></div>}
          </>
        )}
      </div>
    </aside>
  );
}
