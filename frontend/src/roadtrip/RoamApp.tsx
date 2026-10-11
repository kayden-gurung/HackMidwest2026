import { useState } from "react"
import AppShell from "./components/AppShell"
import Dashboard from "./components/Dashboard"
import DriveWorkspace from "./components/DriveWorkspace"
import FlyWorkspace from "./components/FlyWorkspace"
import TripSetup from "./components/TripSetup"
import { Action, Icon, ModeSwitch } from "./components/ui"
import type { AppScreen, DriveDraft, FlyDraft, TravelMode } from "./types"

const initialFly: FlyDraft = {
  departure: "New York · JFK",
  destination: "Warm coast with great food",
  dates: "Jun 18–25",
  travelers: 2,
  budget: 3200,
  interests: ["Local food", "Beaches", "History"],
  pace: "Unhurried",
}

const initialDrive: DriveDraft = {
  start: "Kansas City, MO",
  destination: "St. Louis, MO",
  interests: ["History", "Small towns", "Local food", "Nature"],
  detourBudget: 60,
  departureDate: "Flexible",
  maxMilesPerDay: 450,
  mpg: 28,
  gasPrice: 3.25,
}

function LoadingState({ mode }: { mode: TravelMode }) {
  return (
    <div className="grid h-full min-h-[560px] place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="relative mx-auto grid size-20 place-items-center rounded-full border border-line bg-white">
          <Icon
            name={mode === "drive" ? "car" : "plane"}
            className="size-7 text-school"
          />
          <div className="absolute inset-[-6px] animate-spin rounded-full border-2 border-transparent border-t-school" />
        </div>
        <div className="mt-6 font-display text-3xl font-semibold">
          {mode === "drive" ? "Looking along the route" : "Building your trip"}
        </div>
        <div className="mt-3 text-sm leading-6 text-muted">
          {mode === "drive"
            ? "Comparing cached demo stops against your interests and extra driving-time budget."
            : "Comparing sample destinations, flight options, and itinerary ideas."}
        </div>
        <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden bg-panel">
          <div className="h-full w-2/3 animate-pulse bg-school" />
        </div>
      </div>
    </div>
  )
}

function ExploreScreen({
  mode,
  onMode,
  onPlan,
}: {
  mode: TravelMode
  onMode: (mode: TravelMode) => void
  onPlan: () => void
}) {
  return (
    <div className="h-full overflow-y-auto p-5 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-school">
              Roam discoveries
            </div>
            <div className="mt-2 font-display text-4xl font-semibold">
              Explore places worth the stop.
            </div>
            <div className="mt-2 text-sm text-muted">
              Browse destination ideas or discoveries along the road.
            </div>
          </div>
          <ModeSwitch mode={mode} onChange={onMode} compact />
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {[
            [
              "River towns",
              "Small towns · History",
              "https://images.unsplash.com/photo-1722101503175-942f45bc1c95?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=700",
            ],
            [
              "Quiet trailheads",
              "Nature · Scenic stops",
              "https://images.unsplash.com/photo-1563317596-9f46b0d0d5cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=700",
            ],
            [
              "Coasts with character",
              "Food · Architecture",
              "https://images.unsplash.com/photo-1770493967117-6ae3927c0d05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=700",
            ],
          ].map(([title, tags, image]) => (
            <Action
              key={title}
              onClick={onPlan}
              className="group overflow-hidden border border-line bg-white"
            >
              <img
                src={image}
                alt=""
                className="h-56 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="p-4">
                <div className="font-display text-xl font-semibold">
                  {title}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-school">
                  {tags}
                </div>
              </div>
            </Action>
          ))}
        </div>
        <div className="mt-8 border border-line bg-white p-5">
          <div className="flex items-start gap-3">
            <Icon name="camera" className="size-5 text-school" />
            <div>
              <div className="text-sm font-bold">Community discoveries</div>
              <div className="mt-1 max-w-2xl text-xs leading-5 text-muted">
                Photo discoveries are separate from planning recommendations.
                They do not verify opening hours, safety, or public access.
                Places marked “Less explored” only have fewer visits within this
                Roam demo.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsScreen() {
  return (
    <div className="h-full overflow-y-auto p-5 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="font-display text-4xl font-semibold">
          Planning preferences
        </div>
        <div className="mt-2 text-sm text-muted">
          Defaults used across Fly and Drive.
        </div>
        <div className="mt-7 divide-y divide-line border-y border-line bg-white px-5">
          {[
            ["Home city", "Kansas City, MO"],
            ["Home airport", "MCI"],
            ["Currency", "USD"],
            ["Planning style", "Co-pilot"],
            ["Distance units", "Miles"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-5">
              <div className="text-xs font-semibold">{label}</div>
              <div className="flex items-center gap-2 text-xs text-muted">
                {value}
                <Icon name="chevron" className="size-4" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 border border-line bg-panel p-5">
          <div className="text-xs font-bold">Agent X-ray</div>
          <div className="mt-2 text-xs leading-5 text-muted">
            Secondary prototype section showing which route, budget, and
            interest inputs shape recommendations. No personal data is published
            or shared.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("dashboard")
  const [mode, setMode] = useState<TravelMode>("drive")
  const [flyDraft, setFlyDraft] = useState(initialFly)
  const [driveDraft, setDriveDraft] = useState(initialDrive)
  const [loading, setLoading] = useState(false)

  const changeMode = (nextMode: TravelMode) => {
    setMode(nextMode)
    if (screen === "fly" || screen === "drive") setScreen("setup")
  }

  const submit = () => {
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      setScreen(mode)
    }, 850)
  }

  const navigate = (next: AppScreen) => {
    if (next === "fly" || next === "drive") setMode(next)
    setScreen(next)
  }

  let content: React.ReactNode
  if (loading) content = <LoadingState mode={mode} />
  else if (screen === "dashboard")
    content = (
      <Dashboard
        onNew={() => setScreen("setup")}
        onOpen={(tripMode) => {
          setMode(tripMode)
          setScreen(tripMode)
        }}
      />
    )
  else if (screen === "setup")
    content = (
      <TripSetup
        mode={mode}
        onMode={setMode}
        fly={flyDraft}
        setFly={setFlyDraft}
        drive={driveDraft}
        setDrive={setDriveDraft}
        onSubmit={submit}
      />
    )
  else if (screen === "drive")
    content = (
      <DriveWorkspace
        draft={driveDraft}
        onMode={changeMode}
        onEdit={() => setScreen("setup")}
      />
    )
  else if (screen === "fly")
    content = (
      <FlyWorkspace
        draft={flyDraft}
        onMode={changeMode}
        onEdit={() => setScreen("setup")}
      />
    )
  else if (screen === "explore")
    content = (
      <ExploreScreen
        mode={mode}
        onMode={setMode}
        onPlan={() => setScreen("setup")}
      />
    )
  else content = <SettingsScreen />

  return (
    <AppShell screen={screen} onNavigate={navigate}>
      {content}
    </AppShell>
  )
}
