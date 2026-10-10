import { useState, type ReactNode } from "react";
import { Action, Icon, ScreenHeader, Toggle } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { useProfile } from "../../profile";
import { budgetSliderUsd, journeyDefaults, travelerLimits, vibes } from "../api/mockData";
import { describeParty } from "../describeJourney";
import type { DateRange, JourneyRequest } from "../types";
import { DateRangePicker } from "./DateRangePicker";

const HERO_IMAGE = "https://images.unsplash.com/photo-1763571588664-a8748e5e2b75?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=1000";

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

/**
 * "New journey" screen: the traveler describes a place or a vibe, picks a budget, dates, a starting point
 * and who is coming, and "Find my trip" hands the request to the planner.
 */
export function NewJourneyView({ onStart, initialPrompt = "" }: { onStart: (request: JourneyRequest) => void; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [vibe, setVibe] = useState(journeyDefaults.vibe);
  const [budgetUsd, setBudgetUsd] = useState(journeyDefaults.budgetUsd);
  // null means flexible dates.
  const [dates, setDates] = useState<DateRange | null>(null);
  // Starts as the home airport from the Settings profile card; the traveler can type any other place.
  const { homeAirport } = useProfile();
  const [origin, setOrigin] = useState(homeAirport || journeyDefaults.origin);
  const [roadTrip, setRoadTrip] = useState(journeyDefaults.roadTrip);
  const [adults, setAdults] = useState(journeyDefaults.adults);
  const [children, setChildren] = useState(journeyDefaults.children);

  const findTrip = () => onStart({ prompt: prompt.trim(), vibe, budgetUsd, dates, origin: origin.trim(), roadTrip, adults, children });

  return (
    <main className="flex min-w-0 flex-1 flex-col lg:h-screen">
      <ScreenHeader
        title="Plan a new journey"
        subtitle="Tell Roam the feeling. We’ll figure out the place."
        action={<div className="hidden rounded-full bg-mint px-3 py-1.5 text-xs font-bold text-sea sm:block">Usually takes 2 minutes</div>}
      />
      <div className="flex-1 overflow-y-auto px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          {/* Hero */}
          <div className="overflow-hidden rounded-3xl bg-deep text-white shadow-xl">
            <div className="grid lg:grid-cols-[1.1fr_.9fr]">
              <div className="p-6 md:p-10">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-sun">
                  <Icon name="sparkles" className="size-3.5" /> Start anywhere
                </div>
                <div className="mt-6 max-w-xl font-display text-4xl font-semibold leading-tight md:text-5xl">Where should we take you next?</div>
                <div className="mt-4 max-w-lg text-sm leading-6 text-white/65">Name a place or describe a feeling—quiet beaches, mountain air, the best street food. Roam will match your budget and pace.</div>
              </div>
              <div className="min-h-64 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(135deg,rgba(23,59,58,.05),rgba(23,59,58,.6)),url('${HERO_IMAGE}')` }} />
            </div>
          </div>

          {/* Request form, overlapping the bottom of the hero */}
          <div className="relative mx-auto -mt-7 max-w-3xl rounded-3xl border border-line bg-surface p-5 shadow-[0_20px_60px_rgba(18,38,38,0.12)] md:p-7">
            <FieldLabel>What are you imagining?</FieldLabel>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. A warm, low-key beach week with incredible food..."
              aria-label="Describe your trip"
              rows={3}
              className="mt-3 w-full resize-none rounded-2xl bg-panel p-4 text-base leading-7 outline-none ring-sea placeholder:text-muted focus:ring-2"
            />

            <div className="mt-6">
              <FieldLabel>Choose a vibe</FieldLabel>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {vibes.map((item) => (
                <Action key={item} onClick={() => setVibe(item)} className={`rounded-full border px-3.5 py-2 text-xs font-semibold ${vibe === item ? "border-sea bg-mint text-sea" : "border-line text-muted hover:border-sea"}`}>
                  {item}
                </Action>
              ))}
            </div>

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
                <FieldLabel><Icon name={roadTrip ? "car" : "plane"} className="size-3.5" /> {roadTrip ? "Driving from" : "Leaving from"}</FieldLabel>
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

            {/* Road trip switch */}
            <div className={`mt-3 flex items-center gap-4 rounded-2xl border p-4 ${roadTrip ? "border-sea bg-mint/50" : "border-line"}`}>
              <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${roadTrip ? "bg-sea text-white" : "bg-panel text-muted"}`}><Icon name="car" className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">Make it a road trip</div>
                <div className="mt-0.5 text-xs leading-5 text-muted">
                  {roadTrip ? "Roam plans a drive from your starting point: route, stops and fuel, no flights." : "Drive instead of flying. Left off, Roam still suggests driving if flights don’t fit your budget."}
                </div>
              </div>
              <Toggle label="Make it a road trip" checked={roadTrip} onChange={() => setRoadTrip((current) => !current)} />
            </div>

            <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-line pt-5 sm:flex-row">
              <div className="text-xs text-muted">For {describeParty(adults, children)} · {roadTrip ? "Driving, no flights" : "Flying or driving, whichever fits"}</div>
              <Action onClick={findTrip} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sea px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-deep sm:w-auto">
                Find my trip <Icon name="sparkles" className="size-4 text-sun" />
              </Action>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
