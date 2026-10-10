import { useRef, useState } from "react";

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

function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={name === "sparkles" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Action({
  children,
  onClick,
  className = "",
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <div role="button" aria-label={label} tabIndex={0} onClick={onClick} onKeyDown={(event) => event.key === "Enter" && onClick?.()} className={`cursor-pointer select-none transition-all active:scale-[0.98] ${className}`}>
      {children}
    </div>
  );
}

const history = [
  { title: "A slow week in Puglia", meta: "Italy · $3,200", active: true },
  { title: "Hiking in Patagonia", meta: "Chile · $4,800" },
  { title: "Tokyo food weekend", meta: "Japan · $2,700" },
  { title: "Mexico City with friends", meta: "Mexico · $1,900" },
];

const calendarDays = [
  { day: "18", weekday: "MON", title: "Arrive in Bari", detail: "Check in · Old Town walk", tone: "before:bg-blue" },
  { day: "19", weekday: "TUE", title: "Polignano coast", detail: "Beach · Cave boat tour", tone: "before:bg-yellow" },
  { day: "20", weekday: "WED", title: "Alberobello", detail: "Trulli · Farm lunch", tone: "before:bg-green" },
  { day: "21", weekday: "THU", title: "Slow day", detail: "Market · Dinner at Grotta", tone: "before:bg-coral" },
];

export default function App() {
  const [activeView, setActiveView] = useState("Plan");
  const [messages, setMessages] = useState<string[]>([]);
  const [involvement, setInvolvement] = useState("Co-pilot");
  const composerRef = useRef<HTMLDivElement>(null);

  const sendMessage = () => {
    const value = composerRef.current?.innerText.trim();
    if (!value) return;
    setMessages((current) => [...current, value]);
    if (composerRef.current) composerRef.current.innerText = "";
  };

  return (
    <div className="min-h-screen bg-canvas text-ink lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sidebar p-4 lg:flex">
          <div className="flex items-center gap-2.5 px-2 py-3">
            <div className="grid size-8 place-items-center rounded-xl bg-ink text-white"><Icon name="compass" className="size-5" /></div>
            <div className="font-display text-xl font-semibold tracking-tight">Roam</div>
          </div>

          <Action className="mt-5 flex items-center gap-2 rounded-xl bg-ink px-3.5 py-3 text-sm font-semibold text-white shadow-sm">
            <Icon name="plus" className="size-4" /> New journey
          </Action>

          <div className="mt-7 flex items-center gap-2 rounded-xl border border-line bg-white/60 px-3 py-2.5 text-sm text-muted">
            <Icon name="search" className="size-4" />
            <div>Search your trips</div>
          </div>

          <div className="mt-7 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Recent journeys</div>
          <div className="mt-2 space-y-1">
            {history.map((item) => (
              <Action key={item.title} className={`group rounded-xl px-3 py-3 ${item.active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}>
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
          <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line bg-canvas/90 px-5 backdrop-blur md:px-8">
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-xl bg-ink text-white lg:hidden"><Icon name="compass" className="size-5" /></div>
              <div>
                <div className="font-display text-lg font-semibold">A slow week in Puglia</div>
                <div className="hidden text-xs text-muted sm:block">Jun 18–25 · 2 travelers · From New York</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1 rounded-full border border-line bg-white p-1 sm:flex">
                {["Co-pilot", "Surprise me"].map((item) => (
                  <Action key={item} onClick={() => setInvolvement(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${involvement === item ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                    {item}
                  </Action>
                ))}
              </div>
              <Action className="grid size-9 place-items-center rounded-full border border-line bg-white"><Icon name="more" className="size-5" /></Action>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="flex min-h-0 flex-col border-line xl:border-r">
              <div className="flex-1 overflow-y-auto px-5 py-7 md:px-10 lg:px-12">
                <div className="mx-auto max-w-3xl">
                  <div className="mb-8 flex justify-end">
                    <div className="max-w-xl rounded-[22px] rounded-tr-md bg-ink px-5 py-4 text-[15px] leading-relaxed text-white">
                      I want a relaxing beach trip somewhere in Europe with great food and a little hiking. Around $3,200 for two, including flights from NYC.
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-sea text-white"><Icon name="sparkles" className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">Roam</div>
                      <div className="mt-2 text-[15px] leading-7 text-ink/80">
                        Puglia feels just right. You’ll get Adriatic coves, incredible cucina povera, and coastal trails—without the Amalfi crowds or prices.
                      </div>

                      <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                        <div className="relative h-48 overflow-hidden md:h-56">
                          <img
                            src="https://images.unsplash.com/photo-1770493967117-6ae3927c0d05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=1400"
                            alt="Clifftop homes along the turquoise coast of Polignano a Mare, Puglia"
                            className="size-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <div className="absolute bottom-0 p-5 text-white">
                            <div className="mb-2 inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur">Top match · 94%</div>
                            <div className="font-display text-2xl font-semibold">Puglia, Italy</div>
                            <div className="mt-1 text-sm text-white/80">Bari · Polignano a Mare · Alberobello</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-line">
                          <div className="p-4"><div className="text-xs text-muted">Est. total</div><div className="mt-1 font-bold">$3,080</div></div>
                          <div className="p-4"><div className="text-xs text-muted">Round trip</div><div className="mt-1 font-bold">$648 pp</div></div>
                          <div className="p-4"><div className="text-xs text-muted">Trip pace</div><div className="mt-1 font-bold">Relaxed</div></div>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-line bg-white p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-bold"><Icon name="plane" className="size-4 text-sea" /> Best flight option</div>
                          <div className="rounded-full bg-mint px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sea">Within budget</div>
                        </div>
                        <div className="mt-4 flex items-center gap-4">
                          <div><div className="text-lg font-bold">6:10 PM</div><div className="text-xs text-muted">JFK</div></div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-[10px] text-muted"><div className="h-px flex-1 bg-line" /> 10h 25m · 1 stop <div className="h-px flex-1 bg-line" /></div>
                          </div>
                          <div className="text-right"><div className="text-lg font-bold">12:35 PM</div><div className="text-xs text-muted">BRI +1</div></div>
                          <div className="hidden border-l border-line pl-4 text-right sm:block"><div className="font-bold">$648</div><div className="text-xs text-muted">per person</div></div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {["Swap the boat tour", "Show hotel options", "Make it more relaxing"].map((label) => (
                          <Action key={label} className="rounded-full border border-line bg-white px-3.5 py-2 text-xs font-semibold hover:border-sea hover:text-sea">{label}</Action>
                        ))}
                      </div>
                    </div>
                  </div>

                  {messages.map((message, index) => (
                    <div key={`${message}-${index}`} className="mt-7 flex justify-end">
                      <div className="max-w-xl rounded-[22px] rounded-tr-md bg-ink px-5 py-4 text-[15px] leading-relaxed text-white">{message}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="shrink-0 px-5 pb-5 pt-2 md:px-10 lg:px-12">
                <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-2 shadow-[0_12px_40px_rgba(18,38,38,0.08)]">
                  <div
                    ref={composerRef}
                    role="textbox"
                    aria-label="Message Roam"
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder="Ask Roam to change anything..."
                    className="composer min-h-12 px-3 py-3 text-sm leading-6 outline-none"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between px-2 pb-1">
                    <div className="flex items-center gap-2">
                      <Action className="grid size-8 place-items-center rounded-full border border-line text-muted"><Icon name="plus" className="size-4" /></Action>
                      <div className="text-xs text-muted">Roam can make mistakes. Check key details.</div>
                    </div>
                    <Action label="Send message" onClick={sendMessage} className="grid size-9 place-items-center rounded-xl bg-sea text-white hover:bg-ink"><Icon name="send" className="size-4" /></Action>
                  </div>
                </div>
              </div>
            </section>

            <aside className="hidden min-h-0 flex-col bg-panel xl:flex">
              <div className="flex border-b border-line px-5">
                {["Plan", "Map", "Budget"].map((view) => (
                  <Action key={view} onClick={() => setActiveView(view)} className={`flex-1 border-b-2 px-2 py-4 text-center text-xs font-bold ${activeView === view ? "border-sea text-sea" : "border-transparent text-muted"}`}>
                    {view}
                  </Action>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
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
