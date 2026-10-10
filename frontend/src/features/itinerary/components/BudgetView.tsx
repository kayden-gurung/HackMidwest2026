import { Icon } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { budgetCategories, budgetTotals, inTripOrder, totalCost } from "../lib/itinerary";
import type { Itinerary } from "../types";
import { categoryStyle } from "./categoryStyle";
import { ItemRow } from "./ItemRow";

/** Budget tab: the total against the plan, then every itinerary item listed under its category. */
export function BudgetView({ itinerary, onShowOnMap }: { itinerary: Itinerary; onShowOnMap: (itemId: string) => void }) {
  const { spentUsd, remainingUsd, percentUsed, unknownCosts } = budgetTotals(itinerary);
  const over = remainingUsd != null && remainingUsd < 0;

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Estimated trip cost</div>
      <div className="mt-1 font-display text-3xl font-semibold">{formatUsd(spentUsd)}</div>
      <div className="mt-1 text-sm text-muted">{itinerary.budget.plannedUsd == null ? "No budget limit set" : `of ${formatUsd(itinerary.budget.plannedUsd)} budget`}</div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${over ? "bg-coral" : "bg-sea"}`} style={{ width: `${Math.min(percentUsed, 100)}%` }} /></div>
      {remainingUsd != null && <div className={`mt-2 text-xs font-semibold ${over ? "text-coral" : "text-sea"}`}>{over ? `${formatUsd(-remainingUsd)} over budget` : `${formatUsd(remainingUsd)} left in budget`}</div>}
      <p className="mt-3 text-xs leading-5 text-muted">Planning estimates, not live quotes or bookings.{unknownCosts > 0 && ` ${unknownCosts} ${unknownCosts === 1 ? "item has" : "items have"} an unknown cost and ${unknownCosts === 1 ? "is" : "are"} excluded from this total.`}</p>

      <div className="mt-6 space-y-6">
        {budgetCategories.map((category) => {
          const items = inTripOrder(itinerary.items.filter((item) => item.category === category));
          const style = categoryStyle[category];
          return (
            <section key={category} aria-label={category}>
              <div className="flex items-center gap-3">
                <div className={`grid size-9 place-items-center rounded-lg ${style.chip}`}><Icon name={style.icon} className="size-4" /></div>
                <div className="flex-1">
                  <div className="text-sm font-bold">{category}</div>
                  <div className="text-xs text-muted">{items.length === 0 ? "Nothing planned yet" : `${items.length} ${items.length === 1 ? "item" : "items"}`}</div>
                </div>
                <div className="text-sm font-bold">{formatUsd(totalCost(items))}</div>
              </div>
              {items.length > 0 && (
                <div className="mt-3 space-y-2">
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} showDate onShowOnMap={onShowOnMap} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
