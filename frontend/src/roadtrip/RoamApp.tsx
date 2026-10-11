import { useRef, useState } from "react"
import { planTrip, type LiveDrive } from "./api/tripPlanner"
import AppShell from "./components/AppShell"
import Dashboard from "./components/Dashboard"
import DriveWorkspace from "./components/DriveWorkspace"
import TripSetup from "./components/TripSetup"
import { Action, Icon } from "./components/ui"
import type { AppScreen, DriveDraft } from "./types"

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

function LoadingState() {
  return (
    <div className="grid h-full min-h-[560px] place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="relative mx-auto grid size-20 place-items-center rounded-full border border-line bg-white">
          <Icon name="car" className="size-7 text-school" />
          <div className="absolute inset-[-6px] animate-spin rounded-full border-2 border-transparent border-t-school" />
        </div>
        <div className="mt-6 font-display text-3xl font-semibold">
          Looking along the route
        </div>
        <div className="mt-3 text-sm leading-6 text-muted">
          Searching OpenStreetMap for small towns and stops that fit your
          interests and detour budget. The first search of a route can take
          up to 30 seconds.
        </div>
        <div className="mx-auto mt-6 h-1.5 max-w-xs overflow-hidden bg-panel">
          <div className="h-full w-2/3 animate-pulse bg-school" />
        </div>
      </div>
    </div>
  )
}

function PlanErrorState({
  message,
  onRetry,
  onEdit,
  onDemo,
}: {
  message: string
  onRetry: () => void
  onEdit: () => void
  onDemo: () => void
}) {
  return (
    <div className="grid h-full min-h-[560px] place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-full border border-line bg-white">
          <Icon name="car" className="size-7 text-school" />
        </div>
        <div className="mt-6 font-display text-3xl font-semibold">
          Couldn’t plan this drive
        </div>
        <div className="mt-3 text-sm leading-6 text-muted">{message}</div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Action
            onClick={onRetry}
            className="rounded-md bg-school px-4 py-2 text-xs font-bold text-white"
          >
            Try again
          </Action>
          <Action
            onClick={onEdit}
            className="rounded-md border border-line bg-white px-4 py-2 text-xs font-bold"
          >
            Edit trip
          </Action>
        </div>
        <Action
          onClick={onDemo}
          className="mt-4 text-[10px] font-bold text-muted underline"
        >
          Show the cached demo drive instead (sample data)
        </Action>
      </div>
    </div>
  )
}

function ExploreScreen({ onPlan }: { onPlan: () => void }) {
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
              Browse discoveries along the road.
            </div>
          </div>
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
              "Historic main streets",
              "Architecture · Local food",
              "https://images.unsplash.com/photo-1629551383145-cf05865104f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=700",
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
          Defaults for your drives.
        </div>
        <div className="mt-7 divide-y divide-line border-y border-line bg-white px-5">
          {[
            ["Home city", "Kansas City, MO"],
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
  const [driveDraft, setDriveDraft] = useState(initialDrive)
  const [loading, setLoading] = useState(false)
  // The live plan from the route planner; null shows the cached demo drive.
  const [live, setLive] = useState<LiveDrive | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  // Only the latest request may update the screen, if the traveler submits twice.
  const request = useRef(0)

  const submit = async () => {
    const id = ++request.current
    const current = () => id === request.current
    setLoading(true)
    setPlanError(null)
    let fullDone = false
    let routeShown = false
    // The route alone comes back in seconds: show it while the stops are still being searched.
    planTrip(driveDraft, fetch, false)
      .then((routeOnly) => {
        if (!current() || fullDone) return
        routeShown = true
        setLive(routeOnly)
        setScreen("drive")
        setLoading(false)
      })
      .catch(() => {
        // The full request reports any problem.
      })
    try {
      const plan = await planTrip(driveDraft)
      fullDone = true
      if (!current()) return
      setLive(plan)
      setScreen("drive")
    } catch (error) {
      fullDone = true
      if (!current()) return
      const message = (error as Error).message
      if (routeShown) {
        // Keep the route on screen and say why the stops did not arrive.
        setLive((shown) =>
          shown ? { ...shown, pending: false, notes: [...shown.notes, `Couldn’t find stops: ${message}`] } : shown,
        )
      } else {
        setPlanError(message)
      }
    } finally {
      if (current()) setLoading(false)
    }
  }

  const openDemo = () => {
    setPlanError(null)
    setLive(null)
    setScreen("drive")
  }

  const navigate = (next: AppScreen) => {
    setPlanError(null)
    setScreen(next)
  }

  let content: React.ReactNode
  if (loading) content = <LoadingState />
  else if (planError)
    content = (
      <PlanErrorState
        message={planError}
        onRetry={submit}
        onEdit={() => navigate("setup")}
        onDemo={openDemo}
      />
    )
  else if (screen === "dashboard")
    content = (
      <Dashboard
        onNew={() => setScreen("setup")}
        onOpen={openDemo}
      />
    )
  else if (screen === "setup")
    content = (
      <TripSetup
        drive={driveDraft}
        setDrive={setDriveDraft}
        onSubmit={submit}
      />
    )
  else if (screen === "drive")
    content = (
      <DriveWorkspace
        // A new plan starts the workspace fresh (selected and added stops).
        key={live ? `${live.id}${live.pending ? "-pending" : ""}` : "demo"}
        draft={driveDraft}
        live={live}
        onEdit={() => setScreen("setup")}
      />
    )
  else if (screen === "explore")
    content = (
      <ExploreScreen
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
