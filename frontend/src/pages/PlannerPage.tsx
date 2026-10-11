import { useState } from "react";
import { Action, BrandMark, EmptyState, ErrorState, Icon, LoadingState, type IconName } from "../components/ui";
import { ChatPanel, chatService } from "../features/chat";
import { ExploreView } from "../features/explore";
import { TripPanel } from "../features/itinerary";
import { describeJourney, NewJourneyView, tripTypesStore, type JourneyRequest } from "../features/journey";
import { ProfilePanel } from "../features/profile";
import { SettingsView, useTravelPreferences } from "../features/settings";
import { MyTripsView, travelModeStore, TripHeader, TripNavigation, useTrips } from "../features/trips";

/** Which screen fills the main area. "trip" is the chat + itinerary planner for the open journey. */
type Screen = "trip" | "new" | "trips" | "explore" | "settings";

/** Screen links shown in the sidebar under "New journey". */
const screenLinks: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: "trips", label: "My trips", icon: "calendar" },
  { screen: "explore", label: "Explore", icon: "compass" },
];

/**
 * The Roam app shell: the sidebar plus whichever screen is open. It owns the state the screens
 * share (the open screen and the open journey); everything else lives in the features.
 */
export function PlannerPage() {
  const { trips, status, reload, nameDraftFromMessage, startTripFromMessage, renameTrip, deleteTrip } = useTrips();
  // The traveler's settings, handed to the chat so Roam plans with them.
  const preferences = useTravelPreferences();
  const [screen, setScreen] = useState<Screen>("trip");
  const [selectedTripId, setSelectedTripId] = useState<string>();
  // Prompt carried from an Explore idea into the New journey form.
  const [journeyPrompt, setJourneyPrompt] = useState("");
  // Until the traveler picks one, the newest journey is open.
  const activeTrip = trips.find((trip) => trip.id === selectedTripId) ?? trips[0];

  const openTrip = (tripId: string) => {
    setSelectedTripId(tripId);
    setScreen("trip");
  };

  const openNewJourney = (prompt = "") => {
    setJourneyPrompt(prompt);
    setScreen("new");
  };

  /** "Find my trip": create a journey named after the request, open it, and send the request to Roam as the first message. */
  const startJourney = (request: JourneyRequest) => {
    const message = describeJourney(request);
    startTripFromMessage(request.prompt || message, {
      startDate: request.dates?.start,
      endDate: request.dates?.end,
      travelers: request.adults + request.children,
      origin: request.origin.trim() || undefined,
    }).then((trip) => {
      openTrip(trip.id);
      // Remembered for the whole journey, so every later message keeps the chosen trip types.
      tripTypesStore.set(trip.id, request.vibes);
      // Plane or road from the form; the header toggle shows it and every message carries it.
      travelModeStore.set(trip.id, { carMode: request.travelBy === "road" });
      // Failures show up in the chat panel as its error state.
      chatService.sendMessage(trip.id, message, preferences).catch(() => undefined);
    }, () => undefined);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sidebar p-4 lg:flex lg:h-screen">
          <Action onClick={() => setScreen("trip")} className="flex items-center gap-2.5 px-2 py-3">
            <BrandMark />
            <div className="font-display text-xl font-semibold tracking-tight">Roam</div>
          </Action>
          <TripNavigation
            trips={trips}
            status={status}
            // Only highlight a journey while the planner is showing it.
            activeTripId={screen === "trip" ? activeTrip?.id : undefined}
            onSelect={openTrip}
            onNewTrip={() => openNewJourney()}
            onRetry={reload}
            onRename={(tripId, title) => renameTrip(tripId, title).catch(() => undefined)}
            // Deleting the open journey falls back to the newest remaining one (see activeTrip).
            onDelete={(tripId) => deleteTrip(tripId).catch(() => undefined)}
            links={
              <nav className="mt-5 space-y-1">
                {screenLinks.map((link) => (
                  <Action
                    key={link.screen}
                    onClick={() => setScreen(link.screen)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${screen === link.screen ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-surface/60 hover:text-ink"}`}
                  >
                    <Icon name={link.icon} className="size-4" /> {link.label}
                  </Action>
                ))}
              </nav>
            }
          />
          <div className="mt-3 shrink-0">
            <ProfilePanel onOpenSettings={() => setScreen("settings")} />
          </div>
        </aside>

        {screen === "new" && <NewJourneyView key={journeyPrompt} initialPrompt={journeyPrompt} onStart={startJourney} />}
        {screen === "trips" && <MyTripsView onOpenTrip={openTrip} onNewJourney={() => openNewJourney()} />}
        {screen === "explore" && <ExploreView onPlan={openNewJourney} />}
        {screen === "settings" && <SettingsView onClose={() => setScreen("trip")} />}

        {screen === "trip" && (
          <main className="flex min-w-0 flex-1 flex-col lg:h-screen">
            {activeTrip ? (
              <>
                <TripHeader tripId={activeTrip.id} title={activeTrip.title} leading={<BrandMark className="lg:hidden" />} onNewJourney={() => openNewJourney()} />
                <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_390px]">
                  {/* Keyed by trip so each journey gets its own composer and scroll position. */}
                  <ChatPanel key={activeTrip.id} tripId={activeTrip.id} preferences={preferences} onUserMessage={(text) => nameDraftFromMessage(activeTrip.id, text)} />
                  <TripPanel key={`panel-${activeTrip.id}`} tripId={activeTrip.id} />
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8">
                {status === "loading" && <LoadingState label="Loading your journeys…" />}
                {status === "error" && <ErrorState message="Couldn’t load your journeys." onRetry={reload} />}
                {status === "success" && <EmptyState message="No journeys yet. Start one with “New journey”." />}
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
