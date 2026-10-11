# Architecture

Roam is a React + Vite + Tailwind frontend and a FastAPI backend, run together with Docker Compose. This page explains how the code is split up so several people can build features at once without stepping on each other.

## How a screen gets its data

```
PlannerPage (pages/)            lays out feature components, no logic
  └─ ChatPanel (features/chat)   renders UI, calls a hook
       └─ useChat (hooks/)       holds state, loading / error status
            └─ chatService (api/)  mock or http, same interface
                 └─ lib/apiClient  fetch + error handling  →  /api/*  →  Vite proxy  →  FastAPI router
```

Components never call `fetch` directly. They call a feature hook, the hook calls the feature's service, and the service either returns mock data or calls the backend through `lib/apiClient.ts`. Swapping mock for real only touches the service file.

## Module boundaries

| Layer | Folder | Rules |
|-------|--------|-------|
| App shell | `App.tsx`, `main.tsx`, `index.css` | Rarely changed. Theme colors and fonts live in `index.css` `@theme`. |
| Pages | `pages/` | Compose feature components. No data fetching, no business logic. |
| Features | `features/<name>/` | Everything for one feature. Other code imports only from `features/<name>/index.ts`. Features don't import each other. |
| Shared UI | `components/ui/` | Generic, data-free pieces (`Icon`, `Action`, `BrandMark`, `LoadingState`, `ErrorState`, `EmptyState`). |
| Shared logic | `hooks/`, `lib/`, `config/` | `useAsync`, `apiClient`, `format`, `mock`, `env`. No feature knowledge. |

Inside a feature:

```
features/chat/
  index.ts           public interface: what pages and other code may import
  types.ts           data contracts (request / response shapes)
  api/chatService.ts interface + mock + http implementation, and which one is active
  api/mockData.ts    the mock content (clearly marked)
  hooks/useChat.ts   state and async status for the components
  components/        presentational pieces
```

If two features need the same data, the page passes it down as props (or you lift state into the page). Don't import one feature from another.

## Features and their contracts

| Feature | UI | Service methods | Endpoint | Status |
|---------|----|-----------------|----------|--------|
| `trips` | Sidebar trip list (select, search, "New journey"), header | `listTrips()`, `getTrip(id)`, `createTrip()`, `renameTrip(id, title)` | `GET /api/trips`, `GET /api/trips/{id}` | **local** (browser memory), endpoints proposed |
| `chat` | Conversation, composer, suggestion chips | `getConversation(tripId)` | `GET /api/trips/{id}/messages` | **local** (browser memory), endpoint proposed |
| | | `sendMessage(tripId, prompt)` | `POST /api/ask` `{prompt}` → `{reply}` | **implemented** |
| `itinerary` | Plan / Map / Budget panel: expandable days, interactive map with a marker per item, every item listed under its budget category | `getItinerary(tripId)` | `GET /api/trips/{id}/itinerary` | **implemented via chat**; standalone GET proposed |
| `journey` | New journey form: prompt, vibe, budget, dates, starting point, adults and kids | none (sent as the first chat message) | `POST /api/ask` via `chat` | **implemented**, structured endpoint proposed |
| `profile` | Travel style card, user card | `getProfile()` | `GET /api/me` | proposed |
| `settings` | Settings screen | none (kept in `settingsStore`, browser memory) | sent as `preferences` on `POST /api/ask` | **implemented** |
| (places) | none yet | none yet | `GET /api/places/search`, `GET /api/places/locate`, `GET /api/places/drive` | **implemented** |
| (health) | none | none | `GET /api/health` → `{ok}` | **implemented** |

The exact JSON shapes are the TypeScript interfaces in each feature's `types.ts`. Proposed endpoints are only what the current UI needs to render; nothing about storage, auth, or AI behavior has been decided. When the backend implements one, match its Pydantic models to that `types.ts` (or update both together in one PR).

Journeys and their conversations are saved locally for now: `features/trips/api/tripsService.ts` and `features/chat/api/conversationStore.ts` keep them in browser memory, in both mock and real mode. They survive switching between journeys and reset on page reload. `PlannerPage` owns which journey is open and passes its id to the chat and itinerary features. A new journey is titled from the traveler's first message. With mocks on, the list starts with the Figma sample trips; with mocks off it opens the Puglia example by default (`VITE_SHOW_EXAMPLE=false` starts with an empty journey). The example has seeded chat and itinerary data; new journeys start empty and use live Strands. A trip with no itinerary shows an empty Plan panel, not an error. The request-local Strands `update_itinerary` tool publishes full plan snapshots through chat. `itineraryStore.ts` holds each journey’s current snapshot and `useItinerary` subscribes to updates. Switching journeys preserves plans; page reload clears them alongside chat. Demo mode retains its sample plans. Standalone itinerary endpoints remain proposed.

