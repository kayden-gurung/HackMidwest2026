import { useState, type ReactNode } from "react";
import { Action, Icon, ScreenHeader } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { budgetOptionsUsd, journeyDefaults, vibes } from "../api/mockData";
import type { JourneyRequest } from "../types";

const HERO_IMAGE = "https://images.unsplash.com/photo-1763571588664-a8748e5e2b75?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=1000";

/** Small uppercase label above each section of the form. */
function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted">{children}</div>;
}

/**
 * "New journey" screen: the traveler describes a place or a vibe, picks a budget and dates,
 * and "Find my trip" hands the request to the planner.
 */
export function NewJourneyView({ onStart, initialPrompt = "" }: { onStart: (request: JourneyRequest) => void; initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [vibe, setVibe] = useState(journeyDefaults.vibe);
  const [budgetUsd, setBudgetUsd] = useState(journeyDefaults.budgetUsd);
  const [flexibleDates, setFlexibleDates] = useState(journeyDefaults.flexibleDates);
  const { origin, travelers, fixedDates } = journeyDefaults;

  const findTrip = () => onStart({ prompt: prompt.trim(), vibe, budgetUsd, flexibleDates, fixedDates, origin, travelers });

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

            <div className="mt-7 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-line p-4">
                <FieldLabel><Icon name="wallet" className="size-3.5" /> Total budget</FieldLabel>
                <div className="mt-3 flex gap-1.5">
                  {budgetOptionsUsd.map((amount) => (
                    <Action key={amount} onClick={() => setBudgetUsd(amount)} className={`rounded-lg px-2 py-1.5 text-xs font-bold ${budgetUsd === amount ? "bg-deep text-white" : "bg-panel text-muted"}`}>
                      {formatUsd(amount)}
                    </Action>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <FieldLabel><Icon name="calendar" className="size-3.5" /> When</FieldLabel>
                {/* Toggles between flexible dates and the fixed dates; a real date picker can replace this later. */}
                <Action onClick={() => setFlexibleDates(!flexibleDates)} className="mt-3 flex items-center justify-between text-sm font-bold">
                  {flexibleDates ? "I’m flexible" : fixedDates} <Icon name="chevron" className="size-4 rotate-90 text-muted" />
                </Action>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <FieldLabel><Icon name="plane" className="size-3.5" /> Leaving from</FieldLabel>
                <div className="mt-3 text-sm font-bold">{origin}</div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-line pt-5 sm:flex-row">
              <div className="text-xs text-muted">For {travelers} travelers · Flights included</div>
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
