/**
 * Roam: AI travel planner UI, exported from the Figma Make "Travel Planner App" design.
 *
 * Layout (desktop, lg+ / xl+ breakpoints):
 *   - Left sidebar: logo, new journey, trip search, recent journeys, travel style, profile
 *   - Center: chat between the traveler and the Roam agent, plus the message composer
 *   - Right panel: Plan / Map / Budget tabs for the current trip
 * On smaller screens the side panels are hidden and only the chat is shown.
 *
 * Chat uses the Strands backend via /api. Sidebar trips and the right-hand
 * Puglia itinerary remain sample data from the design.
 */
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { askRoam, type ChatMessage } from "./api/chat";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

type IconName =
  | "sparkles"
  | "plus"
  | "search"
  | "calendar"
  | "map"
  | "wallet"
  | "plane"
  | "hotel"
  | "utensils"
  | "send"
  | "chevron"
  | "more"
  | "settings"
  | "compass"
  | "sun"
  | "clock";

// Inline SVG paths (24x24 viewBox) so the app needs no icon library.
const paths: Record<IconName, React.ReactNode> = {
  sparkles: <path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3ZM5.5 14l-.8 2.7L2 17.5l2.7.8.8 2.7.8-2.7 2.7-.8-2.7-.8L5.5 14Zm12 0-.8 2.7-2.7.8 2.7.8.8 2.7.8-2.7 2.7-.8-2.7-.8-.8-2.7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
  calendar: <path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 8h2m4 0h2m-8 4h2m4 0h2" />,
  map: <path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Zm5-2v13m8-10v13" />,
  wallet: <path d="M4 6.5h14a2 2 0 0 1 2 2V18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13M16 11h4v4h-4a2 2 0 0 1 0-4Z" />,
  plane: <path d="m22 2-7.5 18-3.2-7.3L4 9.5 22 2Z" />,
  hotel: <path d="M4 20V5h16v15M4 14h16M8 8h2m4 0h2M7 20v-3h10v3" />,
  utensils: <path d="M6 3v7m3-7v7m-6-7v4a3 3 0 0 0 6 0M6 10v11m11-18v18m0-18c-2 1-3 3-3 6v3h3" />,
  send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  settings: <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2M5.5 12h-2m14.5-6-1.4 1.4M7.4 16.6 6 18m12 0-1.4-1.4M7.4 7.4 6 6" />,
  compass: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm3.5-13.5-2 5-5 2 2-5 5-2Z" />,
  sun: <path d="M12 3V1m0 22v-2m9-9h2M1 12h2m16.4-7.4L18 6M6 18l-1.4 1.4m14.8 0L18 18M6 6 4.6 4.6M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />,
  clock: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
};

