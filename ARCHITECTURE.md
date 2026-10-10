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
| `trips` | Sidebar trip list, header | `listTrips()`, `getTrip(id)` | `GET /api/trips`, `GET /api/trips/{id}` | proposed |
| `chat` | Conversation, composer, suggestion chips | `getConversation(tripId)` | `GET /api/trips/{id}/messages` | proposed |
| | | `sendMessage(tripId, prompt)` | `POST /api/ask` `{prompt}` → `{reply}` | **implemented** |
| `itinerary` | Plan / Map / Budget panel | `getItinerary(tripId)` | `GET /api/trips/{id}/itinerary` | proposed |
| `profile` | Travel style card, user card | `getProfile()` | `GET /api/me` | proposed |
| (health) | none | none | `GET /api/health` → `{ok}` | **implemented** |

The exact JSON shapes are the TypeScript interfaces in each feature's `types.ts`. Proposed endpoints are only what the current UI needs to render; nothing about storage, auth, or AI behavior has been decided. When the backend implements one, match its Pydantic models to that `types.ts` (or update both together in one PR).

`POST /api/ask` ignores the trip today: it sends only the prompt to a Strands `Agent()` (Amazon Bedrock), so it needs AWS keys in `backend/.env`. Without keys it returns 500 and the chat shows "Roam couldn't reply".

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
