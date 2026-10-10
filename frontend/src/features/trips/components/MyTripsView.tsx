import { useState } from "react";
import { Action, EmptyState, ErrorState, Icon, LoadingState, ScreenHeader } from "../../../components/ui";
import { useTripCards } from "../hooks/useTrips";
import type { TripCard, TripStatus } from "../types";

type TripFilter = "Upcoming" | "Ideas" | "Past";

/** Which statuses each filter tab shows. */
const statusesByFilter: Record<TripFilter, TripStatus[]> = {
  Upcoming: ["Ready to book", "In progress"],
  Ideas: ["Idea"],
  Past: ["Completed"],
};

function matchesQuery(card: TripCard, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${card.title} ${card.place}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function TripCardTile({ card, onOpen }: { card: TripCard; onOpen: () => void }) {
  return (
    <Action onClick={onOpen} className="group overflow-hidden rounded-2xl border border-line bg-surface shadow-sm hover:-translate-y-1 hover:shadow-lg">
      <div className="relative h-48 overflow-hidden bg-map">
        {card.imageUrl && <img src={card.imageUrl} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-[10px] font-bold text-ink backdrop-blur">{card.status}</div>
        <div className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full bg-surface/90 text-ink"><Icon name="more" className="size-4" /></div>
      </div>
      <div className="p-5">
        <div className="font-display text-xl font-semibold">{card.title}</div>
        <div className="mt-1 text-sm text-muted">{card.place} · {card.dates}</div>
        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          {/* Traveler avatars: sample values from the design. */}
          <div className="flex -space-x-2">
            <div className="grid size-7 place-items-center rounded-full border-2 border-surface bg-coral text-[8px] font-bold text-white">AM</div>
            <div className="grid size-7 place-items-center rounded-full border-2 border-surface bg-sun text-[8px] font-bold text-ink">+1</div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-sea">Open plan <Icon name="chevron" className="size-3.5" /></div>
        </div>
      </div>
    </Action>
  );
}

/** "My trips" screen: every trip as a card, filtered by Upcoming / Ideas / Past and searchable. */
export function MyTripsView({ onOpenTrip, onNewJourney }: { onOpenTrip: (tripId: string) => void; onNewJourney: () => void }) {
  const cards = useTripCards();
  const [filter, setFilter] = useState<TripFilter>("Upcoming");
  const [query, setQuery] = useState("");

  const visibleCards =
    cards.status === "success" ? cards.data.filter((card) => statusesByFilter[filter].includes(card.status) && matchesQuery(card, query)) : [];

  return (
    <main className="flex min-w-0 flex-1 flex-col lg:h-screen">
      <ScreenHeader
        title="My trips"
        subtitle="Every idea, plan, and journey in one place"
        action={
          <Action onClick={onNewJourney} className="flex items-center gap-2 rounded-xl bg-deep px-3.5 py-2.5 text-xs font-bold text-white hover:bg-sea">
            <Icon name="plus" className="size-4" /> New journey
          </Action>
        }
      />
      <div className="flex-1 overflow-y-auto px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex w-fit gap-1 rounded-xl bg-panel p-1">
              {(Object.keys(statusesByFilter) as TripFilter[]).map((item) => (
                <Action key={item} onClick={() => setFilter(item)} className={`rounded-lg px-4 py-2 text-xs font-bold ${filter === item ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
                  {item}
                </Action>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted focus-within:border-sea sm:w-64">
              <Icon name="search" className="size-4 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && setQuery("")}
                placeholder="Search trips"
                aria-label="Search trips"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
              />
            </div>
          </div>

          {cards.status === "loading" && <LoadingState label="Loading your trips…" className="mt-7" />}
          {cards.status === "error" && <ErrorState message="Couldn’t load your trips." onRetry={cards.reload} className="mt-7" />}
          {cards.status === "success" && visibleCards.length === 0 && (
            <EmptyState className="mt-7" message={query.trim() ? `No ${filter.toLowerCase()} trips match “${query.trim()}”.` : `No ${filter.toLowerCase()} trips yet.`} />
          )}
          <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleCards.map((card) => (
              <TripCardTile key={card.id} card={card} onOpen={() => onOpenTrip(card.id)} />
            ))}
          </div>

          {/* Import an idea: not wired yet. Planned: paste a link, note or screenshot and Roam turns it into a plan. */}
          <div className="mt-10 rounded-3xl bg-mint p-6 md:flex md:items-center md:justify-between md:p-8">
            <div>
              <div className="font-display text-2xl font-semibold text-ink">Have a destination saved somewhere else?</div>
              <div className="mt-2 text-sm text-ink/60">Drop a link, note, or screenshot and Roam will turn it into a plan.</div>
            </div>
            <Action className="mt-5 w-fit rounded-xl bg-sea px-4 py-2.5 text-xs font-bold text-white hover:bg-deep md:mt-0">Import an idea</Action>
          </div>
        </div>
      </div>
    </main>
  );
}