The New journey form (`features/journey`) collects a `JourneyRequest` (see `features/journey/types.ts`): an optional whole-dollar budget (`budgetUsd: null` means no limit), a calendar date range (`dates: null` means flexible), a free-text starting point (`origin`), and separate `adults` (at least 1) and `children` counts, capped at 10 travelers in total to match TEAM_PLAN.md. "Find my trip" turns it into the first chat message with `describeJourney()`; it is not sent as structured JSON yet. When `POST /api/trips/plan` is wired up, map `adults + children` to `travelers` and `dates` to `start_date` / `days`, or extend that contract.

The itinerary panel is driven by one list, `Itinerary.items` (see `features/itinerary/types.ts`). Each item has a date, a category, an estimated cost (null if unknown) and an optional location and website. Day summaries, per-category budget totals and map markers are all derived from that list in `features/itinerary/lib/itinerary.ts`, so the backend sends `startDate`, `endDate`, `items` and `budget.plannedUsd`, plus an optional summary and assumptions. A null budget means no limit set; null costs are marked TBD and excluded from totals. An item needs `location.lat` and `location.lng` to get a map marker; without them it is still listed, with a Google Maps search link. `features/itinerary/api/fromPlanResponse.ts` converts the `POST /api/trips/plan` response from TEAM_PLAN.md into this shape; it is not called yet, and it proposes four extra activity fields (`category`, `lat`, `lng`, `website_url`). The map uses Leaflet with OpenStreetMap tiles, which needs internet but no API key.

`POST /api/ask` uses the configured Strands/Bedrock agent from `backend/agent.py`. The request includes the last 20 successful exchanges from only the active journey, traveler preferences, a planning-mode override, and `current_itinerary` without the browser journey ID. The `update_itinerary` tool is bound to a fresh `ItineraryUpdates` instance per request: it validates dates, unique stop IDs, categories, costs and coordinates with Pydantic. It then runs the accuracy check in `backend/validation.py`: the place tools are wrapped per request (`backend/evidence.py`) so their results are recorded, and any source link, website or map pin the tools did not return is removed. Food and stay stops not found in map data, removed details, flight-cost caveats and over-budget totals are added to `assumptions`, flight times are dropped, and the same notes go back to the model as `accuracy_notes` so it can correct itself. Chat instructions live in `backend/prompts/travel.py` (travel-only scope, no invented flights, ratings or prices; temperature 0.3, override with `MODEL_TEMPERATURE`). Run `docker compose exec backend python -m evals.accuracy_check` after prompt changes. The response carries optional `itinerary` only after the agent completes successfully. A full snapshot replaces the previous plan atomically; a reply without one leaves the plan unchanged. SSE emits an itinerary event after success, before done. Failed requests retain the previous plan. There is no server-global itinerary state or new database. AWS access failures return sanitized errors; chat offers Retry without duplicating the failed message. `/api/ask/stream` preserves the SSE contract. Live chat is the default; `VITE_USE_MOCKS=true` enables the offline design demo.

## Real place data

`backend/tools/places.py` looks up real places on OpenStreetMap: free, no API key. `geocode(place)` turns a name into coordinates (Nominatim) and `search_places(near, category, keyword, radius_m, limit)` finds named restaurants, stays or things to do around it (Overpass). Results carry coordinates, address, website, opening hours and a source link, using the field names the itinerary panel reads (`category`, `lat`, `lng`, `website_url`, `source_urls`). OpenStreetMap has no prices, ratings or availability, so those must never be presented as looked up.

