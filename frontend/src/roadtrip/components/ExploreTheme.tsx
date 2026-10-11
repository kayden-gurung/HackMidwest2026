import { useEffect, useRef, useState } from "react"
import { fetchExplore, fetchExploreRoute, type ExploreResult, type ExploreRoute, type ExploreSpot, type ExploreThemeId } from "../api/explore"
import { isKnownCity } from "../data/cities"
import { safeWebUrl } from "../lib/mapLinks"
import ExploreMap, { directionsUrl, formatDrive } from "./ExploreMap"
import { CityField } from "./TripSetup"
import { Action, Icon } from "./ui"

const HOUR_CHOICES = [1, 2, 3, 4]

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; result: ExploreResult }

function SpotLinks({ origin, spot }: { origin: ExploreResult["origin"]; spot: ExploreSpot }) {
  const links = [
    ["Directions", directionsUrl(origin, spot)],
    ["Website", safeWebUrl(spot.website_url ?? undefined)],
    ["Wikipedia", safeWebUrl(spot.wikipedia_url ?? undefined)],
    ["Map source", safeWebUrl(spot.source_url)],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]))
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {links.map(([label, url]) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          // A link inside the selectable card shouldn't also select it.
          onClick={(event) => event.stopPropagation()}
          className="text-[10px] font-bold text-school underline-offset-2 hover:underline"
        >
          {label} ↗
        </a>
      ))}
    </div>
  )
}

