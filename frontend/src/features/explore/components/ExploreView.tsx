import { useState } from "react";
import { Action, EmptyState, Icon, ScreenHeader } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { destinationIdeas, featuredCollection, foodIdeas } from "../api/mockData";
import type { DestinationIdea, ExploreTag } from "../types";

const BUDGET_FILTER_USD = 2500;
const filters = ["For you", "Beach", "Food", "Outdoors", "Culture", `Under ${formatUsd(BUDGET_FILTER_USD)}`] as const;
type ExploreFilter = (typeof filters)[number];

function matchesFilter(idea: DestinationIdea, filter: ExploreFilter): boolean {
  if (filter === "For you") return true;
  if (filter.startsWith("Under")) return idea.fromPriceUsd < BUDGET_FILTER_USD;
  return idea.tags.includes(filter as ExploreTag);
}

/**
 * "Explore" screen: a featured collection, filterable destination ideas and food picks.
 * A destination card opens its premade sample trip (`onOpenTrip`); the collection and the food
 * picks call `onPlan` with a prompt, which opens New journey pre-filled.
 */
export function ExploreView({ onPlan, onOpenTrip }: { onPlan: (prompt: string) => void; onOpenTrip: (tripId: string) => void }) {
  const [filter, setFilter] = useState<ExploreFilter>("For you");
  const visibleIdeas = destinationIdeas.filter((idea) => matchesFilter(idea, filter));

  return (
    <main className="flex min-w-0 flex-1 flex-col lg:h-screen">
      <ScreenHeader title="Explore" subtitle="Ideas matched to your pace, tastes, and budget" />
      <div className="flex-1 overflow-y-auto px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          {/* Editorial hero */}
          <div
            className="flex min-h-72 items-end overflow-hidden rounded-3xl bg-cover bg-center p-6 text-white md:p-10"
            style={{ backgroundImage: `linear-gradient(90deg,rgba(23,59,58,.9),rgba(23,59,58,.2)),url('${featuredCollection.imageUrl}')` }}
          >
            <div className="max-w-lg">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-sun">{featuredCollection.eyebrow}</div>
              <div className="mt-3 font-display text-4xl font-semibold md:text-5xl">{featuredCollection.title}</div>
              <div className="mt-3 text-sm leading-6 text-white/70">{featuredCollection.description}</div>
              <Action onClick={() => onPlan(featuredCollection.prompt)} className="mt-5 flex w-fit items-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-xs font-bold text-ink">
                Explore the collection <Icon name="chevron" className="size-4" />
              </Action>
            </div>
          </div>

          {/* Interest and budget filters */}
          <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
            {filters.map((item) => (
              <Action key={item} onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold ${filter === item ? "border-deep bg-deep text-white" : "border-line bg-surface text-muted"}`}>
                {item}
              </Action>
            ))}
          </div>

          {/* Destination cards */}
          {visibleIdeas.length === 0 && <EmptyState className="mt-5" message="No ideas match this filter yet." />}
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {visibleIdeas.map((idea) => (
              <Action key={idea.id} onClick={() => onOpenTrip(idea.id)} className="group relative h-80 overflow-hidden rounded-2xl bg-map">
                <img src={idea.imageUrl} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <div className="text-xs font-bold uppercase tracking-widest text-sun">{idea.title}</div>
                  <div className="mt-1 font-display text-2xl font-semibold">{idea.place}</div>
                  <div className="mt-2 text-xs text-white/70">From {formatUsd(idea.fromPriceUsd)} · {idea.days} days · {idea.travelers} {idea.travelers === 1 ? "traveler" : "travelers"}</div>
                </div>
                {/* Save-for-later heart: visual only for now. */}
                <div className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-surface/90 text-ink">♡</div>
              </Action>
            ))}
          </div>

          {/* Food-focused recommendations */}
          <div className="mt-10">
            <div className="font-display text-2xl font-semibold">Because you like local food</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {foodIdeas.map((item) => (
                <Action key={item.label} onClick={() => onPlan(item.label)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm hover:border-sea">
                  <div className={`grid size-10 place-items-center rounded-xl ${item.tone}`}>
                    <Icon name={item.icon} className="size-5" />
                  </div>
                  <div className="flex-1 text-sm font-bold">{item.label}</div>
                  <Icon name="chevron" className="size-4 text-muted" />
                </Action>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