- **Road trips:** `backend/tools/driving.py` has `estimate_drive(origin, destination, round_trip)`: real road distance and driving time from the public OSRM server, plus a fuel cost estimate for one car. The fuel figure rests on two assumptions (27 mpg, $3.40 per gallon; override with `ROAM_CAR_MPG` and `ROAM_GAS_USD_PER_GALLON` in `backend/.env`) that are returned with it and must be shown. There is no flight price data, so the agent can only compare a real driving cost against its own estimate of flight prices. Driving costs go in the itinerary under the `Driving` category, which the Budget tab shows in place of `Flights` on a road trip.
- **Car mode:** a "Car" switch in the trip header (`features/trips/api/travelModeStore.ts`, per journey, browser memory) with a miles-per-day picker. Every `/api/ask` request sends `car_mode` and `max_drive_miles_per_day`. The backend adds a car-mode instruction to the system prompt, makes `plan_drive` split each drive by the daily limit, and `validation.py` removes every flight from the plan the panels receive, including stops the model filed under another category but titled as air travel ("Fly to Denver", "MCI → DEN"). Turning the switch on also takes flights off the current plan immediately.
- **Map pins:** a stop gets a pin only from a lookup of that place. The model often called `locate` for the town and reused those coordinates for every stop it didn't look up, so the pins and Google Maps links all landed on the town center. `validation.py` now removes a pin that several different stops share without a `find_places` result behind it, drops a "location" that is just the town name, and gives name-only stops the town as address context. `pins.py` then looks each unpinned stop up by name in the trip's town (Nominatim, at most 15 per plan; `ROAM_MAX_PIN_LOOKUPS` in `backend/.env` changes it) and pins it only when the match is inside the town area and isn't the town center itself. Flights are pinned at their airport (the one the model named, else the town's main airport, looked up once per plan). Named landmarks and districts are looked up with `locate`; its OpenStreetMap link counts as a real source. Nominatim's place type (`GeoPoint.kind`) separates towns from landmarks, so a stand-in town pin is caught without flagging a real museum. The frontend's `googleMapsUrl()` searches by name + address, else by the exact coordinates, never by a bare name when a pin is known.
- **For the agent:** `from tools import get_travel_tools` then `Agent(tools=get_travel_tools())`. The tools return a dict with `status` (`ok`, `no_results`, `unavailable` or `error`) and never raise.
- **Without the agent:** `GET /api/places/search?near=Polignano a Mare, Italy&category=Food&keyword=seafood`, `GET /api/places/locate?q=Bari Airport` and `GET /api/places/drive?origin=Kansas City, MO&destination=Denver, CO`. Try them at http://localhost:8000/docs.
- **Limits:** Nominatim allows one request per second, so lookups are spaced out and cached in memory until the backend restarts. Both services are public and can be slow or busy; failures come back as 503 with a readable message.
- **Tests:** `docker compose exec backend python -m pytest` (offline, the map services are stubbed).

## Traveler preferences

The Settings screen keeps its choices in `features/settings/api/settingsStore.ts`. `PlannerPage` reads them with `useTravelPreferences()` and passes them to the chat, which sends them as `preferences` on every `POST /api/ask` (shape: `Preferences` in `backend/schemas.py`). `routers/ask.py` adds them to the travel system prompt. The header shows the planning style chosen in Settings. Chat sends that style with traveler preferences on every request.

## Async states

Every feature hook returns `status: "loading" | "success" | "error"` (via `hooks/useAsync.ts`), plus `reload()`. Components render the shared `LoadingState`, `ErrorState` (with Retry) and `EmptyState`. Mock services resolve on the next tick, so loading states flash only briefly; the mock chat reply waits 600 ms so you can see the "thinking" state.

## Ownership

Shared files are where merge conflicts happen, so each has one owner who reviews changes to it.

| Area | Files | Suggested owner |
|------|-------|-----------------|
| Chat + AI | `features/chat/`, `backend/routers/ask.py` | Dev 1 (AI / prompt work) |
| Itinerary | `features/itinerary/`, future `backend/routers/itinerary.py` | Dev 2 |
| Trips + profile | `features/trips/`, `features/profile/`, future `backend/routers/trips.py` | Dev 3 |
| Platform | `App.tsx`, `pages/`, `components/ui/`, `lib/`, `hooks/`, `config/`, `index.css`, `vite.config.ts`, `backend/main.py`, Docker files, README | Dev 4 (team lead) |

Anyone can change a shared file, but keep the change small and tag its owner on the PR.

## Git workflow

1. `main` is always runnable. Never push to it directly.
2. Branch per task: `feature/chat-history`, `fix/budget-rounding`.
3. Keep PRs small (one feature slice, ideally under ~300 lines) and open them early as drafts.
4. Pull `main` into your branch at least every couple of hours: `git pull origin main`.
5. One teammate reviews and runs `docker compose up` before merging. Squash-merge.
6. Don't reformat or move files you aren't otherwise changing.