function SpotCard({
  spot,
  number,
  origin,
  selected,
  route,
  onSelect,
  onPlan,
}: {
  spot: ExploreSpot
  number: number
  origin: ExploreResult["origin"]
  selected: boolean
  route: ExploreRoute | null
  onSelect: () => void
  onPlan: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  // Picking a pin on the map brings its card into view.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected])
  return (
    <li
      ref={ref}
      className={`border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        selected ? "border-school ring-1 ring-school" : "border-line"
      }`}
    >
      <Action onClick={onSelect} className="flex gap-3 p-3" label={`Show ${spot.name} on the map`}>
        <div
          className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
            selected ? "bg-school text-white" : "border border-line text-school"
          }`}
        >
          {number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-5">{spot.name}</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-school">
            {[spot.kind, spot.town].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Icon name="clock" className="size-3.5" /> {formatDrive(spot.drive_minutes)}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="car" className="size-3.5" /> {spot.drive_miles} mi by road
            </span>
          </div>
          <SpotLinks origin={origin} spot={spot} />
        </div>
      </Action>
      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5">
          <span className="text-[10px] text-muted">
            {route ? `Road drawn on the map · ${route.miles} mi, ${formatDrive(route.minutes)}` : "Drawing the road…"}
          </span>
          {spot.town && (
            <Action
              onClick={onPlan}
              className="rounded-md bg-school px-3 py-1.5 text-[10px] font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-ink hover:shadow-md"
            >
              Plan a drive here
            </Action>
          )}
        </div>
      )}
    </li>
  )
}

/** One Explore theme: real spots within a few hours of the start city, on a list and a map. */
export default function ExploreTheme({
  theme,
  image,
  defaultOrigin,
  onBack,
  onPlanDrive,
}: {
  theme: ExploreThemeId
  image: string
  defaultOrigin: string
  onBack: () => void
  onPlanDrive: (origin: string, destination: string) => void
}) {
  const [typed, setTyped] = useState(defaultOrigin)
  const [origin, setOrigin] = useState(isKnownCity(defaultOrigin) ? defaultOrigin : "Kansas City, MO")
  const [hours, setHours] = useState(3)
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<Load>({ status: "loading" })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [route, setRoute] = useState<ExploreRoute | null>(null)

  // Search again once the start is a city we know, not on every keystroke.
  useEffect(() => {
    if (isKnownCity(typed) && typed !== origin) setOrigin(typed)
  }, [typed, origin])

  useEffect(() => {
    const controller = new AbortController()
    setLoad({ status: "loading" })
    setSelectedId(null)
    fetchExplore(theme, origin, hours, controller.signal)
      .then((result) => setLoad({ status: "ok", result }))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoad({ status: "error", message: error.message })
      })
    return () => controller.abort()
  }, [theme, origin, hours, attempt])

  const result = load.status === "ok" ? load.result : null
  const selected = result?.spots.find((spot) => spot.id === selectedId) ?? null

  // The road to the selected spot.
  useEffect(() => {
    setRoute(null)
    if (!result || !selected) return
    const controller = new AbortController()
    fetchExploreRoute(result.origin, selected, controller.signal)
      .then(setRoute)
      .catch(() => undefined)
    return () => controller.abort()
  }, [result, selected])

  const spots = result?.spots ?? []
  const nearest = spots[0]
  const farthest = spots[spots.length - 1]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden">
      <header className="relative shrink-0 overflow-hidden border-b border-line">
        <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/60 to-ink/20" />
        <div className="relative px-5 py-6 text-white md:px-9">
          <Action
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest backdrop-blur transition-colors hover:bg-white/25"
          >
            <Icon name="chevron" className="size-3.5 rotate-180" /> All themes
          </Action>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
            {result?.tags ?? "Roam discoveries"}
          </div>
          <h1 className="mt-1 font-display text-4xl font-semibold">{result?.title ?? "Exploring…"}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/85">
            Real places within {hours} {hours === 1 ? "hour" : "hours"} of {origin}. Distances and times are by road.
          </p>
        </div>
      </header>

      <div className="shrink-0 border-b border-line bg-canvas px-5 py-4 md:px-9">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-72">
            <CityField label="Starting from" value={typed} onChange={setTyped} />
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Within</div>
            <div className="flex gap-1.5">
              {HOUR_CHOICES.map((choice) => (
                <Action
                  key={choice}
                  onClick={() => setHours(choice)}
                  className={`rounded-md border px-3.5 py-2.5 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    hours === choice ? "border-school bg-school text-white" : "border-line bg-white text-ink hover:border-school/60"
                  }`}
                >
                  {choice} h
                </Action>
              ))}
            </div>
          </div>
          {result && spots.length > 0 && (
            <div className="ml-auto grid grid-cols-3 gap-2 text-center">
              {[
                ["Places", String(spots.length)],
                ["Nearest", formatDrive(nearest.drive_minutes)],
                ["Farthest", `${farthest.drive_miles} mi`],
              ].map(([label, value]) => (
                <div key={label} className="border border-line bg-white px-3 py-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</div>
                  <div className="mt-0.5 text-sm font-bold">{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="order-2 min-h-0 border-line p-4 lg:order-1 lg:overflow-y-auto lg:border-r">
          {load.status === "loading" && (
            <div aria-live="polite">
              <div className="mb-3 text-xs text-muted">Searching OpenStreetMap and measuring each drive. This can take a few seconds.</div>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="mb-2 h-24 animate-pulse border border-line bg-white" />
              ))}
            </div>
          )}
          {load.status === "error" && (
            <div role="alert" className="border border-line bg-peach p-4 text-xs">
              <div className="font-bold text-school">{load.message}</div>
              <Action onClick={() => setAttempt(attempt + 1)} className="mt-3 inline-block font-bold text-school underline">
                Try again
              </Action>
            </div>
          )}
          {result && spots.length === 0 && (
            <div className="border border-dashed border-line p-6 text-center text-xs text-muted">
              Nothing found within {hours} {hours === 1 ? "hour" : "hours"} of {origin}. Try a longer drive.
            </div>
          )}
          {result && spots.length > 0 && (
            <ol className="space-y-2">
              {spots.map((spot, index) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  number={index + 1}
                  origin={result.origin}
                  selected={spot.id === selectedId}
                  route={spot.id === selectedId ? route : null}
                  onSelect={() => setSelectedId(spot.id === selectedId ? null : spot.id)}
                  onPlan={() => spot.town && onPlanDrive(origin, spot.town)}
                />
              ))}
            </ol>
          )}
          <p className="mt-4 text-[10px] leading-4 text-muted">
            Places come from OpenStreetMap and are ranked by how well documented they are. Check opening hours and access before you go.
          </p>
        </div>
        <div className="order-1 h-[420px] min-h-0 lg:order-2 lg:h-auto">
          {result ? (
            <ExploreMap result={result} selectedId={selectedId} route={route} onSelect={setSelectedId} />
          ) : (
            <div className="grid size-full place-items-center bg-map/40 text-xs font-semibold text-ink/70">
              {load.status === "loading" ? "Loading the map…" : "Map unavailable"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
