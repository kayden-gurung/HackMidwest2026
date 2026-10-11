import { useRef, useState, type ReactNode } from "react";
import { Action, Icon, ScreenHeader } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { useProfile } from "../../profile";
import { MILES_PER_DAY_OPTIONS, type TravelBy } from "../../trips";
import { budgetSliderUsd, journeyDefaults, travelerLimits, vibes } from "../api/mockData";
import { describeParty } from "../describeJourney";
import type { DateRange, JourneyRequest } from "../types";
import { DateRangePicker } from "./DateRangePicker";
import { JourneyStarters } from "./JourneyStarters";

/** Small uppercase label above each section of the form. */
function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">{children}</div>;
}

/** "Adults  − 2 +" row of the Travelers field. */
function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const button = (enabled: boolean) => `grid size-7 place-items-center rounded-full border text-sm font-bold ${enabled ? "border-line hover:border-sea hover:text-sea" : "pointer-events-none border-line/50 text-muted/40"}`;
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm font-bold">
        {label} <span className="text-[11px] font-semibold text-muted">{hint}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <Action onClick={() => value > min && onChange(value - 1)} label={`Fewer ${label.toLowerCase()}`} className={button(value > min)}>−</Action>
        <span className="w-4 text-center text-sm font-bold" aria-live="polite">{value}</span>
        <Action onClick={() => value < max && onChange(value + 1)} label={`More ${label.toLowerCase()}`} className={button(value < max)}>+</Action>
      </div>
    </div>
  );
}

/** One of the two big "How are you getting there?" options. */
function TravelOption({ selected, icon, title, detail, onSelect }: { selected: boolean; icon: "plane" | "car"; title: string; detail: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${selected ? "border-sea bg-mint/60 ring-1 ring-sea" : "border-line hover:border-sea"}`}
    >
      <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-sea text-white" : "bg-panel text-muted"}`}>
        <Icon name={icon} className="size-4" />
      </div>
      <div>
        <div className="text-sm font-bold">{title}</div>
        <div className="mt-0.5 text-xs leading-5 text-muted">{detail}</div>
      </div>
    </button>
  );
}

/**
 * "New journey" screen: the traveler describes a place or a vibe, picks a budget, dates, a starting point
 * and who is coming, and "Find my trip" hands the request to the planner.
 */
