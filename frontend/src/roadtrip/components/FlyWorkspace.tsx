import { useRef, useState } from "react"
import type { FlyDraft, TravelMode } from "../types"
import { Action, Icon, ModeSwitch, StatusTag } from "./ui"

const itinerary = [
  ["18", "Arrive in Bari", "Check in · Old Town walk"],
  ["19", "Polignano coast", "Beach · Cave boat tour"],
  ["20", "Alberobello", "Trulli · Farm lunch"],
  ["21", "Slow day", "Market · Dinner by the water"],
]

export default function FlyWorkspace({
  draft,
  onMode,
  onEdit,
}: {
  draft: FlyDraft
  onMode: (mode: TravelMode) => void
  onEdit: () => void
}) {
  const [view, setView] = useState<"Plan" | "Map" | "Budget">("Plan")
  const [involvement, setInvolvement] = useState("Co-pilot")
  const [messages, setMessages] = useState<string[]>([])
  const [chatState, setChatState] =
    useState<"idle" | "loading" | "approval" | "error">("idle")
  const composer = useRef<HTMLDivElement>(null)

  const send = () => {
    const message = composer.current?.innerText.trim()
    if (!message) return
    setMessages([...messages, message])
    if (composer.current) composer.current.innerText = ""
    setChatState("loading")
    window.setTimeout(() => setChatState("approval"), 700)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line bg-canvas px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-school">
              <Icon name="plane" className="size-3.5" /> Fly plan · Sample
              prices
            </div>
            <div className="mt-1 font-display text-xl font-semibold md:text-2xl">
              {draft.departure} <span className="text-muted">→</span> Puglia,
              Italy
            </div>
            <div className="mt-1 text-[10px] text-muted">
              {draft.dates} · {draft.travelers} travelers · $
              {draft.budget.toLocaleString()} total budget
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeSwitch mode="fly" onChange={onMode} compact />
            <Action
              onClick={onEdit}
              className="rounded-md border border-line bg-white px-3 py-2 text-[10px] font-bold"
            >
              Edit trip
            </Action>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="flex min-h-0 flex-col border-r border-line">
          <div className="flex-1 overflow-y-auto p-5 md:p-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex justify-end">
                <div className="max-w-xl rounded-lg bg-ink px-4 py-3 text-sm leading-6 text-white">
                  I want a relaxing beach trip in Europe with great food and a
                  little hiking. Keep the total around $
                  {draft.budget.toLocaleString()}.
                </div>
              </div>
              <div className="mt-7 flex gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-school text-white">
                  <Icon name="compass" className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-school">
                    Roam recommendation
                  </div>
                  <div className="mt-2 text-sm leading-7 text-ink/75">
                    Puglia fits the brief: Adriatic coves, excellent regional
                    food, and coastal walking without Amalfi-level prices.
                  </div>
                  <div className="mt-5 overflow-hidden border border-line bg-white">
                    <img
                      src="https://images.unsplash.com/photo-1770493967117-6ae3927c0d05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=84&w=1200"
                      alt="Clifftop coast in Puglia"
                      className="h-56 w-full object-cover"
                    />
                    <div className="grid grid-cols-3 divide-x divide-line">
                      {[
                        ["Estimate", "$3,080 total"],
                        ["Airfare", "$648 each"],
                        ["Pace", "Unhurried"],
                      ].map(([label, value]) => (
                        <div key={label} className="p-4">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-muted">
                            {label}
                          </div>
                          <div className="mt-1 text-xs font-bold">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 border-y border-line py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <Icon name="plane" className="size-4 text-school" /> ITA
                        Airways · 1 stop
                      </div>
                      <StatusTag tone="warning">Sample availability</StatusTag>
                    </div>
                    <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-4">
                      <div>
                        <div className="font-bold">6:10 PM</div>
                        <div className="text-[10px] text-muted">JFK</div>
                      </div>
                      <div className="text-[10px] text-muted">10h 25m →</div>
                      <div>
                        <div className="font-bold">12:35 PM</div>
                        <div className="text-[10px] text-muted">BRI +1</div>
                      </div>
                      <div className="border-l border-line pl-4 text-right">
                        <div className="font-bold">$648</div>
                        <div className="text-[9px] text-muted">
                          estimate / person
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      "Compare flights",
                      "Change the boat tour",
                      "Make it slower",
                    ].map((label) => (
                      <Action
                        key={label}
                        className="border-b border-line px-1 py-2 text-xs font-semibold text-school"
                      >
                        {label} →
                      </Action>
                    ))}
                  </div>
                </div>
              </div>
              {messages.map((message) => (
                <div key={message} className="mt-6 flex justify-end">
                  <div className="max-w-xl rounded-lg bg-ink px-4 py-3 text-sm text-white">
                    {message}
                  </div>
                </div>
              ))}
              {chatState === "loading" && (
                <div className="mt-5 flex items-center gap-2 text-xs text-muted">
                  <div className="size-2 animate-pulse rounded-full bg-school" />{" "}
                  Roam is checking your itinerary…
                </div>
              )}
              {chatState === "approval" && (
                <div className="mt-5 border border-school/30 bg-mint p-4">
                  <div className="text-xs font-bold">
                    Re-plan ready for approval
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Replace the cave tour with a free coastal walk and move
                    lunch later?
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Action
                      onClick={() => setChatState("idle")}
                      className="rounded-md bg-school px-3 py-2 text-[10px] font-bold text-white"
                    >
                      Approve changes
                    </Action>
                    <Action
                      onClick={() => setChatState("error")}
                      className="px-3 py-2 text-[10px] font-bold text-muted"
                    >
                      Try again
                    </Action>
                  </div>
                </div>
              )}
              {chatState === "error" && (
                <div className="mt-5 flex items-center justify-between border border-school/30 bg-peach p-3 text-xs text-school">
                  <span>Roam couldn’t complete that re-plan.</span>
                  <Action
                    onClick={() => setChatState("loading")}
                    className="font-bold underline"
                  >
                    Retry
                  </Action>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-line bg-canvas p-4 md:px-8">
            <div className="mx-auto max-w-3xl border border-line bg-white p-2">
              <div
                ref={composer}
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Ask Roam to change anything…"
                className="composer min-h-11 px-3 py-2 text-sm outline-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              <div className="flex items-center justify-between px-2 pb-1">
                <div className="flex gap-1">
                  {["Co-pilot", "Surprise me"].map((item) => (
                    <Action
                      key={item}
                      onClick={() => setInvolvement(item)}
                      className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${
                        involvement === item
                          ? "bg-mint text-school"
                          : "text-muted"
                      }`}
                    >
                      {item}
                    </Action>
                  ))}
                </div>
                <Action
                  onClick={send}
                  label="Send"
                  className="grid size-8 place-items-center rounded-md bg-school text-white"
                >
                  <Icon name="send" className="size-4" />
                </Action>
              </div>
            </div>
          </div>
        </div>

        <aside className="hidden min-h-0 flex-col bg-panel xl:flex">
          <div className="flex border-b border-line bg-white">
            {(["Plan", "Map", "Budget"] as const).map((item) => (
              <Action
                key={item}
                onClick={() => setView(item)}
                className={`flex-1 border-b-2 py-4 text-center text-[10px] font-bold uppercase tracking-wider ${
                  view === item
                    ? "border-school text-school"
                    : "border-transparent text-muted"
                }`}
              >
                {item}
              </Action>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {view === "Plan" && (
              <div>
                <div className="font-display text-2xl font-semibold">
                  June 18–25
                </div>
                <div className="mt-5 space-y-2">
                  {itinerary.map(([day, title, detail]) => (
                    <div key={day} className="grid grid-cols-[36px_1fr] gap-3">
                      <div className="pt-2 text-center font-display text-xl font-semibold">
                        {day}
                      </div>
                      <div className="border-l-2 border-school bg-white p-3">
                        <div className="text-xs font-bold">{title}</div>
                        <div className="mt-1 text-[10px] text-muted">
                          {detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-7 bg-ink p-4 text-white">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-white/60">
                    <span>Budget</span>
                    <span>$3,080 / $3,200</span>
                  </div>
                  <div className="mt-3 h-1.5 bg-white/15">
                    <div className="h-full w-[96%] bg-sun" />
                  </div>
                </div>
              </div>
            )}
            {view === "Map" && (
              <div>
                <div className="font-display text-2xl font-semibold">
                  Puglia route
                </div>
                <div className="mt-1 text-[10px] text-muted">
                  Route recommendations and sample community discoveries are
                  separate layers.
                </div>
                <div className="relative mt-4 h-[480px] overflow-hidden bg-map">
                  <svg
                    viewBox="0 0 100 100"
                    className="absolute inset-0 size-full"
                  >
                    <path
                      d="M40 5 C58 22 34 41 60 58 S45 80 70 96"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeDasharray="3 2"
                    />
                  </svg>
                  {["Bari", "Polignano", "Alberobello"].map((place, index) => (
                    <div
                      key={place}
                      className="absolute flex items-center gap-2 bg-white px-2 py-1 text-[10px] font-bold"
                      style={{
                        left: `${25 + index * 18}%`,
                        top: `${18 + index * 26}%`,
                      }}
                    >
                      <span className="grid size-5 place-items-center rounded-full bg-school text-white">
                        {index + 1}
                      </span>
                      {place}
                    </div>
                  ))}
                  <div className="absolute left-[68%] top-[31%]">
                    <img
                      src="https://images.unsplash.com/photo-1770493967117-6ae3927c0d05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=300"
                      alt=""
                      className="size-12 rounded-lg border-2 border-white object-cover shadow"
                    />
                    <div className="mx-auto h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-white" />
                  </div>
                  <div className="absolute bottom-3 left-3 bg-white/90 p-2 text-[9px] text-muted">
                    Sample community photo · does not verify access
                  </div>
                </div>
              </div>
            )}
            {view === "Budget" && (
              <div>
                <div className="font-display text-3xl font-semibold">
                  $3,080
                </div>
                <div className="mt-1 text-xs text-muted">
                  of $3,200 estimated
                </div>
                <div className="mt-6 divide-y divide-line border-y border-line">
                  {[
                    ["Flights", "$1,296"],
                    ["Stays", "$1,044"],
                    ["Food", "$460"],
                    ["Activities", "$280"],
                  ].map(([label, price]) => (
                    <div
                      key={label}
                      className="flex justify-between py-4 text-xs"
                    >
                      <span>{label}</span>
                      <span className="font-bold">{price}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-[10px] leading-5 text-muted">
                  All prices are sample estimates and are not live availability.
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
