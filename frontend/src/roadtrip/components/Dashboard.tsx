import { trips } from "../data/mockData"
import type { TravelMode } from "../types"
import { Action, Icon, StatusTag } from "./ui"

export default function Dashboard({
  onNew,
  onOpen,
}: {
  onNew: () => void
  onOpen: (mode: TravelMode) => void
}) {
  return (
    <div className="h-full overflow-y-auto px-5 py-7 md:px-9 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-school">
              Roam planner
            </div>
            <div className="mt-2 font-display text-4xl font-semibold">
              Dashboard
            </div>
            <div className="mt-2 text-sm text-muted">
              Your destination trips and drives, together.
            </div>
          </div>
          <Action
            onClick={onNew}
            className="flex w-fit items-center gap-2 rounded-md bg-school px-4 py-3 text-xs font-bold text-white"
          >
            <Icon name="plus" className="size-4" /> New trip
          </Action>
        </div>

        <div className="mt-6 flex gap-1 border-b border-line">
          {["Upcoming", "Ideas", "Past"].map((item, index) => (
            <Action
              key={item}
              className={`border-b-2 px-4 py-3 text-xs font-bold ${
                index === 0
                  ? "border-school text-school"
                  : "border-transparent text-muted"
              }`}
            >
              {item}
            </Action>
          ))}
        </div>

        <div className="mt-7 grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {trips.map((trip) => (
                <Action
                  key={trip.id}
                  onClick={() => onOpen(trip.mode)}
                  className="group overflow-hidden border border-line bg-white hover:border-school/50"
                >
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={trip.image}
                      alt=""
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute left-3 top-3">
                      <StatusTag
                        tone={trip.mode === "drive" ? "accent" : "neutral"}
                      >
                        {trip.mode}
                      </StatusTag>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-display text-xl font-semibold">
                          {trip.title}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {trip.route}
                        </div>
                      </div>
                      <Icon
                        name="chevron"
                        className="mt-1 size-4 shrink-0 text-muted"
                      />
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <span>{trip.date}</span>
                      <span>{trip.status}</span>
                    </div>
                  </div>
                </Action>
              ))}
            </div>

            <div className="mt-9">
              <div className="flex items-end justify-between">
                <div>
                  <div className="font-display text-2xl font-semibold">
                    Explore nearby
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Ideas matched to your history, food, and nature interests.
                  </div>
                </div>
                <Action className="text-xs font-bold text-school">
                  View explore
                </Action>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["River towns", "Within 3 hours", "map"],
                  ["Historic main streets", "12 saved places", "camera"],
                  ["Food worth a detour", "Along your routes", "utensils"],
                ].map(([title, meta, icon]) => (
                  <Action
                    key={title}
                    className="flex items-center gap-3 border border-line bg-white p-4"
                  >
                    <div className="grid size-9 place-items-center rounded-full bg-mint text-school">
                      <Icon name={icon as "map"} className="size-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">{title}</div>
                      <div className="mt-1 text-[10px] text-muted">{meta}</div>
                    </div>
                  </Action>
                ))}
              </div>
            </div>
          </div>

          <aside className="border-t border-line pt-6 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
            <div className="text-sm font-bold">To do</div>
            <div className="mt-3 divide-y divide-line border-y border-line">
              {[
                ["Review Bari fare", "Today", "plane"],
                ["Choose a Rocheport stop", "Drive · Flexible", "car"],
                ["Confirm Puglia stay", "Friday", "calendar"],
              ].map(([title, meta, icon]) => (
                <div key={title} className="flex gap-3 py-4">
                  <Icon
                    name={icon as "plane"}
                    className="mt-0.5 size-4 shrink-0 text-school"
                  />
                  <div>
                    <div className="text-xs font-semibold">{title}</div>
                    <div className="mt-1 text-[10px] text-muted">{meta}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-7 border border-sun/40 bg-[#f2ead8] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-school">
                Cached demo
              </div>
              <div className="mt-2 text-xs leading-5 text-ink/70">
                Drive results use structured sample data. Prices, access, and
                opening hours are not live.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