/** Outline icon that inherits the current text color. "sparkles" is drawn filled. */
function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={name === "sparkles" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

/**
 * Clickable element used for every button and link in the design.
 * Keyboard accessible: focusable, and Enter triggers onClick.
 * Pass `label` when the content is icon-only so screen readers can name it.
 */
function Action({
  children,
  onClick,
  className = "",
  label,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={`cursor-pointer select-none transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Placeholder data (to be replaced by agent / API responses)
// ---------------------------------------------------------------------------

/** Past trips listed in the sidebar; `active` marks the trip currently open. */
const history = [
  { title: "A slow week in Puglia", meta: "Italy · $3,200", active: true },
  { title: "Hiking in Patagonia", meta: "Chile · $4,800" },
  { title: "Tokyo food weekend", meta: "Japan · $2,700" },
  { title: "Mexico City with friends", meta: "Mexico · $1,900" },
];

/** Itinerary days in the Plan tab. `tone` sets the colored marker on each day card. */
const calendarDays = [
  { day: "18", weekday: "MON", title: "Arrive in Bari", detail: "Check in · Old Town walk", tone: "before:bg-blue" },
  { day: "19", weekday: "TUE", title: "Polignano coast", detail: "Beach · Cave boat tour", tone: "before:bg-yellow" },
  { day: "20", weekday: "WED", title: "Alberobello", detail: "Trulli · Farm lunch", tone: "before:bg-green" },
  { day: "21", weekday: "THU", title: "Slow day", detail: "Market · Dinner at Grotta", tone: "before:bg-coral" },
];

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type ChatTurn = { id: number; prompt: string; reply?: string; error?: string; pending: boolean };

export default function App() {
  // Selected tab in the right-hand trip panel: "Plan" | "Map" | "Budget".
  const [activeView, setActiveView] = useState("Plan");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  // How much the agent decides on its own: "Co-pilot" (asks first) or "Surprise me".
  const [involvement, setInvolvement] = useState<"Co-pilot" | "Surprise me">("Co-pilot");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const pending = turns.some((turn) => turn.pending);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: "end" }); }, [turns]);
  useEffect(() => () => requestRef.current?.abort(), []);

  const sendMessage = async (text = draft, retryId?: number) => {
    const value = text.trim();
    if (!value || requestRef.current) return;
    const id = retryId ?? nextId.current++;
    // Only successful exchanges become model context. Keep the last 20 turns
    // within the API's 40-message limit, with no context shared across users.
    const history: ChatMessage[] = turns.filter((turn) => turn.reply && turn.id < id).slice(-20).flatMap((turn) => [
      { role: "user", content: turn.prompt },
      { role: "assistant", content: turn.reply! },
    ]);
    const controller = new AbortController();
    requestRef.current = controller;
    setTurns((current) => retryId === undefined
      ? [...current, { id, prompt: value, pending: true }]
      : current.map((turn) => turn.id === id ? { ...turn, error: undefined, pending: true } : turn));
    if (retryId === undefined) setDraft("");
    const timeout = window.setTimeout(() => controller.abort(), 180000);
    try {
      const reply = await askRoam(value, history, involvement, controller.signal);
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, reply, pending: false } : turn));
    } catch (error) {
      const detail = controller.signal.aborted
        ? "Roam took too long to respond. Please try again."
        : error instanceof TypeError
          ? "Cannot reach Roam. Check your connection and try again."
          : error instanceof Error ? error.message : "Something went wrong. Please try again.";
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, error: detail, pending: false } : turn));
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      composerRef.current?.focus();
    }
  };

  const newJourney = () => {
    if (requestRef.current) return;
    setTurns([]);
    setDraft("");
    setActiveView("Plan");
    composerRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-canvas text-ink lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        {/* ===== Left sidebar: navigation and trip history (lg+ only) ===== */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sidebar p-4 lg:flex">
          <div className="flex items-center gap-2.5 px-2 py-3">
            <div className="grid size-8 place-items-center rounded-xl bg-ink text-white"><Icon name="compass" className="size-5" /></div>
            <div className="font-display text-xl font-semibold tracking-tight">Roam</div>
          </div>

          <Action onClick={newJourney} disabled={pending} className="mt-5 flex w-full items-center gap-2 rounded-xl bg-ink px-3.5 py-3 text-sm font-semibold text-white shadow-sm">
            <Icon name="plus" className="size-4" /> New journey
          </Action>

          <div className="mt-7 flex items-center gap-2 rounded-xl border border-line bg-white/60 px-3 py-2.5 text-sm text-muted">
            <Icon name="search" className="size-4" />
            <div>Search your trips</div>
          </div>

          <div className="mt-7 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Example journeys</div>
          <div className="mt-2 space-y-1">
            {history.map((item) => (
              <Action key={item.title} className={`group w-full rounded-xl px-3 py-3 text-left ${item.active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="mt-1 text-xs text-muted">{item.meta}</div>
                  </div>
                  {item.active && <Icon name="more" className="mt-0.5 size-4 text-muted" />}
                </div>
              </Action>
            ))}
          </div>

          {/* Pinned to the bottom: travel style card and user profile */}
          <div className="mt-auto">
            <div className="mb-3 rounded-2xl bg-sea p-4 text-white">
              <Icon name="sparkles" className="size-5 text-sun" />
              <div className="mt-3 text-sm font-semibold">Your travel style</div>
              <div className="mt-1 text-xs leading-relaxed text-white/70">Slow mornings, local food, a little adventure.</div>
              <Action className="mt-3 text-xs font-bold text-sun">Tune preferences →</Action>
            </div>
            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <div className="grid size-9 place-items-center rounded-full bg-coral text-xs font-bold text-white">AM</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Alex Morgan</div>
                <div className="text-xs text-muted">Explorer plan</div>
              </div>
              <Icon name="settings" className="size-4 text-muted" />
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {/* ===== Header: trip title, dates and the Co-pilot / Surprise me toggle ===== */}
          <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line bg-canvas/90 px-5 backdrop-blur md:px-8">
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-xl bg-ink text-white lg:hidden"><Icon name="compass" className="size-5" /></div>
              <div>
                <div className="font-display text-lg font-semibold">Your next journey</div>
                <div className="text-xs text-muted">Plan your trip with Roam</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1 rounded-full border border-line bg-white p-1 sm:flex">
                {(["Co-pilot", "Surprise me"] as const).map((item) => (
                  <Action key={item} disabled={pending} onClick={() => setInvolvement(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${involvement === item ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                    {item}
                  </Action>
                ))}
              </div>
              <Action label="New journey" onClick={newJourney} disabled={pending} className="grid size-9 place-items-center rounded-full border border-line bg-white lg:hidden"><Icon name="plus" className="size-5" /></Action>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_390px]">
            {/* ===== Center: chat conversation ===== */}
            <section className="flex min-h-0 flex-col border-line xl:border-r">
              <div className="flex-1 overflow-y-auto px-5 py-7 md:px-10 lg:px-12">
                <div className="mx-auto max-w-3xl">
                  {turns.length === 0 && (
                    <div className="flex gap-3">
                      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-sea text-white"><Icon name="sparkles" className="size-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold">Roam</div>
                        <h1 className="mt-3 font-display text-3xl font-semibold">A great trip starts with an idea.</h1>
                        <p className="mt-3 text-[15px] leading-7 text-ink/80">Tell me where you'd like to go, your dates, budget, and who's coming. We'll build a plan together, then adjust it as you go.</p>
                        <div className="mt-5 flex flex-wrap gap-2">
                          {[
                            ["A weekend in Kansas City", "Plan a two-day Kansas City trip for two travelers with a $300 total budget for activities and meals. We like museums and local food. Lodging and travel to the city are excluded."],
                            ["A relaxing week in Italy", "Help me plan a relaxing week in Puglia for two travelers. We like beaches, local food, and easy hikes. Our total budget is $3200 including flights from New York. Ask me what else you need."],
                            ["Surprise me with a getaway", "Suggest three destinations for a relaxing three-day US getaway for two travelers with a $1000 total budget, excluding travel to the destination. We like local food and nature."],
                          ].map(([label, prompt]) => (
                            <Action key={label} onClick={() => void sendMessage(prompt)} disabled={pending} className="rounded-full border border-line bg-white px-3.5 py-2 text-xs font-semibold hover:border-sea hover:text-sea">{label}</Action>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {turns.map((turn, index) => (
                    <div key={turn.id} className="mb-8">
                      <div className="flex justify-end">
                        <div className="max-w-xl whitespace-pre-wrap rounded-[22px] rounded-tr-md bg-ink px-5 py-4 text-[15px] leading-relaxed text-white">{turn.prompt}</div>
                      </div>
                      <div className="mt-6 flex gap-3">
                        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-sea text-white"><Icon name="sparkles" className="size-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold">Roam</div>
                          {turn.pending && <div role="status" className="mt-2 flex items-center gap-2 text-sm text-muted"><span className="size-2 rounded-full bg-sea motion-safe:animate-pulse" />Planning your journey…</div>}
                          {turn.reply && <div className="chat-response mt-2 text-[15px] leading-7 text-ink/90"><Markdown components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a> }}>{turn.reply}</Markdown></div>}
                          {turn.error && <div role="alert" className="mt-3 rounded-xl border border-coral/30 bg-peach/50 p-4 text-sm leading-6"><p>{turn.error}</p>{index === turns.length - 1 && <Action onClick={() => void sendMessage(turn.prompt, turn.id)} disabled={pending} className="mt-2 font-semibold text-sea underline">Try again</Action>}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>

              {/* Composer: Enter sends, Shift+Enter adds a new line */}
              <div className="shrink-0 px-5 pb-5 pt-2 md:px-10 lg:px-12">
                <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-2 shadow-[0_12px_40px_rgba(18,38,38,0.08)]">
                  <textarea
                    ref={composerRef}
                    role="textbox"
                    aria-label="Message Roam"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={pending}
                    maxLength={8000}
                    rows={2}
                    placeholder="Where would you like to go?"
                    className="min-h-12 max-h-40 w-full resize-y px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted disabled:opacity-60"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between px-2 pb-1">
                    <div className="flex items-center gap-2">
                      <Action className="grid size-8 place-items-center rounded-full border border-line text-muted"><Icon name="plus" className="size-4" /></Action>
                      <div className="text-xs text-muted">Roam can make mistakes. Check key details.</div>
                    </div>
                    <Action label="Send message" disabled={pending || !draft.trim()} onClick={() => void sendMessage()} className="grid size-9 place-items-center rounded-xl bg-sea text-white hover:bg-ink"><Icon name="send" className="size-4" /></Action>
                  </div>
                </div>
              </div>
            </section>

            {/* ===== Right panel: Plan / Map / Budget tabs for the current trip (xl+ only) ===== */}
            <aside className="hidden min-h-0 flex-col bg-panel xl:flex">
              <div className="flex border-b border-line px-5">
                {["Plan", "Map", "Budget"].map((view) => (
                  <Action key={view} onClick={() => setActiveView(view)} className={`flex-1 border-b-2 px-2 py-4 text-center text-xs font-bold ${activeView === view ? "border-sea text-sea" : "border-transparent text-muted"}`}>
                    {view}
                  </Action>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <div className="mb-5 rounded-xl border border-line bg-white p-3 text-xs leading-5 text-muted"><span className="font-semibold text-ink">Example itinerary</span><br />These Puglia details are sample data. Your live plan and revisions appear in the conversation.</div>
                {/* Plan tab: day-by-day itinerary, stays and restaurants, budget summary */}
                {activeView === "Plan" && (
                  <>
                    <div className="flex items-end justify-between">
                      <div><div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Your trip</div><div className="mt-1 font-display text-2xl font-semibold">June 18–25</div></div>
                      <div className="text-xs font-semibold text-sea">7 nights</div>
                    </div>
                    <div className="mt-5 space-y-1.5">
                      {calendarDays.map((item, index) => (
                        <Action key={item.day} className="group grid grid-cols-[44px_1fr] gap-3 rounded-xl p-2 hover:bg-white">
                          <div className="text-center"><div className="text-[9px] font-bold tracking-widest text-muted">{item.weekday}</div><div className="mt-0.5 font-display text-xl font-semibold">{item.day}</div></div>
                          <div className={`relative rounded-xl border border-line bg-white p-3 pl-4 shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full ${item.tone}`}>
                            <div className="text-sm font-bold">{item.title}</div>
                            <div className="mt-1 text-xs text-muted">{item.detail}</div>
                          </div>
                        </Action>
                      ))}
                    </div>
                    <Action className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-xs font-semibold text-muted hover:text-sea">
                      <Icon name="plus" className="size-3.5" /> View all 8 days
                    </Action>

                    <div className="mt-7 flex items-center justify-between"><div className="font-display text-lg font-semibold">Stays & tables</div><Action className="text-xs font-bold text-sea">See all</Action></div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-line bg-white p-3">
                        <div className="grid size-8 place-items-center rounded-lg bg-mint text-sea"><Icon name="hotel" className="size-4" /></div>
                        <div className="mt-3 text-sm font-bold">Masseria Le Torri</div>
                        <div className="mt-1 text-xs text-muted">$174/night · 4.8</div>
                      </div>
                      <div className="rounded-2xl border border-line bg-white p-3">
                        <div className="grid size-8 place-items-center rounded-lg bg-peach text-coral"><Icon name="utensils" className="size-4" /></div>
                        <div className="mt-3 text-sm font-bold">Grotta Palazzese</div>
                        <div className="mt-1 text-xs text-muted">Seafood · 4.7</div>
                      </div>
                    </div>

                    <div className="mt-7 rounded-2xl bg-ink p-4 text-white">
                      <div className="flex items-center justify-between text-xs"><span className="font-bold uppercase tracking-widest text-white/60">Budget</span><span className="font-bold">$3,080 / $3,200</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full w-[96%] rounded-full bg-sun" /></div>
                      <div className="mt-3 flex justify-between text-[11px] text-white/60"><span>Flights $1,296</span><span>$120 left</span></div>
                    </div>
                  </>
                )}

                {/* Map tab: stylized route with numbered stops (not a real map yet) */}
                {activeView === "Map" && (
                  <div>
                    <div className="font-display text-2xl font-semibold">Your route</div>
                    <div className="mt-4 flex aspect-[4/5] flex-col justify-between rounded-2xl bg-map p-5 text-white">
                      <div className="self-end rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink">Adriatic Sea</div>
                      <div className="space-y-3">
                        {["Bari", "Polignano a Mare", "Alberobello"].map((place, index) => <div key={place} className="flex items-center gap-2 rounded-xl bg-ink/85 p-3 text-sm font-bold"><div className="grid size-6 place-items-center rounded-full bg-sun text-[10px] text-ink">{index + 1}</div>{place}</div>)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Budget tab: spending broken down by category */}
                {activeView === "Budget" && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Trip budget</div>
                    <div className="mt-1 font-display text-3xl font-semibold">$3,080</div>
                    <div className="mt-1 text-sm text-muted">of $3,200 planned</div>
                    <div className="mt-6 space-y-3">
                      {[["Flights", "$1,296", "plane"], ["Stays", "$1,044", "hotel"], ["Food", "$460", "utensils"], ["Activities", "$280", "sun"]].map(([label, price, icon]) => (
                        <div key={label} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                          <div className="grid size-9 place-items-center rounded-lg bg-mint text-sea"><Icon name={icon as IconName} className="size-4" /></div>
                          <div className="flex-1 text-sm font-semibold">{label}</div><div className="text-sm font-bold">{price}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
