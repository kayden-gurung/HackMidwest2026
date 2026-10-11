import { useState } from "react";
import { config } from "../../config/env";
import { ChatPanel } from "../../features/chat/components/ChatPanel";
import { useChat } from "../../features/chat/hooks/useChat";
import { useItinerary } from "../../features/itinerary/hooks/useItinerary";
import { MapView } from "../../features/itinerary/components/MapView";
import { PlanView } from "../../features/itinerary/components/PlanView";
import { BudgetView } from "../../features/itinerary/components/BudgetView";
import { driveChangePrompt, roadTripConstraints, roadTripStore, type DriveAction } from "../api/roadTripStore";
import { demoPlan } from "../data/mockData";
import type { DriveDraft } from "../types";
import DemoDriveWorkspace from "./DemoDriveWorkspace";
import { Icon } from "./ui";

export default function DriveWorkspace({ draft, tripId, onEdit }: { draft: DriveDraft; tripId: string; onEdit: () => void }) {
  if (config.useMocks) return <DemoDriveWorkspace draft={draft} plan={demoPlan} onEdit={onEdit} />;
  return <LiveDriveWorkspace key={tripId} draft={draft} tripId={tripId} onEdit={onEdit} />;
}

function LiveDriveWorkspace({ draft, tripId, onEdit }: { draft: DriveDraft; tripId: string; onEdit: () => void }) {
  const [view, setView] = useState<"Map" | "Stops" | "Budget">("Map");
  const [focused, setFocused] = useState<string>();
  const [city, setCity] = useState(draft.destination);
  const { data: itinerary, updating, awaitingApproval, failed } = useItinerary(tripId);
  const chat = useChat(tripId, { interests: draft.interests, currency: "USD" }, "Co-pilot");
  const busy = updating || awaitingApproval;
  const road = itinerary?.roadTrip;
  const assumptions = roadTripStore.get(tripId) ?? roadTripConstraints(draft);
  const drivingMinutes = road ? Math.round(road.drivingMinutes) : 0;
  const focus = (id: string) => { setFocused(id); setView("Map"); };
  const actions: { id: DriveAction; label: string }[] = [
    { id: "route", label: "Different road route" }, { id: "towns", label: "Different small towns" },
    { id: "activities", label: "Different attractions" }, { id: "restaurants", label: "Different restaurants" },
  ];

  return <div className="flex h-full min-h-0 flex-col">
    <header className="shrink-0 border-b border-line bg-canvas px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-school"><Icon name="car" className="size-3.5" /> Drive plan · Live</div>
          <h1 className="mt-1 font-display text-2xl font-semibold">{draft.start} → {draft.destination}</h1>
          <p className="mt-1 text-xs text-muted">One way · {draft.maxMilesPerDay} miles/day · {assumptions.mpg} MPG and ${assumptions.gas_price.toFixed(2)}/gallon assumed</p>
        </div>
        <button type="button" disabled={busy} onClick={onEdit} className="rounded-md border border-line px-4 py-2 text-xs font-bold disabled:opacity-50">Plan another drive</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Verified driving estimates">
        {[
          ["Road distance", road ? `${road.distanceMiles.toFixed(1)} mi` : "Awaiting route"],
          ["Driving time", road ? `${Math.floor(drivingMinutes / 60)}h ${drivingMinutes % 60}m` : "Awaiting route"],
          ["Extra driving", road ? `${road.detourMinutes.toFixed(1)} / ${road.detourBudgetMinutes} min` : `${draft.detourBudget} min limit`],
          ["Estimated fuel", road ? `$${road.fuelCostUsd.toFixed(2)} (+$${road.extraFuelCostUsd.toFixed(2)} for detours)` : "Awaiting route"],
        ].map(([label, value]) => <div key={label} className="rounded-md border border-line bg-white p-3"><div className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</div><div className="mt-1 text-xs font-bold">{value}</div></div>)}
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] lg:overflow-hidden">
      <section aria-label="Drive itinerary" className="min-h-0 overflow-y-auto border-b border-line p-5 lg:border-b-0 lg:border-r">
        <div className="rounded-md border border-line bg-white p-4">
          <h2 className="text-sm font-bold">What would you like to change?</h2>
          <label className="mt-3 block text-xs text-muted">City for attractions and restaurants
            <input aria-label="City for replacement stops" value={city} onChange={(event) => setCity(event.target.value)} disabled={busy} className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-ink" />
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {actions.map((action) => <button key={action.id} type="button" disabled={busy || !itinerary || ((action.id === "activities" || action.id === "restaurants") && !city.trim())}
              onClick={() => chat.send(driveChangePrompt(action.id, city))} className="rounded-md border border-line px-3 py-2.5 text-left text-xs font-semibold hover:bg-mint disabled:cursor-not-allowed disabled:opacity-40">{action.label} <span aria-hidden="true">↗</span></button>)}
          </div>
          <p className="mt-3 text-[10px] leading-5 text-muted">Review the proposed changes in chat before they replace your plan. You can also describe a change in your own words.</p>
        </div>
        <div role="status" className="my-4 text-xs text-school">{awaitingApproval ? "Review the proposal in chat. Your current route stays here until you approve." : updating ? "Looking up places and checking the complete route…" : failed ? "The request could not finish. Retry in chat; your current plan is kept." : itinerary ? "Locations and routes come from map lookups. Prices are planning estimates." : "Your stops and map will appear when the plan is ready."}</div>
        <div className="mb-5 flex border-b border-line" role="tablist" aria-label="Drive views">
          {(["Map", "Stops", "Budget"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={view === tab} onClick={() => setView(tab)} className={`flex-1 border-b-2 px-3 py-3 text-xs font-bold ${view === tab ? "border-school text-school" : "border-transparent text-muted"}`}>{tab}</button>)}
        </div>
        {itinerary && <>
          {view === "Map" && <MapView itinerary={itinerary} focusedItemId={focused} onFocusItem={setFocused} />}
          {view === "Stops" && <PlanView itinerary={itinerary} onShowOnMap={focus} onOpenBudget={() => setView("Budget")} />}
          {view === "Budget" && <BudgetView itinerary={itinerary} onShowOnMap={focus} />}
          {itinerary.assumptions?.length ? <details className="mt-5 text-xs leading-5 text-muted"><summary className="cursor-pointer font-bold">Sources and assumptions</summary><ul className="mt-2 list-disc space-y-2 pl-4">{itinerary.assumptions.map((assumption, i) => <li key={i}>{assumption}</li>)}</ul></details> : null}
        </>}
      </section>
      <div className="flex min-h-[500px] flex-col bg-white lg:min-h-0"><ChatPanel tripId={tripId} preferences={{ interests: draft.interests, currency: "USD" }} mode="Co-pilot" /></div>
    </div>
  </div>;
}
