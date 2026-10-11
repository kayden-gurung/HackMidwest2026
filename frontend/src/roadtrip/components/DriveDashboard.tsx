import type { DriveDraft } from "../types";
import { Icon } from "./ui";

export interface DriveSession { id: string; draft: DriveDraft }

export default function DriveDashboard({ sessions, onNew, onOpen }: { sessions: DriveSession[]; onNew: () => void; onOpen: (id: string) => void }) {
  return <div className="h-full overflow-y-auto px-5 py-8 md:px-10">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div><p className="text-[10px] font-bold uppercase tracking-widest text-school">Roam planner</p><h1 className="mt-2 font-display text-4xl font-semibold">Your drives</h1><p className="mt-2 text-sm text-muted">Places worth pulling over for, planned around your route.</p></div>
        <button type="button" onClick={onNew} className="flex items-center gap-2 rounded-md bg-school px-5 py-3 text-xs font-bold text-white"><Icon name="plus" className="size-4" /> New trip</button>
      </div>
      {sessions.length ? <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map(({ id, draft }) => <button key={id} type="button" onClick={() => onOpen(id)} className="rounded-md border border-line bg-white p-5 text-left hover:border-school">
          <Icon name="car" className="text-school" /><h2 className="mt-4 font-display text-xl font-semibold">{draft.start} → {draft.destination}</h2><p className="mt-2 text-xs text-muted">{draft.departureDate} · {draft.detourBudget} extra driving minutes</p><p className="mt-4 text-xs font-bold text-school">Open plan and conversation ↗</p>
        </button>)}
      </div> : <div className="mt-10 rounded-md border border-dashed border-line p-10 text-center"><Icon name="compass" className="mx-auto size-8 text-school" /><h2 className="mt-4 font-display text-2xl">Where will the road take you?</h2><p className="mt-2 text-sm text-muted">Choose a start, a destination, and what you enjoy along the way.</p><button type="button" onClick={onNew} className="mt-5 rounded-md bg-school px-5 py-3 text-xs font-bold text-white">Plan your first drive</button></div>}
      <p className="mt-7 text-xs leading-5 text-muted">Plans and conversations are kept in this browser session. Reloading clears them. Place and routing outages are reported in chat; fuel and other costs are estimates.</p>
    </div>
  </div>;
}
