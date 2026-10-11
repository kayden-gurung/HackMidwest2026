import { useMemo, useState } from "react"
import { googleMapsPlaceUrl } from "../lib/mapLinks"
import type {
  CommunityDiscovery,
  DriveDraft,
  DrivePlan,
  DriveStop,
  LatLng,
  LivePlanDetails,
} from "../types"
import { DriveMap } from "./DriveMap"
import { Action, Icon, StatusTag } from "./ui"

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

function StopCard({
  stop,
  number,
  selected,
  added,
  onSelect,
  onToggle,
  onRetry,
}: {
  stop: DriveStop
  /** The number on this stop's map marker. */
  number: number
  selected: boolean
  added: boolean
  onSelect: () => void
  onToggle: () => void
  onRetry: () => void
}) {
  return (
    <div
      className={`border bg-white transition-colors ${
        selected ? "border-school ring-1 ring-school" : "border-line"
      }`}
    >
      <Action onClick={onSelect} className="flex gap-3 p-3">
        {stop.image ? (
          <img
            src={stop.image}
            alt=""
            className="h-24 w-24 shrink-0 object-cover"
          />
        ) : (
          <div className="grid h-24 w-24 shrink-0 place-items-center bg-panel text-muted">
            <Icon name="camera" />
            <span className="sr-only">Photo unavailable</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-school text-[10px] text-white">
                  {number}
                </span>
                {stop.name}
              </div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-school">
                {stop.category}
              </div>
            </div>
            {stop.lessExplored && (
              <StatusTag tone="accent">Less explored</StatusTag>
            )}
          </div>
          <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
            {stop.reason}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-ink/70">
            <span>
              +{stop.detourMinutes} min drive
              {stop.detourEstimated ? " (est.)" : ""}
            </span>
            <span>~${stop.gasCost.toFixed(2)} gas</span>
            <span>{stop.visitMinutes} min visit</span>
          </div>
        </div>
      </Action>
      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <div>
          <div
            className={`text-[9px] font-bold uppercase tracking-wider ${
              stop.lookup === "failed" ? "text-school" : "text-muted"
            }`}
          >
            {stop.sourceLabel}
          </div>
          {stop.lookup === "failed" && (
            <Action
              onClick={onRetry}
              className="mt-1 text-[10px] font-bold text-school"
            >
              Retry lookup
            </Action>
          )}
        </div>
        <Action
          onClick={onToggle}
          className={`rounded-md px-3 py-2 text-[10px] font-bold ${
            added ? "border border-line text-school" : "bg-school text-white"
          }`}
        >
          {added ? "Remove stop" : "Add stop"}
        </Action>
      </div>
    </div>
  )
}

function DiscoveryUpload({
  location,
  onClose,
  onAdd,
}: {
  /** Where the visitor dropped the pin on the map. */
  location: LatLng
  onClose: () => void
  onAdd: (discovery: CommunityDiscovery) => void
}) {
  const [step, setStep] = useState(0)
  const [place, setPlace] = useState("Missouri River overlook")
  const [caption, setCaption] = useState("A quiet view we nearly drove past.")
  const image =
    "https://images.unsplash.com/photo-1702391794650-261670c76e92?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=600"
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-ink/55 p-4">
      <div className="w-full max-w-lg border border-line bg-canvas shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-sm font-bold">Add a discovery</div>
            <div className="mt-1 text-[10px] text-muted">
              Saved to this browser session only
            </div>
          </div>
          <Action onClick={onClose} label="Close">
            <Icon name="close" className="size-5" />
          </Action>
        </div>
        <div className="p-5">
          <div className="mb-5 grid grid-cols-4 gap-1">
            {["Photo", "Place", "Caption", "Preview"].map((label, index) => (
              <div
                key={label}
                className={`border-t-2 pt-2 text-[9px] font-bold uppercase tracking-wider ${
                  index <= step
                    ? "border-school text-school"
                    : "border-line text-muted"
                }`}
              >
                {label}
              </div>
            ))}
          </div>
          {step === 0 && (
            <div className="grid min-h-56 place-items-center border border-dashed border-line bg-white text-center">
              <div>
                <Icon name="camera" className="mx-auto size-7 text-school" />
                <div className="mt-3 text-sm font-bold">Choose a photo</div>
                <div className="mt-1 text-xs text-muted">
                  Prototype uses a sample preview image.
                </div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Choose place
              </div>
              <div
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                onInput={(event) =>
                  setPlace(event.currentTarget.textContent ?? "")
                }
                className="mt-2 border border-line bg-white p-3 text-sm outline-none"
              >
                {place}
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                What did you discover?
              </div>
              <div
                role="textbox"
                contentEditable
                suppressContentEditableWarning
                onInput={(event) =>
                  setCaption(event.currentTarget.textContent ?? "")
                }
                className="mt-2 min-h-28 border border-line bg-white p-3 text-sm outline-none"
              >
                {caption}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="overflow-hidden border border-line bg-white">
              <img src={image} alt="" className="h-52 w-full object-cover" />
              <div className="p-4">
                <div className="font-display text-xl font-semibold">
                  {place}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted">
                  {caption}
                </div>
                <div className="mt-2 text-[10px] text-muted">
                  Pinned at {location[0].toFixed(3)}, {location[1].toFixed(3)}
                </div>
                <StatusTag>Local session preview</StatusTag>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between border-t border-line p-4">
          <Action
            onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
            className="px-3 py-2 text-xs font-bold text-muted"
          >
            {step > 0 ? "Back" : "Cancel"}
          </Action>
          <Action
            onClick={() =>
              step < 3
                ? setStep(step + 1)
                : onAdd({
                    id: `local-${Date.now()}`,
                    place,
                    caption,
                    image,
                    lat: location[0],
                    lng: location[1],
                    count: 1,
                  })
            }
            className="rounded-md bg-school px-4 py-2 text-xs font-bold text-white"
          >
            {step < 3 ? "Continue" : "Save discovery"}
          </Action>
        </div>
      </div>
    </div>
  )
}

function StopDetail({
  stop,
  added,
  onToggle,
  onClose,
}: {
  stop: DriveStop
  added: boolean
  onToggle: () => void
  onClose: () => void
}) {
  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-line bg-canvas shadow-xl sm:w-[420px]">
      <div className="relative">
        {stop.image ? (
          <img src={stop.image} alt="" className="h-64 w-full object-cover" />
        ) : (
          <div className="grid h-64 place-items-center bg-panel text-muted">
            <Icon name="camera" className="size-8" />
          </div>
        )}
        <Action
          onClick={onClose}
          className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/95"
        >
          <Icon name="close" className="size-4" />
        </Action>
      </div>
      <div className="p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-school">
          {stop.category}
        </div>
        <div className="mt-2 font-display text-3xl font-semibold">
          {stop.name}
        </div>
        <div className="mt-4 text-sm leading-6 text-ink/75">{stop.reason}</div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-line border-y border-line py-4 text-center">
          <div>
            <div className="text-lg font-bold">+{stop.detourMinutes}</div>
            <div className="text-[9px] uppercase text-muted">Drive min</div>
          </div>
          <div>
            <div className="text-lg font-bold">~${stop.gasCost.toFixed(2)}</div>
            <div className="text-[9px] uppercase text-muted">Extra gas</div>
          </div>
          <div>
            <div className="text-lg font-bold">{stop.visitMinutes}</div>
            <div className="text-[9px] uppercase text-muted">Visit min</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {stop.interests.map((interest) => (
            <StatusTag key={interest}>{interest}</StatusTag>
          ))}
        </div>
        <div className="mt-6">
          <div className="text-xs font-bold">Source & lookup</div>
          <div className="mt-2 text-xs text-muted">
            {stop.lookup === "live"
              ? `${stop.sourceLabel} · looked up when this plan was made`
              : `${stop.sourceLabel} · Last checked date unavailable`}
          </div>
          {stop.sourceUrl && (
            <Action
              onClick={() =>
                window.open(stop.sourceUrl, "_blank", "noopener,noreferrer")
              }
              className="mt-2 text-[10px] font-bold text-school underline"
            >
              {stop.lookup === "live" ? "Open on OpenStreetMap ↗" : "Open official reference ↗"}
            </Action>
          )}
          {stop.websiteUrl && (
            <a
              href={stop.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-[10px] font-bold text-school underline"
            >
              Website ↗
            </a>
          )}
          {googleMapsPlaceUrl(stop) && (
            <a
              href={googleMapsPlaceUrl(stop)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-[10px] font-bold text-school underline"
            >
              Open in Google Maps ↗
            </a>
          )}
          <div className="mt-1 text-[10px] leading-4 text-muted">
            {stop.lookup === "live"
              ? "Map data does not verify hours, safety, or public access."
              : "Demo information does not verify hours, safety, or public access."}
            {stop.detourEstimated &&
              " The routing service did not answer, so the detour time is estimated from distance."}
          </div>
        </div>
        <Action
          onClick={onToggle}
          className={`mt-6 flex w-full items-center justify-center rounded-md py-3 text-xs font-bold ${
            added ? "border border-school text-school" : "bg-school text-white"
          }`}
        >
          {added ? "Remove from drive" : "Add to drive"}
        </Action>
        {stop.learned && (
          <div className="mt-8 border-t border-line pt-6">
            <div className="font-display text-xl font-semibold">
              What I learned here
            </div>
            <div className="mt-3 bg-white p-4 text-xs italic leading-6 text-ink/70">
              “{stop.learned}”
            </div>
          </div>
        )}
        <div className="mt-6">
          <div className="text-xs font-bold">Community photos</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              stop.image,
              "https://images.unsplash.com/photo-1722101503175-942f45bc1c95?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=80&w=400",
            ].map(
              (image, index) =>
                image && (
                  <div key={image}>
                    <img
                      src={image}
                      alt=""
                      className="h-28 w-full object-cover"
                    />
                    <div className="mt-1 text-[9px] leading-4 text-muted">
                      {index === 0
                        ? "Sample photo · the landscape set the pace."
                        : "Sample discovery · we stayed for the evening light."}
                    </div>
                  </div>
                ),
            )}
          </div>
        </div>
        <div className="mt-6 rotate-[-1deg] border border-line bg-[#efe4cf] p-5 shadow-sm">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-school">
            A Roam postcard
          </div>
          <div className="mt-3 font-display text-2xl font-semibold">
            Worth the turn.
          </div>
          <div className="mt-2 text-xs leading-5 text-muted">
            Save this place to remember the route, the story, and what made you
            stop.
          </div>
        </div>
      </div>
    </div>
  )
}

/** The plan's days: drives, stops, lunch and overnight stays. Stops the traveler removed are struck through. */
function DayByDay({ live, added }: { live: LivePlanDetails; added: string[] }) {
  const days = [...new Set(live.itinerary.items.map((item) => item.date))]
  return (
    <div className="mt-3 border border-line bg-white p-3">
      <div className="text-sm font-bold">Day by day</div>
      <div className="mt-1 text-[10px] text-muted">
        Times are rough estimates, starting at 8:00 am.
      </div>
      {days.map((day, index) => (
        <div key={day} className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-school">
            Day {index + 1} ·{" "}
            {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          <ul className="mt-1 space-y-1">
            {live.itinerary.items
              .filter((item) => item.date === day)
              .map((item) => {
                const removed =
                  item.id.startsWith("stop-") &&
                  !added.includes(item.id.slice("stop-".length))
                return (
                  <li
                    key={item.id}
                    className={`flex gap-2 text-[11px] leading-4 ${
                      removed ? "text-muted line-through" : ""
                    }`}
                  >
                    <span className="w-9 shrink-0 font-semibold text-muted">
                      {item.time ?? ""}
                    </span>
                    <span className="min-w-0">
                      {item.title}
                      {item.sourceUrls[0]?.includes("openstreetmap.org/") && (
                        <a
                          href={item.sourceUrls[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 text-school underline"
                        >
                          source
                        </a>
                      )}
                    </span>
                  </li>
                )
              })}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function DriveWorkspace({
  draft,
  plan,
  onEdit,
}: {
  draft: DriveDraft
  plan: DrivePlan
  onEdit: () => void
}) {
  const { route, stops, live } = plan
  // A live plan starts with the stops the planner chose; the demo with its first suggestion.
  // Mount this with a new `key` for a new plan.
  const [added, setAdded] = useState<string[]>(
    live ? live.chosenIds : stops.slice(0, 1).map((stop) => stop.id),
  )
  const [selectedId, setSelectedId] = useState<string | null>(
    live ? (live.chosenIds[0] ?? null) : (stops[0]?.id ?? null),
  )
  const [focusTick, setFocusTick] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)
  const [budget, setBudget] = useState(draft.detourBudget)
  const [notice, setNotice] = useState(live?.notes.join(" ") ?? "")
  const [lookupRetried, setLookupRetried] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [showCommunity, setShowCommunity] = useState(true)
  const [discoveries, setDiscoveries] = useState(plan.discoveries)
  const [activeDiscovery, setActiveDiscovery] =
    useState<CommunityDiscovery | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Choosing where on the map a new photo pin goes.
  const [placing, setPlacing] = useState(false)
  const [pinLocation, setPinLocation] = useState<LatLng | null>(null)
  const [mobileView, setMobileView] = useState<"map" | "list">("map")
  const [askOpen, setAskOpen] = useState(false)
  const usedMinutes = useMemo(
    () =>
      stops
        .filter((stop) => added.includes(stop.id))
        .reduce((sum, stop) => sum + stop.detourMinutes, 0),
    [added, stops],
  )
  const gas = useMemo(
    () =>
      stops
        .filter((stop) => added.includes(stop.id))
        .reduce((sum, stop) => sum + stop.gasCost, 0),
    [added, stops],
  )
  const selected = stops.find((stop) => stop.id === selectedId) ?? null

  // Picking a stop (from the list or the map) moves the map to it.
  const selectStop = (id: string, openDetail: boolean) => {
    setSelectedId(id)
    setFocusTick((tick) => tick + 1)
    if (openDetail) setDetailOpen(true)
    // On a phone the list covers the map, so show the map.
    setMobileView("map")
  }

  const toggleStop = (stop: DriveStop) => {
    if (added.includes(stop.id)) {
      setAdded(added.filter((id) => id !== stop.id))
      setNotice(`${stop.name} removed. Detour summary updated.`)
      return
    }
    const over = usedMinutes + stop.detourMinutes - budget
    if (over > 0) {
      setNotice(
        `${stop.name} is ${over} minutes over your driving-time budget. Remove another stop or increase the budget.`,
      )
      return
    }
    setAdded([...added, stop.id])
    setNotice(
      `${stop.name} added. You have ${budget - usedMinutes - stop.detourMinutes} detour minutes left.`,
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line bg-canvas px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-school">
              <Icon name="car" className="size-3.5" /> Drive plan ·{" "}
              {live ? "Live map data" : "Cached demo"}
            </div>
            <div className="mt-1 font-display text-xl font-semibold md:text-2xl">
              {route.origin.name} <span className="text-muted">→</span>{" "}
              {route.destination.name}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Action
              onClick={onEdit}
              className="rounded-md border border-line bg-white px-3 py-2 text-[10px] font-bold"
            >
              Edit drive
            </Action>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            [
              "Base drive",
              `${formatDuration(route.baseMinutes)} · ${route.distanceMiles} mi`,
            ],
            ["Added drive", `${usedMinutes} min`],
            ["Extra gas", `~$${gas.toFixed(2)}`],
            ["Detour budget", `${usedMinutes} of ${budget} min`],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`${
                index === 3 ? "bg-mint" : "bg-white"
              } border border-line px-3 py-2`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted">
                {label}
              </div>
              <div className="mt-1 text-xs font-bold">{value}</div>
              {index === 3 && (
                <div className="mt-2 h-1 bg-white">
                  <div
                    className={`h-full ${
                      usedMinutes >= budget ? "bg-school" : "bg-coral"
                    }`}
                    style={{
                      width: `${Math.min(100, (usedMinutes / budget) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        {notice && (
          <div className="mt-2 flex items-center justify-between gap-3 bg-peach px-3 py-2 text-[10px] font-semibold text-school">
            <span>{notice}</span>
            {notice.includes("over") && (
              <Action
                onClick={() => {
                  setBudget(120)
                  setNotice("Budget increased to 120 minutes.")
                }}
                className="shrink-0 underline"
              >
                Increase to 120 min
              </Action>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 border-b border-line bg-white p-2 lg:hidden">
        {(["map", "list"] as const).map((view) => (
          <Action
            key={view}
            onClick={() => setMobileView(view)}
            className={`min-w-24 rounded-md px-4 py-2 text-center text-xs font-bold capitalize ${
              mobileView === view ? "bg-school text-white" : "text-muted"
            }`}
          >
            {view}
          </Action>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 lg:grid lg:grid-cols-[360px_minmax(0,1fr)]">
        <div
          className={`${
            mobileView === "list"
              ? "absolute inset-x-0 bottom-0 z-20 block h-[64%] rounded-t-xl shadow-xl"
              : "hidden"
          } overflow-y-auto border-r border-line bg-panel p-3 lg:static lg:block lg:h-full lg:rounded-none lg:shadow-none`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold">Suggested stops</div>
              <div className="mt-1 text-[10px] text-muted">
                Detour time excludes time spent visiting.
              </div>
            </div>
            <StatusTag>
              {live?.pending ? "searching" : `${stops.length} ${live ? "found" : "demo"}`}
            </StatusTag>
          </div>
          {live?.pending && (
            <div className="mb-3 flex items-center gap-3 border border-line bg-white p-3 text-[10px] leading-5 text-muted">
              <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-school" />
              <span>
                Finding stops, lunch and places to stay along your route. The
                first search of a route can take up to 30 seconds.
              </span>
            </div>
          )}
          {live && !live.pending && stops.length === 0 && (
            <div className="mb-3 border border-line bg-white p-3 text-[10px] leading-5 text-muted">
              No stops matched these interests within the detour budget. Try
              more interests or a bigger budget.
            </div>
          )}
          {!live && budget === 15 && (
            <div className="mb-3 border border-line bg-white p-3 text-[10px] leading-5 text-muted">
              No verified stops are available in this prototype within 15
              minutes. Cached demo suggestions are shown below.
            </div>
          )}
          <div className="space-y-3">
            {stops.map((stop, index) => (
              <StopCard
                key={stop.id}
                number={index + 1}
                stop={{
                  ...stop,
                  lookup: lookupRetried.includes(stop.id)
                    ? "pending"
                    : stop.lookup,
                  sourceLabel: lookupRetried.includes(stop.id)
                    ? "Verification pending"
                    : stop.sourceLabel,
                }}
                selected={selectedId === stop.id}
                added={added.includes(stop.id)}
                onSelect={() => selectStop(stop.id, true)}
                onToggle={() => toggleStop(stop)}
                onRetry={() => setLookupRetried([...lookupRetried, stop.id])}
              />
            ))}
          </div>
          {live && <DayByDay live={live} added={added} />}
          <div className="mt-3 border border-line bg-white">
            <Action
              onClick={() => setAskOpen(!askOpen)}
              className="flex items-center justify-between p-3 text-xs font-bold"
            >
              <span className="flex items-center gap-2">
                <Icon name="sparkles" className="size-4 text-school" /> Ask Roam
              </span>
              <Icon
                name="chevron"
                className={`size-4 ${askOpen ? "rotate-90" : ""}`}
              />
            </Action>
            {askOpen && (
              <div className="border-t border-line p-3">
                <div className="text-xs leading-5 text-muted">
                  Try “Find a lunch stop without adding more than 20 minutes.”
                </div>
                <div className="mt-3 flex items-center justify-between border border-line bg-canvas px-3 py-2">
                  <span className="text-xs text-muted">
                    Ask about this route…
                  </span>
                  <Icon name="send" className="size-4 text-school" />
                </div>
                <div className="mt-2 text-[9px] text-muted">
                  Agent X-ray: Uses interests, route corridor, and detour
                  budget. Expandable reasoning is demo-only.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="relative h-full min-h-[520px]">
          <DriveMap
            route={route}
            stops={stops}
            addedIds={added}
            selectedId={selectedId}
            focusTick={focusTick}
            detailOpen={detailOpen}
            discoveries={discoveries}
            showSuggestions={showSuggestions}
            showCommunity={showCommunity}
            placing={placing}
            onSelectStop={(id) => selectStop(id, false)}
            onToggleStop={(id) => {
              const stop = stops.find((candidate) => candidate.id === id)
              if (stop) toggleStop(stop)
            }}
            onOpenDetail={(id) => selectStop(id, true)}
            onSelectDiscovery={setActiveDiscovery}
            onPlace={(lat, lng) => {
              setPlacing(false)
              setPinLocation([lat, lng])
              setUploadOpen(true)
            }}
          />
          <Action
            onClick={() => setPlacing(!placing)}
            className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-md bg-school px-3 py-2 text-[10px] font-bold text-white shadow-sm"
          >
            <Icon name={placing ? "close" : "camera"} className="size-3.5" />{" "}
            {placing ? "Cancel" : "Add a discovery"}
          </Action>
          <div className="absolute right-4 top-4 z-20 space-y-1 border border-line bg-white p-2 shadow-sm">
            <div className="flex items-center gap-2 px-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-muted">
              <Icon name="layers" className="size-3.5" /> Map layers
            </div>
            <Action
              onClick={() => setShowSuggestions(!showSuggestions)}
              className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold"
            >
              <div
                className={`size-3 border ${
                  showSuggestions ? "border-school bg-school" : "border-line"
                }`}
              />{" "}
              Suggested stops
            </Action>
            <Action
              onClick={() => setShowCommunity(!showCommunity)}
              className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold"
            >
              <div
                className={`size-3 border ${
                  showCommunity ? "border-school bg-school" : "border-line"
                }`}
              />{" "}
              Community discoveries
            </Action>
          </div>
          {activeDiscovery && (
            <div className="absolute bottom-5 left-1/2 z-20 w-[min(90%,360px)] -translate-x-1/2 border border-line bg-white p-3 shadow-xl">
              <div className="flex gap-3">
                <img
                  src={activeDiscovery.image}
                  alt=""
                  className="size-20 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between">
                    <div className="text-sm font-bold">
                      {activeDiscovery.place}
                    </div>
                    <Action onClick={() => setActiveDiscovery(null)}>
                      <Icon name="close" className="size-4" />
                    </Action>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-muted">
                    {activeDiscovery.caption}
                  </div>
                  <div className="mt-1 text-[9px] text-muted">
                    {activeDiscovery.sample
                      ? "Sample community discovery"
                      : "Saved in this local session"}{" "}
                    · Does not verify access
                  </div>
                </div>
              </div>
            </div>
          )}
          {detailOpen && selected && (
            <StopDetail
              stop={selected}
              added={added.includes(selected.id)}
              onToggle={() => toggleStop(selected)}
              onClose={() => setDetailOpen(false)}
            />
          )}
          {uploadOpen && pinLocation && (
            <DiscoveryUpload
              location={pinLocation}
              onClose={() => setUploadOpen(false)}
              onAdd={(discovery) => {
                setDiscoveries([...discoveries, discovery])
                setUploadOpen(false)
                setActiveDiscovery(discovery)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