export function NewJourneyView({ onStart, initialPrompt = "" }: { onStart: (request: JourneyRequest) => void; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // Empty means "No preference"; picking any vibe clears it, and clearing every vibe brings it back.
  const [selectedVibes, setSelectedVibes] = useState(journeyDefaults.vibes);
  const [budgetUsd, setBudgetUsd] = useState(journeyDefaults.budgetUsd);
  // null means flexible dates.
  const [dates, setDates] = useState<DateRange | null>(null);
  // Starts as the home airport from the Settings profile card; the traveler can type any other place.
  const { homeAirport } = useProfile();
  const [origin, setOrigin] = useState(homeAirport || journeyDefaults.origin);
  const [adults, setAdults] = useState(journeyDefaults.adults);
  const [children, setChildren] = useState(journeyDefaults.children);
  // Plane: airports and flight ticket links. Road: miles, routes and overnight stops.
  const [travelBy, setTravelBy] = useState<TravelBy>("plane");
  // Road only: the daily driving limit, also shown (and changeable) in the trip header afterwards.
  const [maxMilesPerDay, setMaxMilesPerDay] = useState<number>(400);

  const toggleVibe = (item: string) =>
    setSelectedVibes((current) => (current.includes(item) ? current.filter((picked) => picked !== item) : [...current, item]));
  const vibeChip = (selected: boolean) =>
    `rounded-full border px-3.5 py-2 text-xs font-semibold ${selected ? "border-sea bg-mint text-sea" : "border-line text-muted hover:border-sea"}`;

  const findTrip = () => onStart({ prompt: prompt.trim(), vibes: vibes.filter((item) => selectedVibes.includes(item)), budgetUsd, dates, origin: origin.trim(), adults, children, travelBy, maxMilesPerDay: travelBy === "road" ? maxMilesPerDay : undefined });

  return (
    <main className="flex min-w-0 flex-1 flex-col lg:h-screen">
      <ScreenHeader
        title="Plan a new journey"
        subtitle="Tell Roam the feeling. We’ll figure out the place."
      />
      <div className="flex-1 overflow-y-auto px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <div className="pb-7 pt-2 md:pb-9">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sea">A new journey</div>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">Where would you rather be?</h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted">A place, a feeling, a budget. Start with whatever you know.<br className="hidden sm:block" /> We’ll help turn it into your next chapter.</p>
          </div>
          <div className="rounded-[20px] border border-line bg-surface p-5 shadow-[0_8px_32px_rgba(18,38,38,0.035)] md:p-7">
            <FieldLabel>What are you imagining?</FieldLabel>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A beach escape, great food, a little hiking…"
              aria-label="Describe your trip"
              rows={3}
              className="mt-3 w-full resize-none rounded-2xl bg-panel p-4 text-base leading-7 outline-none ring-sea placeholder:text-muted focus:ring-2"
            />

            <div className="mb-3 mt-5"><FieldLabel>Find your starting point</FieldLabel></div>
            <JourneyStarters onChoose={(text, nextVibe) => { setPrompt(text); setSelectedVibes([nextVibe]); promptRef.current?.focus(); }} />

            <div className="mt-6">
              <FieldLabel>Choose a vibe</FieldLabel>
              <div className="mt-1 text-xs text-muted">Optional. Pick as many as you like.</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Action onClick={() => setSelectedVibes([])} className={vibeChip(selectedVibes.length === 0)}>
                No preference
              </Action>
              {vibes.map((item) => (
                <Action key={item} onClick={() => toggleVibe(item)} className={vibeChip(selectedVibes.includes(item))}>
                  {item}
                </Action>
              ))}
            </div>

            <div className="mt-7">
              <FieldLabel>How are you getting there?</FieldLabel>
            </div>
            <div role="radiogroup" aria-label="How are you getting there?" className="mt-3 grid gap-3 sm:grid-cols-2">
              <TravelOption selected={travelBy === "plane"} icon="plane" title="By plane" detail="Nearby airports and links to real flight tickets." onSelect={() => setTravelBy("plane")} />
              <TravelOption selected={travelBy === "road"} icon="car" title="By road" detail="Miles, routes and overnight stops. No flights." onSelect={() => setTravelBy("road")} />
            </div>
            {travelBy === "road" && (
              <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
                <span className="font-semibold">Most driving per day</span>
                <select
                  aria-label="Most miles to drive per day"
                  value={maxMilesPerDay}
                  onChange={(event) => setMaxMilesPerDay(Number(event.target.value))}
                  className="cursor-pointer rounded-full bg-mint/60 px-3 py-1.5 text-xs font-semibold text-sea outline-none focus-visible:ring-2 focus-visible:ring-sea"
                >
                  {MILES_PER_DAY_OPTIONS.map((miles) => (
                    <option key={miles} value={miles}>
                      {miles} miles
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-7 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <FieldLabel><Icon name="wallet" className="size-3.5" /> Total budget</FieldLabel>
                  {budgetUsd !== null && (
                    <Action onClick={() => setBudgetUsd(null)} className="text-[11px] font-semibold text-muted hover:text-sea">
                      Clear
                    </Action>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-1 rounded-lg bg-panel px-3 py-2 ring-sea focus-within:ring-2">
                  <span className="text-sm font-bold text-muted">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={budgetUsd ?? ""}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "").slice(0, 7);
                      setBudgetUsd(digits ? Number(digits) : null);
                    }}
                    placeholder="No limit"
                    aria-label="Total budget in US dollars"
                    className="w-full bg-transparent text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
                  />
                </div>
                <input
                  type="range"
                  min={budgetSliderUsd.min}
                  max={budgetSliderUsd.max}
                  step={budgetSliderUsd.step}
                  value={Math.min(Math.max(budgetUsd ?? budgetSliderUsd.min, budgetSliderUsd.min), budgetSliderUsd.max)}
                  onChange={(event) => setBudgetUsd(Number(event.target.value))}
                  aria-label="Total budget slider"
                  className={`mt-3 w-full accent-sea ${budgetUsd === null ? "opacity-40" : ""}`}
                />
                <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted">
                  <span>{formatUsd(budgetSliderUsd.min)}</span>
                  <span>{budgetUsd === null ? "Flexible budget" : "For everyone, all in"}</span>
                  <span>{formatUsd(budgetSliderUsd.max)}+</span>
                </div>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <FieldLabel><Icon name="calendar" className="size-3.5" /> When</FieldLabel>
                <DateRangePicker value={dates} onChange={setDates} />
              </div>
              <div className="rounded-2xl border border-line p-4">
                <FieldLabel><Icon name={travelBy === "road" ? "car" : "plane"} className="size-3.5" /> Leaving from</FieldLabel>
                <input
                  type="text"
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                  placeholder="City, airport or address"
                  aria-label="Leaving from"
                  className="mt-3 w-full rounded-lg bg-panel px-3 py-2 text-sm font-bold outline-none ring-sea placeholder:font-semibold placeholder:text-muted focus:ring-2"
                />
              </div>
              <div className="rounded-2xl border border-line p-4">
                <FieldLabel><Icon name="users" className="size-3.5" /> Travelers</FieldLabel>
                <div className="mt-3 space-y-2">
                  <Stepper label="Adults" hint="18+" value={adults} min={travelerLimits.minAdults} max={travelerLimits.maxTotal - children} onChange={setAdults} />
                  <Stepper label="Kids" hint="Under 18" value={children} min={0} max={travelerLimits.maxTotal - adults} onChange={setChildren} />
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-line pt-5 sm:flex-row">
              <div className="text-xs text-muted">For {describeParty(adults, children)} · {travelBy === "road" ? "Road trip" : "Flights included"}</div>
              <Action onClick={findTrip} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sea px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-deep sm:w-auto">
                Let’s roam <Icon name="chevron" className="size-4" />
              </Action>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
