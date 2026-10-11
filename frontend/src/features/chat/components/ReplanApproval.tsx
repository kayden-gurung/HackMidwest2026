import type { PlanApproval, PlanProposal } from "../types";

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

function stopLabel(item: NonNullable<PlanProposal["changes"][number]["after"]>) {
  return `${item.date}${item.time ? ` · ${item.time}` : ""} · ${item.category} · ${item.costUsd == null ? "cost TBD" : `${usd(item.costUsd)} estimated`}`;
}

export function ReplanApproval({ approval, busy, onResolve }: { approval: PlanApproval; busy: boolean; onResolve: (approved: boolean) => void }) {
  return (
    <section aria-label="Review proposed re-plan" className="rounded-2xl border border-sea/30 bg-surface p-5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sea">Act, with consent</div>
      <h3 className="mt-2 font-display text-xl font-semibold">Your re-plan is ready to review</h3>
      <p className="mt-2 text-xs leading-5 text-muted">Roam is paused. Your current plan stays in place until you approve. This review is available for {Math.round(approval.expires_in_seconds / 60)} minutes.</p>
      {approval.interrupts.map((interrupt) => {
        const proposal = interrupt.reason;
        const plan = proposal.itinerary;
        return <div key={interrupt.id} className="mt-4">
          <p className="text-sm leading-6">{proposal.summary}</p>
          <div className="mt-3 rounded-xl bg-panel p-3 text-xs leading-5">
            {plan.overview?.headline && <div className="mb-1 font-semibold">{plan.overview.headline}</div>}
            <div>{plan.startDate} to {plan.endDate}{plan.overview?.destination ? ` · ${plan.overview.destination}` : ""}</div>
            <div className="mt-1 font-semibold">Estimated total: {usd(proposal.before_total_usd)} → {usd(proposal.after_total_usd)}</div>
            <div className="text-muted">{proposal.unchanged_stops} stops kept{plan.budget.plannedUsd != null ? ` · ${usd(plan.budget.plannedUsd)} trip budget` : ""}</div>
            {proposal.unknown_costs > 0 && <div className="text-muted">{proposal.unknown_costs} unknown costs excluded from the total.</div>}
            {plan.budget.plannedUsd != null && proposal.after_total_usd > plan.budget.plannedUsd && <div className="mt-1 font-semibold text-amber-700">{usd(proposal.after_total_usd - plan.budget.plannedUsd)} above your budget.</div>}
          </div>
          <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto" aria-label="Proposed stop changes">
            {proposal.changes.map((change, index) => <li key={index} className="border-l-2 border-sea/30 pl-3 text-xs leading-5">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sea">{change.type === "changed" ? "Change" : change.type === "removed" ? "Remove" : "Add"}</div>
              {change.before && <div className="text-muted"><div className={change.type === "removed" || change.before.title !== change.after?.title ? "line-through" : ""}>{change.before.title}</div><div>{stopLabel(change.before)}</div></div>}
              {change.after && <div className="mt-1"><div className="font-semibold">{change.after.title}</div><div className="text-muted">{stopLabel(change.after)}</div>{change.after.location && <div className="text-muted">{change.after.location.name}{change.after.location.address ? ` · ${change.after.location.address}` : ""}</div>}{change.after.description && <div className="mt-1 text-muted">{change.after.description}</div>}{change.after.sourceUrls?.filter((url) => /^https?:\/\//.test(url)).map((url, source) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mr-2 text-sea underline">Source {source + 1} ↗</a>)}</div>}
            </li>)}
          </ul>
          {plan.assumptions?.length ? <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">Planning assumptions</summary><ul className="mt-2 list-disc space-y-1 pl-4">{plan.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
          {proposal.accuracy_notes?.length ? <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">Validation notes ({proposal.accuracy_notes.length})</summary><ul className="mt-2 list-disc space-y-2 pl-4 leading-5">{proposal.accuracy_notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details> : null}
          <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">View complete proposed plan</summary><ol className="mt-2 max-h-56 space-y-2 overflow-y-auto">{plan.items.map((item) => <li key={item.id}><div className="font-semibold text-ink">{item.title}</div><div>{stopLabel(item)}</div></li>)}</ol></details>
        </div>;
      })}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => onResolve(true)} className="rounded-xl bg-sea px-4 py-2.5 text-xs font-bold text-white hover:bg-deep disabled:cursor-wait disabled:opacity-60">{busy ? "Resuming Roam…" : "Approve re-plan"}</button>
        <button type="button" disabled={busy} onClick={() => onResolve(false)} className="rounded-xl border border-line px-4 py-2.5 text-xs font-semibold hover:bg-panel disabled:cursor-wait disabled:opacity-60">Keep current plan</button>
      </div>
    </section>
  );
}
