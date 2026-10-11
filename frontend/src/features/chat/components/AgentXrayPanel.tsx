import { config } from "../../../config/env";
import type { XrayEvent } from "../types";

const roles: { id: XrayEvent["agent"]; name: string; detail: string }[] = [
  { id: "orchestrator", name: "Roam", detail: "Orchestrator" },
  { id: "places", name: "Places", detail: "Verified stops" },
  { id: "transport", name: "Transport", detail: "Routes & travel" },
  { id: "budget", name: "Budget", detail: "Costs & tradeoffs" },
];

export const toolLabels: Record<string, string> = {
  research_places: "Delegate to Places", plan_transport: "Delegate to Transport", review_trip_budget: "Delegate to Budget",
  find_options: "Find places for a change", edit_stops: "Edit stops and check the route",
  find_places: "Search real places", locate: "Locate a stop", plan_drive: "Calculate a route", find_airports: "Find airports", flight_links: "Build flight search links", get_forecast: "Check the forecast", check_budget: "Check the budget", calculate_budget: "Check estimated costs", update_itinerary: "Propose itinerary update",
};

function eventLabel(event: XrayEvent): string {
  if (event.kind === "tool_started") return toolLabels[event.tool ?? ""] ?? event.tool ?? "Tool started";
  if (event.kind === "tool_finished") return `${toolLabels[event.tool ?? ""] ?? event.tool} · ${event.status === "success" ? "complete" : event.status}`;
  if (event.kind === "consent_resolved") return event.status === "approved" ? "Traveler approved the re-plan" : "Traveler kept the current plan";
  if (event.kind === "agent_started") return "Agent started";
  if (event.kind === "agent_finished") return event.status === "interrupt" ? "Paused for your approval" : event.status === "error" ? "Agent stopped with an error" : "Agent finished";
  return event.kind === "model_started" ? "Considering the next step" : "Model response received";
}

/** Displays execution facts from SDK hooks; model reasoning is never displayed. */
export function AgentXrayPanel({ events, running, awaiting, failed }: { events: XrayEvent[]; running: boolean; awaiting: boolean; failed: boolean }) {
  const activity = events.filter((event) => event.kind !== "model_started" && event.kind !== "model_finished").slice(-12);
  return (
    <details open={running || awaiting || undefined} className="rounded-2xl border border-line bg-panel/70 text-xs">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-semibold">
        <span>Agent X-ray <span className="ml-1.5 font-normal text-muted">· Strands</span></span>
        <span role="status" className={awaiting || failed ? "text-amber-700" : "text-sea"}>{config.useMocks ? "Example mode" : awaiting ? "Awaiting consent" : running ? "Live" : failed ? "Run stopped" : events.length ? "Run complete" : "Ready"}</span>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {roles.map((role) => {
            const last = events.filter((event) => event.agent === role.id).at(-1);
            const active = running && last && last.kind !== "agent_finished";
            const status = awaiting && role.id === "orchestrator" ? "Paused" : failed && role.id === "orchestrator" ? "Stopped" : active ? "Working" : last?.status === "error" ? "Error" : last ? "Done" : "Standby";
            return <div key={role.id} className={`rounded-xl border p-2.5 ${active ? "border-sea/40 bg-sea/5" : "border-line bg-surface"}`}>
              <div className="flex items-center gap-1.5 font-semibold"><span className={`size-1.5 rounded-full ${active ? "animate-pulse bg-sea" : status === "Paused" ? "bg-amber-500" : "bg-muted/40"}`} />{role.name}</div>
              <div className="mt-1 text-[10px] text-muted">{role.detail}</div>
              <div className="mt-2 text-[10px] font-semibold text-sea">{status}</div>
            </div>;
          })}
        </div>
        {activity.length > 0 ? <ol aria-label="Agent execution events" className="mt-3 max-h-40 space-y-2 overflow-y-auto">
          {activity.map((event) => <li key={event.id} className="flex items-start justify-between gap-3">
            <span><span className="mr-2 font-semibold text-sea">{roles.find((role) => role.id === event.agent)?.name ?? event.agent}</span><span className="text-muted">{eventLabel(event)}</span></span>
            {event.duration_ms != null && <span className="shrink-0 tabular-nums text-muted">{(event.duration_ms / 1000).toFixed(1)}s</span>}
          </li>)}
        </ol> : <p className="mt-3 leading-5 text-muted">{config.useMocks ? "Example conversations do not run live agents. Switch off mock mode to see execution." : "See which specialist Roam calls, the tools it uses, and where it pauses for your approval."}</p>}
      </div>
    </details>
  );
}
