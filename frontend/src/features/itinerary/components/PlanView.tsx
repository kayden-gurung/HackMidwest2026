import { useState } from "react";
import { Action, Icon } from "../../../components/ui";
import { formatDateRange, formatUsd, nightsBetween, parseIsoDate } from "../../../lib/format";
import { budgetTotals, itemsOn, totalCost, tripDates } from "../lib/itinerary";
import type { DayAccent, Itinerary, Place } from "../types";
import { ItemRow } from "./ItemRow";

// Full class names so Tailwind can see them.
const accentClass: Record<DayAccent, string> = {
  blue: "before:bg-blue",
  yellow: "before:bg-yellow",
  green: "before:bg-green",
  coral: "before:bg-coral",
};
const accentOrder: DayAccent[] = ["blue", "yellow", "green", "coral"];

/** Days shown before "View all days" is pressed. */
const COLLAPSED_DAY_COUNT = 4;

function PlaceCard({ place }: { place: Place }) {
  const isStay = place.kind === "stay";
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className={`grid size-8 place-items-center rounded-lg ${isStay ? "bg-mint text-sea" : "bg-peach text-coral"}`}>
        <Icon name={isStay ? "hotel" : "utensils"} className="size-4" />
      </div>
      <div className="mt-3 text-sm font-bold">{place.name}</div>
      <div className="mt-1 text-xs text-muted">
        {place.kind === "stay" ? `${formatUsd(place.pricePerNightUsd)}/night` : place.cuisine} · {place.rating}
      </div>
    </div>
  );
}

export function PlanView({
  itinerary,
  onShowOnMap,
  onOpenBudget,
}: {
  itinerary: Itinerary;
  onShowOnMap: (itemId: string) => void;
  onOpenBudget: () => void;
}) {
  const dates = tripDates(itinerary.startDate, itinerary.endDate);
  // The first day starts open so it is obvious that days expand.
  const [openDates, setOpenDates] = useState<string[]>(dates.slice(0, 1));
  const [showAllDays, setShowAllDays] = useState(false);

  const nights = nightsBetween(itinerary.startDate, itinerary.endDate);
  const { spentUsd, remainingUsd, percentUsed, unknownCosts } = budgetTotals(itinerary);
  const flightsUsd = totalCost(itinerary.items.filter((item) => item.category === "Flights"));
  const visibleDates = showAllDays ? dates : dates.slice(0, COLLAPSED_DAY_COUNT);

  const toggleDay = (date: string) => setOpenDates((current) => (current.includes(date) ? current.filter((item) => item !== date) : [...current, date]));

  return (
    <>
      <div className="flex items-end justify-between">
        <div><div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Your trip</div><div className="mt-1 font-display text-2xl font-semibold">{formatDateRange(itinerary.startDate, itinerary.endDate, "long")}</div></div>
        <div className="text-xs font-semibold text-sea">{nights} {nights === 1 ? "night" : "nights"}</div>
      </div>
      <div className="mt-5 space-y-1.5">
        {visibleDates.map((isoDate) => {
          const date = parseIsoDate(isoDate);
          const dayIndex = dates.indexOf(isoDate);
          const headline = itinerary.days?.find((day) => day.date === isoDate);
          const items = itemsOn(itinerary.items, isoDate);
          const open = openDates.includes(isoDate);
          const dayCost = totalCost(items);
          // Without a headline from the backend, the day is titled from what happens on it.
          const title = headline?.title ?? items[0]?.title ?? "Free day";
          const detail = headline?.detail ?? (items.length > 1 ? items.slice(1).map((item) => item.title).join(" · ") : "");
          const stops = items.length === 0 ? "No stops planned" : `${items.length} ${items.length === 1 ? "stop" : "stops"}${dayCost > 0 ? ` · Est. ${formatUsd(dayCost)}` : ""}`;

          return (
            <div key={isoDate}>
              <Action onClick={() => toggleDay(isoDate)} label={`${open ? "Hide" : "Show"} details for ${title}`} className="group grid grid-cols-[44px_1fr] gap-3 rounded-xl p-2 hover:bg-surface">
                <div className="text-center">
                  <div className="text-[9px] font-bold tracking-widest text-muted">{date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</div>
                  <div className="mt-0.5 font-display text-xl font-semibold">{date.getDate()}</div>
                </div>
                <div className={`relative rounded-xl border border-line bg-surface p-3 pl-4 shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full ${accentClass[headline?.accent ?? accentOrder[dayIndex % accentOrder.length]]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold">{title}</div>
                      {detail && <div className="mt-1 truncate text-xs text-muted">{detail}</div>}
                    </div>
                    <Icon name="chevron" className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
                  </div>
                  <div className="mt-2 text-[11px] font-semibold text-sea">{stops}</div>
                </div>
              </Action>
              {open && items.length > 0 && (
                <div className="mx-2 mb-3 mt-1 space-y-2">
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} onShowOnMap={onShowOnMap} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {dates.length > COLLAPSED_DAY_COUNT && (
        <Action onClick={() => setShowAllDays((current) => !current)} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-xs font-semibold text-muted hover:text-sea">
          {showAllDays ? "Show fewer days" : <><Icon name="plus" className="size-3.5" /> View all {dates.length} days</>}
        </Action>
      )}

      {itinerary.places && itinerary.places.length > 0 && (
        <>
          <div className="mt-7 flex items-center justify-between"><div className="font-display text-lg font-semibold">Stays & tables</div><Action onClick={onOpenBudget} className="text-xs font-bold text-sea">See all</Action></div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {itinerary.places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        </>
      )}

      <Action onClick={onOpenBudget} label="Open the budget breakdown" className="mt-7 block rounded-2xl bg-deep p-4 text-white">
        <div className="flex items-center justify-between text-xs"><span className="font-bold uppercase tracking-widest text-white/60">Estimated cost</span><span className="font-bold">{formatUsd(spentUsd)}{itinerary.budget.plannedUsd != null && ` / ${formatUsd(itinerary.budget.plannedUsd)}`}</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className={`h-full rounded-full ${remainingUsd != null && remainingUsd < 0 ? "bg-coral" : "bg-sun"}`} style={{ width: `${Math.min(percentUsed, 100)}%` }} /></div>
        <div className="mt-3 flex justify-between text-[11px] text-white/60"><span>{flightsUsd > 0 && `Flights ${formatUsd(flightsUsd)}`}</span><span>{remainingUsd == null ? "Budget not set" : remainingUsd >= 0 ? `${formatUsd(remainingUsd)} left` : `${formatUsd(-remainingUsd)} over`}</span></div>
        {unknownCosts > 0 && <div className="mt-2 text-[11px] text-white/70">{unknownCosts} {unknownCosts === 1 ? "cost" : "costs"} still TBD; excluded from total.</div>}
      </Action>
    </>
  );
}
