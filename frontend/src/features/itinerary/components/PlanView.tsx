import { Action, Icon } from "../../../components/ui";
import { formatDateRange, formatUsd, nightsBetween, parseIsoDate } from "../../../lib/format";
import { budgetTotals } from "../hooks/useItinerary";
import type { DayAccent, Itinerary, Place } from "../types";

// Full class names so Tailwind can see them.
const accentClass: Record<DayAccent, string> = {
  blue: "before:bg-blue",
  yellow: "before:bg-yellow",
  green: "before:bg-green",
  coral: "before:bg-coral",
};

function PlaceCard({ place }: { place: Place }) {
  const isStay = place.kind === "stay";
  return (
    <div className="rounded-2xl border border-line bg-white p-3">
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

export function PlanView({ itinerary }: { itinerary: Itinerary }) {
  const nights = nightsBetween(itinerary.startDate, itinerary.endDate);
  const { spentUsd, remainingUsd, percentUsed } = budgetTotals(itinerary.budget);
  const flights = itinerary.budget.lines.find((line) => line.category === "Flights");

  return (
    <>
      <div className="flex items-end justify-between">
        <div><div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Your trip</div><div className="mt-1 font-display text-2xl font-semibold">{formatDateRange(itinerary.startDate, itinerary.endDate, "long")}</div></div>
        <div className="text-xs font-semibold text-sea">{nights} nights</div>
      </div>
      <div className="mt-5 space-y-1.5">
        {itinerary.days.map((day) => {
          const date = parseIsoDate(day.date);
          return (
            <Action key={day.date} className="group grid grid-cols-[44px_1fr] gap-3 rounded-xl p-2 hover:bg-white">
              <div className="text-center">
                <div className="text-[9px] font-bold tracking-widest text-muted">{date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</div>
                <div className="mt-0.5 font-display text-xl font-semibold">{date.getDate()}</div>
              </div>
              <div className={`relative rounded-xl border border-line bg-white p-3 pl-4 shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full ${accentClass[day.accent]}`}>
                <div className="text-sm font-bold">{day.title}</div>
                <div className="mt-1 text-xs text-muted">{day.detail}</div>
              </div>
            </Action>
          );
        })}
      </div>
      <Action className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-xs font-semibold text-muted hover:text-sea">
        <Icon name="plus" className="size-3.5" /> View all {nights + 1} days
      </Action>

      <div className="mt-7 flex items-center justify-between"><div className="font-display text-lg font-semibold">Stays & tables</div><Action className="text-xs font-bold text-sea">See all</Action></div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {itinerary.places.map((place) => (
          <PlaceCard key={place.id} place={place} />
        ))}
      </div>

      <div className="mt-7 rounded-2xl bg-ink p-4 text-white">
        <div className="flex items-center justify-between text-xs"><span className="font-bold uppercase tracking-widest text-white/60">Budget</span><span className="font-bold">{formatUsd(spentUsd)} / {formatUsd(itinerary.budget.plannedUsd)}</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-sun" style={{ width: `${Math.min(percentUsed, 100)}%` }} /></div>
        <div className="mt-3 flex justify-between text-[11px] text-white/60"><span>{flights && `Flights ${formatUsd(flights.amountUsd)}`}</span><span>{formatUsd(remainingUsd)} left</span></div>
      </div>
    </>
  );
}
