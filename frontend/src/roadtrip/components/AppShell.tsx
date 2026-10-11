import type { AppScreen } from "../types"
import { Action, Icon } from "./ui"

export default function AppShell({
  screen,
  onNavigate,
  children,
}: {
  screen: AppScreen
  onNavigate: (screen: AppScreen) => void
  children: React.ReactNode
}) {
  const nav = [
    { screen: "dashboard" as const, icon: "map" as const, label: "Dashboard" },
    { screen: "setup" as const, icon: "plus" as const, label: "New trip" },
    { screen: "drive" as const, icon: "car" as const, label: "Drive" },
    { screen: "fly" as const, icon: "plane" as const, label: "Fly" },
    { screen: "explore" as const, icon: "compass" as const, label: "Explore" },
  ]
  return (
    <div className="min-h-screen bg-canvas text-ink lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-screen lg:h-full">
        <aside className="hidden w-[86px] shrink-0 flex-col bg-school text-white lg:flex">
          <Action
            onClick={() => onNavigate("dashboard")}
            className="grid h-[74px] place-items-center border-b border-white/15"
          >
            <div className="grid size-10 place-items-center rounded-full border border-white/50">
              <Icon name="compass" className="size-6" />
            </div>
          </Action>
          <div className="flex-1 py-2">
            {nav.map((item) => (
              <Action
                key={item.screen}
                onClick={() => onNavigate(item.screen)}
                className={`flex h-[72px] flex-col items-center justify-center gap-1.5 text-[10px] font-semibold ${
                  screen === item.screen
                    ? "bg-white text-school"
                    : "text-white/80 hover:bg-black/10 hover:text-white"
                }`}
              >
                <Icon name={item.icon} className="size-5" /> {item.label}
              </Action>
            ))}
          </div>
          <Action
            onClick={() => onNavigate("settings")}
            className={`flex h-[76px] flex-col items-center justify-center gap-1.5 border-t border-white/15 text-[10px] font-semibold ${
              screen === "settings" ? "bg-white text-school" : "text-white/80"
            }`}
          >
            <div className="grid size-8 place-items-center rounded-full bg-white text-[9px] font-bold text-school">
              AM
            </div>{" "}
            Settings
          </Action>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
            <Action
              onClick={() => onNavigate("dashboard")}
              className="flex items-center gap-2"
            >
              <div className="grid size-8 place-items-center rounded-full bg-school text-white">
                <Icon name="compass" className="size-4" />
              </div>
              <div className="text-sm font-bold uppercase tracking-[0.18em]">
                Roam
              </div>
            </Action>
            <Action
              onClick={() => onNavigate("setup")}
              className="flex items-center gap-1 rounded-md bg-school px-3 py-2 text-[10px] font-bold text-white"
            >
              <Icon name="plus" className="size-3.5" /> New trip
            </Action>
          </header>
          <div className="min-h-0 flex-1 pb-16 lg:pb-0">{children}</div>
          <div className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-4 border-t border-line bg-white lg:hidden">
            {nav.slice(0, 4).map((item) => (
              <Action
                key={item.screen}
                onClick={() => onNavigate(item.screen)}
                className={`flex flex-col items-center justify-center gap-1 text-[9px] font-bold ${
                  screen === item.screen ? "text-school" : "text-muted"
                }`}
              >
                <Icon name={item.icon} className="size-4" />
                {item.label}
              </Action>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
