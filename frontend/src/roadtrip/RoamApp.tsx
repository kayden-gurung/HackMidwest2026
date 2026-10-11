import { useState } from "react"
import AppShell from "./components/AppShell"
import Dashboard from "./components/Dashboard"
import DriveDashboard, { type DriveSession } from "./components/DriveDashboard"
import DriveWorkspace from "./components/DriveWorkspace"
import ExploreTheme from "./components/ExploreTheme"
import TripSetup from "./components/TripSetup"
import { Action, Icon } from "./components/ui"
import type { AppScreen, DriveDraft } from "./types"
import { config } from "../config/env"
import { chatService } from "../features/chat/api/chatService"
import { travelModeStore } from "../features/trips/api/travelModeStore"
import { describeDrive, roadTripConstraints, roadTripStore } from "./api/roadTripStore"
import type { ExploreThemeId } from "./api/explore"

const initialDrive: DriveDraft = {
  start: "Kansas City, MO",
  destination: "St. Louis, MO",
  interests: ["History", "Small towns", "Local food", "Nature"],
  detourBudget: 60,
  departureDate: "Flexible",
  maxMilesPerDay: 450,
}

// The Explore themes. Each opens real places from /api/explore/{id} on a list and a map.
const exploreThemes: { id: ExploreThemeId; title: string; tags: string; image: string }[] = [
  {
    id: "river-towns",
    title: "River towns",
    tags: "Small towns · History",
    image:
      "https://images.unsplash.com/photo-1722101503175-942f45bc1c95?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=700",
  },
  {
    id: "trailheads",
    title: "Quiet trailheads",
    tags: "Nature · Scenic stops",
    image:
      "https://images.unsplash.com/photo-1563317596-9f46b0d0d5cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=700",
  },
  {
    id: "historic-main-streets",
    title: "Historic main streets",
    tags: "Architecture · Local food",
    image:
      "https://images.unsplash.com/photo-1629551383145-cf05865104f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=700",
  },
]

function ExploreScreen({ onOpen }: { onOpen: (theme: ExploreThemeId) => void }) {
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
              Pick a theme to see real places worth the stop, on a map, with driving distances.
            </div>
          </div>
        </div>
        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {exploreThemes.map(({ id, title, tags, image }) => (
            <Action
              key={id}
              onClick={() => onOpen(id)}
              label={`Explore ${title}`}
              className="group overflow-hidden border border-line bg-white transition-all duration-200 hover:-translate-y-1 hover:border-school/50 hover:shadow-lg"
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
                <div className="mt-3 flex items-center gap-1 text-xs font-bold text-school">
                  See places, map and distances
                  <Icon name="chevron" className="size-3.5 transition-transform group-hover:translate-x-1" />
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
            Open a drive to see live place lookups, route checks, and budget calculations in chat.
            Proposed revisions wait for your approval before replacing your plan.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>("dashboard")
  const [driveDraft, setDriveDraft] = useState(initialDrive)
  const [sessions, setSessions] = useState<DriveSession[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [exploring, setExploring] = useState<ExploreThemeId | null>(null)
  const active = sessions.find((session) => session.id === activeId)

  const submit = () => {
    try {
      const constraints = roadTripConstraints(driveDraft)
      const prompt = describeDrive(driveDraft)
      const id = crypto.randomUUID()
      roadTripStore.set(id, constraints)
      travelModeStore.set(id, { carMode: true, maxMilesPerDay: driveDraft.maxMilesPerDay })
      setSessions((previous) => [{ id, draft: { ...driveDraft, interests: [...driveDraft.interests] } }, ...previous])
      setActiveId(id)
      setFormError(undefined)
      setScreen("drive")
      if (!config.useMocks) chatService.sendMessage(id, prompt, { interests: driveDraft.interests, currency: "USD" }, "Co-pilot").catch(() => undefined)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check your trip preferences.")
    }
  }

  const newTrip = () => { setDriveDraft({ ...initialDrive, interests: [...initialDrive.interests] }); setFormError(undefined); setScreen("setup") }
  const navigate = (next: AppScreen) => {
    if (next === "explore") setExploring(null)
    if (next === "setup") newTrip()
    else setScreen(next === "drive" && !active ? "setup" : next)
  }

  let content: React.ReactNode
  if (screen === "dashboard")
    content = (
      config.useMocks ? <Dashboard onNew={newTrip} onOpen={() => setScreen(active ? "drive" : "setup")} />
        : <DriveDashboard sessions={sessions} onNew={newTrip} onOpen={(id) => { setActiveId(id); setScreen("drive") }} />
    )
  else if (screen === "setup")
    content = (
      <TripSetup
        drive={driveDraft}
        setDrive={setDriveDraft}
        onSubmit={submit}
        error={formError}
      />
    )
  else if (screen === "drive" && active)
    content = (
      <DriveWorkspace
        tripId={active.id}
        draft={active.draft}
        onEdit={() => { setDriveDraft({ ...active.draft }); setScreen("setup") }}
      />
    )
  else if (screen === "explore" && exploring)
    content = (
      <ExploreTheme
        key={exploring}
        theme={exploring}
        image={exploreThemes.find((theme) => theme.id === exploring)!.image}
        defaultOrigin={driveDraft.start}
        onBack={() => setExploring(null)}
        onPlanDrive={(start, destination) => {
          setDriveDraft({ ...initialDrive, interests: [...initialDrive.interests], start, destination })
          setFormError(undefined)
          setScreen("setup")
        }}
      />
    )
  else if (screen === "explore")
    content = <ExploreScreen onOpen={setExploring} />
  else content = <SettingsScreen />

  return (
    <AppShell screen={screen} onNavigate={navigate}>
      {content}
    </AppShell>
  )
}
