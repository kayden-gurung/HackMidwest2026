import { useEffect, useId, useState } from "react"
import type { KeyboardEvent, ReactNode } from "react"
import { suggestCities, isKnownCity } from "../data/cities"
import type { DriveDraft } from "../types"
import { Action, Icon } from "./ui"

const fieldClass =
  "min-h-11 w-full rounded-md border border-line bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-school"

function CityField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const suggestions = open ? suggestCities(value) : []
  const invalid = value.trim() !== "" && !isKnownCity(value)

  const choose = (city: string) => {
    onChange(city)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") return setOpen(false)
    if (!suggestions.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((active + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((active - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      choose(suggestions[active] ?? suggestions[0])
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id}>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
          {label}
        </div>
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Start typing a city"
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={fieldClass}
      />
      {suggestions.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white py-1 shadow-lg"
        >
          {suggestions.map((city, index) => (
            <li
              key={city}
              role="option"
              aria-selected={index === active}
              // mousedown fires before the input's blur closes the list
              onMouseDown={(event) => {
                event.preventDefault()
                choose(city)
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 text-sm font-semibold ${
                index === active ? "bg-mint text-school" : ""
              }`}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
      {invalid && !open && (
        <div className="mt-1.5 text-[10px] text-muted">
          Pick a city from the suggestions for the best results.
        </div>
      )}
    </div>
  )
}

/** Shared hover / press feel for every choice button on this screen. */
const choiceMotion =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm"

function Chips({
  values,
  selected,
  onToggle,
}: {
  values: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <Action
          key={value}
          onClick={() => onToggle(value)}
          className={`rounded-full border px-3 py-2 text-xs font-semibold ${choiceMotion} ${
            selected.includes(value)
              ? "border-school bg-mint text-school"
              : "border-line bg-white text-muted hover:border-school/60 hover:text-school"
          }`}
        >
          {value}
        </Action>
      ))}
    </div>
  )
}

function SectionLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted">{children}</div>
      {hint && <div className="mt-1 text-[10px] text-muted">{hint}</div>}
    </div>
  )
}

/** Today as YYYY-MM-DD in local time, the earliest date the picker allows. */
function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

/** Departure: either a date from the calendar picker, or flexible. No free typing. */
function DepartureChoice({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const flexible = value === "Flexible" || value === ""
  const option = (selected: boolean) =>
    `flex items-center justify-center gap-2 rounded-md border py-3 text-xs font-bold ${choiceMotion} ${
      selected ? "border-school bg-school text-white" : "border-line bg-white text-muted hover:border-school/60 hover:text-school"
    }`
  return (
    <div>
      <SectionLabel>Departure date · optional</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        <Action onClick={() => onChange(flexible ? today() : value)} className={option(!flexible)}>
          <Icon name="calendar" className="size-4" /> Pick a date
        </Action>
        <Action onClick={() => onChange("Flexible")} className={option(flexible)}>
          <Icon name="clock" className="size-4" /> I'm flexible
        </Action>
      </div>
      {!flexible && (
        <input
          type="date"
          aria-label="Departure date"
          min={today()}
          value={value}
          // Only the calendar sets the date: typing is blocked so the value is always a real date.
          onKeyDown={(event) => event.key !== "Tab" && event.preventDefault()}
          onClick={(event) => event.currentTarget.showPicker?.()}
          onChange={(event) => onChange(event.target.value || "Flexible")}
          className="mt-2 min-h-11 w-full cursor-pointer rounded-md border border-line bg-white px-3 py-3 text-sm font-semibold outline-none transition-colors hover:border-school/60 focus:border-school"
        />
      )}
    </div>
  )
}

type DriveEstimate = { miles: number; hours: number }

/** Real road miles and hours from the backend (OpenStreetMap + OSRM), refetched when the cities change. */
function useDriveEstimate(start: string, destination: string) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ok" | "error"; estimate?: DriveEstimate }>({ status: "idle" })
  useEffect(() => {
    if (!isKnownCity(start) || !isKnownCity(destination) || start === destination) {
      setState({ status: "idle" })
      return
    }
    const controller = new AbortController()
    setState({ status: "loading" })
    // A short pause so picking a city from the list doesn't fire a request per keystroke.
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ origin: start, destination, round_trip: "false" })
      fetch(`/api/places/drive?${query}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((body) => setState({ status: "ok", estimate: { miles: body.distance_miles, hours: body.drive_hours } }))
        .catch((error) => {
          if (error.name !== "AbortError") setState({ status: "error" })
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [start, destination])
  return state
}

function formatHours(hours: number): string {
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  return whole ? `${whole} h ${minutes} min` : `${minutes} min`
}

/** The direct drive between the two cities, right under them: real road miles and time. */
function DriveEstimatePanel({ drive }: { drive: DriveDraft }) {
  const route = useDriveEstimate(drive.start, drive.destination)
  const miles = route.estimate?.miles ?? 0
  const days = drive.maxMilesPerDay > 0 ? Math.max(1, Math.ceil(miles / drive.maxMilesPerDay)) : 1

  return (
    <div aria-live="polite">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[10px] text-muted">
        <span className="font-bold uppercase tracking-widest">Direct drive</span>
        <span>One way, before any detours.</span>
      </div>
      {route.status === "idle" && (
        <div className="text-xs text-muted">Pick a starting city and a destination to see the distance and driving time.</div>
      )}
      {route.status === "loading" && <div className="animate-pulse text-xs text-muted">Measuring the drive…</div>}
      {route.status === "error" && (
        <div className="text-xs text-muted">Couldn't measure this drive right now. You can still find stops.</div>
      )}
      {route.status === "ok" && (
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Distance", `${miles.toLocaleString()} mi`],
            ["Driving time", formatHours(route.estimate!.hours)],
          ].map(([label, value]) => (
            <div key={label} className="border border-line bg-white px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted">{label}</div>
              <div className="mt-1 text-sm font-bold">{value}</div>
            </div>
          ))}
        </div>
      )}
      {route.status === "ok" && days > 1 && (
        <div className="mt-2 text-[10px] text-muted">
          At {drive.maxMilesPerDay} miles a day, that's about {days} driving days each way.
        </div>
      )}
    </div>
  )
}

const DETOUR_SLIDER_MIN = 15
const DETOUR_SLIDER_MAX = 120
// Typing allows more than the slider covers, for travelers happy to wander.
const DETOUR_TYPED_MAX = 600

/** 45 -> "45 min", 90 -> "1 h 30 min", 120 -> "2 h" */
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Extra driving-time budget: a slider from 15 to 120 minutes, and a box below to type an exact number. */
function DetourBudget({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  const id = useId()
  // What's in the box: it can be empty while the traveler is typing, so it's kept apart from the number.
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  return (
    <div>
      <SectionLabel hint="Covers driving detours only—not time spent visiting.">Extra driving-time budget</SectionLabel>
      <div className="rounded-md border border-line bg-white p-4 transition-shadow duration-200 hover:shadow-md">
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold text-school">{formatMinutes(value)}</div>
          <div className="text-[10px] text-muted">of extra driving</div>
        </div>
        <input
          type="range"
          aria-label="Extra driving-time budget in minutes"
          min={DETOUR_SLIDER_MIN}
          max={DETOUR_SLIDER_MAX}
          step={5}
          // A typed value outside the slider's range parks the handle at the nearest end.
          value={Math.min(Math.max(value, DETOUR_SLIDER_MIN), DETOUR_SLIDER_MAX)}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-3 w-full cursor-pointer accent-school transition-opacity hover:opacity-90"
        />
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted">
          <span>{DETOUR_SLIDER_MIN} min</span>
          <span>{DETOUR_SLIDER_MAX} min</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-widest text-muted">
            Or type your own
          </label>
          <div className="flex w-36 items-center gap-2 rounded-md border border-line bg-white px-3 py-2 transition-colors focus-within:border-school hover:border-school/60">
            <input
              id={id}
              type="text"
              inputMode="numeric"
              value={text}
              placeholder="e.g. 45"
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 3)
                setText(digits)
                if (digits) onChange(Math.min(Number(digits), DETOUR_TYPED_MAX))
              }}
              // Left empty: go back to the current budget instead of zero.
              onBlur={() => setText(String(value))}
              className="w-full bg-transparent text-sm font-bold outline-none placeholder:font-semibold placeholder:text-muted"
            />
            <span className="shrink-0 text-xs font-semibold text-muted">min</span>
          </div>
          <span className="text-[10px] text-muted">Up to {DETOUR_TYPED_MAX} minutes.</span>
        </div>
      </div>
    </div>
  )
}

export default function TripSetup({
  drive,
  setDrive,
  onSubmit,
  error,
}: {
  drive: DriveDraft
  setDrive: (draft: DriveDraft) => void
  onSubmit: () => void
  error?: string
}) {
  const toggleDrive = (value: string) =>
    setDrive({
      ...drive,
      interests: drive.interests.includes(value)
        ? drive.interests.filter((item) => item !== value)
        : [...drive.interests, value],
    })

  return (
    <div className="h-full overflow-y-auto px-5 py-7 md:px-9">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-school">
            Start a new trip
          </div>
          <div className="mt-3 font-display text-4xl font-semibold">
            The drive is the trip.
          </div>
          <div className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
            Find places worth pulling over for, without turning a direct drive into an all-day detour.
          </div>
        </div>

        <div className="mt-8 border border-line bg-canvas p-5 md:p-7">
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <CityField
                  label="Starting city"
                  value={drive.start}
                  onChange={(start) => setDrive({ ...drive, start })}
                />
                <CityField
                  label="Destination"
                  value={drive.destination}
                  onChange={(destination) => setDrive({ ...drive, destination })}
                />
              </div>
              {/* Right under the two cities: how far the direct drive is and how long it takes. */}
              <DriveEstimatePanel drive={drive} />
            </div>
            <div>
              <SectionLabel>What should we look for?</SectionLabel>
              <Chips
                values={["History", "Small towns", "Local food", "Nature", "Architecture", "Quirky stops"]}
                selected={drive.interests}
                onToggle={toggleDrive}
              />
            </div>
            <DetourBudget
              value={drive.detourBudget}
              onChange={(detourBudget) => setDrive({ ...drive, detourBudget })}
            />
            <DepartureChoice
              value={drive.departureDate}
              onChange={(departureDate) => setDrive({ ...drive, departureDate })}
            />
          </div>
        </div>

        <div className="mt-6 pb-4">
          {error && (
            <div
              role="alert"
              className="mb-3 bg-peach px-3 py-2 text-xs font-semibold text-school"
            >
              {error}
            </div>
          )}
          <Action
            onClick={onSubmit}
            className="group flex w-full items-center justify-center gap-2 rounded-md bg-school px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-ink hover:shadow-lg active:translate-y-0 active:shadow-sm"
          >
            <Icon name="car" className="size-4 transition-transform duration-300 group-hover:translate-x-1" /> Find stops along my drive
          </Action>
          <div className="mt-3 text-center text-[10px] text-muted">
            Find places worth pulling over for. Results use cached demo data.
          </div>
        </div>
      </div>
    </div>
  )
}
