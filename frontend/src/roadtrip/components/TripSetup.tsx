import { useState } from "react"
import type { DriveDraft, FlyDraft, TravelMode } from "../types"
import { Action, Icon, ModeSwitch } from "./ui"

function TextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </div>
      <div
        role="textbox"
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => onChange(event.currentTarget.textContent ?? "")}
        className="min-h-11 rounded-md border border-line bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-school"
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[10px] text-muted">{hint}</div>}
    </div>
  )
}

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
          className={`rounded-full border px-3 py-2 text-xs font-semibold ${
            selected.includes(value)
              ? "border-school bg-mint text-school"
              : "border-line bg-white text-muted"
          }`}
        >
          {value}
        </Action>
      ))}
    </div>
  )
}

export default function TripSetup({
  mode,
  onMode,
  fly,
  setFly,
  drive,
  setDrive,
  onSubmit,
}: {
  mode: TravelMode
  onMode: (mode: TravelMode) => void
  fly: FlyDraft
  setFly: (draft: FlyDraft) => void
  drive: DriveDraft
  setDrive: (draft: DriveDraft) => void
  onSubmit: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const toggleFly = (value: string) =>
    setFly({
      ...fly,
      interests: fly.interests.includes(value)
        ? fly.interests.filter((item) => item !== value)
        : [...fly.interests, value],
    })
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
            {mode === "fly"
              ? "Where do you want to land?"
              : "The drive is the trip."}
          </div>
          <div className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
            {mode === "fly"
              ? "Plan the destination, flights, budget, and days in between."
              : "Find places worth pulling over for, without turning a direct drive into an all-day detour."}
          </div>
        </div>

        <div className="mx-auto mt-7 max-w-md">
          <ModeSwitch mode={mode} onChange={onMode} />
        </div>

        <div className="mt-8 border border-line bg-canvas p-5 md:p-7">
          {mode === "fly" ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Departure city or airport"
                  value={fly.departure}
                  onChange={(departure) => setFly({ ...fly, departure })}
                />
                <TextField
                  label="Destination or an idea"
                  value={fly.destination}
                  onChange={(destination) => setFly({ ...fly, destination })}
                  hint="Try “warm coast with great food.”"
                />
                <TextField
                  label="Travel dates"
                  value={fly.dates}
                  onChange={(dates) => setFly({ ...fly, dates })}
                />
                <TextField
                  label="Total budget"
                  value={`$${fly.budget.toLocaleString()}`}
                  onChange={() => undefined}
                />
              </div>
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                  Travelers
                </div>
                <div className="flex w-fit items-center border border-line bg-white">
                  <Action
                    onClick={() =>
                      setFly({
                        ...fly,
                        travelers: Math.max(1, fly.travelers - 1),
                      })
                    }
                    className="px-4 py-3 text-lg"
                  >
                    −
                  </Action>
                  <div className="min-w-12 text-center text-sm font-bold">
                    {fly.travelers}
                  </div>
                  <Action
                    onClick={() =>
                      setFly({ ...fly, travelers: fly.travelers + 1 })
                    }
                    className="px-4 py-3 text-lg"
                  >
                    +
                  </Action>
                </div>
              </div>
              <div>
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
                  Interests
                </div>
                <Chips
                  values={[
                    "Local food",
                    "Beaches",
                    "History",
                    "Nature",
                    "Art",
                    "Nightlife",
                  ]}
                  selected={fly.interests}
                  onToggle={toggleFly}
                />
              </div>
              <div>
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
                  Travel pace
                </div>
                <Chips
                  values={["Unhurried", "Balanced", "Full days"]}
                  selected={[fly.pace]}
                  onToggle={(pace) => setFly({ ...fly, pace })}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Starting city"
                  value={drive.start}
                  onChange={(start) => setDrive({ ...drive, start })}
                />
                <TextField
                  label="Destination"
                  value={drive.destination}
                  onChange={(destination) =>
                    setDrive({ ...drive, destination })
                  }
                />
              </div>
              <div>
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted">
                  What should we look for?
                </div>
                <Chips
                  values={[
                    "History",
                    "Small towns",
                    "Local food",
                    "Nature",
                    "Architecture",
                    "Quirky stops",
                  ]}
                  selected={drive.interests}
                  onToggle={toggleDrive}
                />
              </div>
              <div>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted">
                      Extra driving-time budget
                    </div>
                    <div className="mt-1 text-[10px] text-muted">
                      Covers driving detours only—not time spent visiting.
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([15, 30, 60, 120] as const).map((minutes) => (
                    <Action
                      key={minutes}
                      onClick={() =>
                        setDrive({ ...drive, detourBudget: minutes })
                      }
                      className={`rounded-md border py-3 text-center text-xs font-bold ${
                        drive.detourBudget === minutes
                          ? "border-school bg-school text-white"
                          : "border-line bg-white text-muted"
                      }`}
                    >
                      {minutes} min
                    </Action>
                  ))}
                </div>
              </div>
              <TextField
                label="Departure date · optional"
                value={drive.departureDate}
                onChange={(departureDate) =>
                  setDrive({ ...drive, departureDate })
                }
              />
              <div className="border-t border-line pt-4">
                <Action
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center justify-between text-xs font-bold"
                >
                  Driving preferences{" "}
                  <Icon
                    name="chevron"
                    className={`size-4 transition-transform ${
                      expanded ? "rotate-90" : ""
                    }`}
                  />
                </Action>
                {expanded && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Max miles / day", `${drive.maxMilesPerDay} mi`],
                      ["Fuel economy", `${drive.mpg} mpg`],
                      [
                        "Fuel assumption",
                        `$${drive.gasPrice.toFixed(2)} / gal`,
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="border border-line bg-white p-3"
                      >
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted">
                          {label}
                        </div>
                        <div className="mt-2 text-sm font-bold">{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-7 border-t border-line pt-5">
            <Action
              onClick={onSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-school px-5 py-3.5 text-sm font-bold text-white"
            >
              <Icon
                name={mode === "fly" ? "plane" : "car"}
                className="size-4"
              />{" "}
              {mode === "fly" ? "Plan my trip" : "Find stops along my drive"}
            </Action>
            <div className="mt-3 text-center text-[10px] text-muted">
              {mode === "drive"
                ? "Find places worth pulling over for. Results use cached demo data."
                : "Flight prices and availability are sample data in this prototype."}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
