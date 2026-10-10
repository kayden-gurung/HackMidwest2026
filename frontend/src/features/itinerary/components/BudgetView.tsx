import { Icon, type IconName } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { budgetTotals } from "../hooks/useItinerary";
import type { BudgetCategory, Itinerary } from "../types";

const categoryIcon: Record<BudgetCategory, IconName> = {
  Flights: "plane",
  Stays: "hotel",
  Food: "utensils",
  Activities: "sun",
};

export function BudgetView({ budget }: { budget: Itinerary["budget"] }) {
  const { spentUsd } = budgetTotals(budget);

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Trip budget</div>
      <div className="mt-1 font-display text-3xl font-semibold">{formatUsd(spentUsd)}</div>
      <div className="mt-1 text-sm text-muted">of {formatUsd(budget.plannedUsd)} planned</div>
      <div className="mt-6 space-y-3">
        {budget.lines.map((line) => (
          <div key={line.category} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <div className="grid size-9 place-items-center rounded-lg bg-mint text-sea"><Icon name={categoryIcon[line.category]} className="size-4" /></div>
            <div className="flex-1 text-sm font-semibold">{line.category}</div><div className="text-sm font-bold">{formatUsd(line.amountUsd)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
