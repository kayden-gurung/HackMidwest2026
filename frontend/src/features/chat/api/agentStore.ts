import type { PlanApproval, XrayEvent } from "../types";

interface AgentState {
  runId?: string;
  events: XrayEvent[];
  approval?: PlanApproval;
}

const states = new Map<string, AgentState>();
const listeners = new Set<() => void>();
const EMPTY: AgentState = { events: [] };

function change(tripId: string, patch: Partial<AgentState>) {
  states.set(tripId, { ...(states.get(tripId) ?? EMPTY), ...patch });
  listeners.forEach((listener) => listener());
}

/** Real hook events and pending SDK interrupts, isolated by journey and held in browser memory. */
export const agentStore = {
  get: (tripId: string): AgentState => states.get(tripId) ?? EMPTY,
  begin: (tripId: string) => change(tripId, { runId: undefined, events: [], approval: undefined }),
  setRun: (tripId: string, runId: string) => change(tripId, { runId }),
  setApproval: (tripId: string, approval?: PlanApproval) => change(tripId, { approval }),
  record(tripId: string, event: XrayEvent) {
    const events = (states.get(tripId) ?? EMPTY).events;
    if (events.some((item) => item.id === event.id)) return;
    change(tripId, { events: [...events, event].slice(-250) });
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
