# HackMidwest2026
Hackathon for Hack Midwest 2026

The current road-trip UI is connected to live Strands/Bedrock planning, measured one-way routes and fuel estimates, and approved revisions. See [the road-trip integration guide](docs/ROADTRIP_STRANDS.md) for the current interface, four change actions, API additions, and limits. The [latency change report](docs/ROADTRIP_LATENCY.md) explains the direct tool workflow, measured results, and what remains unchanged. Older planner sections below describe the reusable modules from the previous UI.

## Design

The Roam travel planner UI comes from this Figma Make file: [Travel Planner App](https://www.figma.com/make/Re9k0P2Oh80luv2pWkopZd/Travel-Planner-App?p=f&t=Ir5mVq0ECUq0FqlP-0). The feature components live in `frontend/src/features/`, with design tokens in `frontend/src/index.css`.

## Team coordination

The [Strands implementation guide](docs/STRANDS.md) explains the orchestrator, specialist agents, live Agent X-ray, and interrupt/approval flow.

The [AWS setup guide](docs/AWS_SETUP.md) explains credential configuration, actual Bedrock checks, and account/quota errors.

See [TEAM_PLAN.md](TEAM_PLAN.md) for task ownership, folder boundaries, API contracts, and integration order. Claim a lane before coding so teammates can work without overlapping.

## Quickstart for teammates

You only need Git and Docker Desktop (or Docker Engine with Compose v2). Make sure Docker is running first.

```sh
git clone https://github.com/kayden-gurung/HackMidwest2026.git
cd HackMidwest2026
cp backend/.env.example backend/.env   # fill in the AWS keys the team shares with you
docker compose up --build              # builds both base images, then starts them
```

When it finishes, open http://localhost:5173 and start a journey or send a trip request. Roam returns a live Strands/Bedrock reply; follow-ups include that journey’s conversation so you can revise your plan. The New journey form and Settings preferences reach the agent. The agent updates the Plan, Map and Budget panels alongside its chat reply; follow-up requests revise the current plan. Edit code in `frontend/` or `backend/` on your machine and it reloads inside the containers. Next time, `git pull` then `docker compose up` is enough; add `--build -V` if someone changed dependencies. Details are below.

## Local dev with Docker

Everyone runs the same two images, so nobody needs Python or Node installed locally. Only Docker Desktop (or Docker Engine with Compose v2) is required.

| Service  | Image                          | Stack                              | URL                     |
|----------|--------------------------------|------------------------------------|-------------------------|
| frontend | `hackmidwest2026-frontend:dev` | Node 24, Vite, React, TypeScript   | http://localhost:5173   |
| backend  | `hackmidwest2026-backend:dev`  | Python 3.12, FastAPI, Strands      | http://localhost:8000   |

### First run

```sh
cp backend/.env.example backend/.env   # add your AWS keys for Strands/Bedrock
docker compose up --build
```

Open http://localhost:5173. Vite proxies `/api` requests to the backend. You can check server health at http://localhost:8000/api/health; a successful chat reply also verifies model access.

### Day to day

- `docker compose up` starts everything. Code in `backend/` and `frontend/` is mounted in, so edits hot-reload in both.
- After changing `backend/requirements.txt` or `frontend/package.json`, rebuild and refresh the frontend's `node_modules` volume: `docker compose up --build -V`.
- Add a frontend package: `docker compose run --rm frontend npm install <pkg>` (updates `package.json` and `package-lock.json` on your machine), then `docker compose up --build -V`.
- Add a backend package: add it to `backend/requirements.txt`, then `docker compose up --build`.
- Shell into a container: `docker compose exec backend bash` or `docker compose exec frontend bash`.
- Stop: `docker compose down`.

- Type-check / build the frontend: `docker compose exec frontend npm run typecheck` or `npm run build`.
- Regression checks: `docker compose exec -T backend python -m pytest -q` and `docker compose exec -T frontend npm test` (no AWS requests).

### Secrets

`backend/.env` is gitignored and loaded only if it exists. Never commit it; share keys out of band.

## Project structure

```
frontend/src/
  main.tsx, App.tsx       entry point and app shell (rarely edited)
  pages/                  screens; they only lay out feature components
  features/<feature>/     one folder per feature: components, hooks, api, types
  components/ui/          generic shared UI (Icon, Action, BrandMark, loading/error/empty states)
  hooks/useAsync.ts       loading / success / error state for any async call
  lib/                    apiClient (fetch wrapper), format helpers, mock helpers
  config/env.ts           reads VITE_* env vars
backend/
  main.py                 creates the FastAPI app and includes routers
  routers/<feature>.py    one router per feature
```

Features today: `trips` (sidebar list, header), `chat` (conversation and composer), `itinerary` (Plan / Map / Budget panel), `profile` (travel style and user card). See [ARCHITECTURE.md](ARCHITECTURE.md) for how they fit together, the data contracts, and who owns what.

### Where to add things

- **A new feature**: copy the shape of an existing one (`features/profile` is the smallest) into `features/<name>/`, export its public pieces from `features/<name>/index.ts`, and place its component in a page.
- **A new page**: add `pages/<Name>Page.tsx`. There is no router yet; add one in `App.tsx` when you need a second page.
- **A new endpoint**: add `backend/routers/<feature>.py` with an `APIRouter(prefix="/api")`, include it in `backend/main.py`, then call it from that feature's `api/*Service.ts`.
- **A shared UI component**: only if two or more features need it. Put it in `components/ui/` and keep it generic (no feature data).

## Backend connectivity and mock data

The frontend uses live Strands chat by default. Set `VITE_USE_MOCKS=true` for the offline design demo with sample conversations and itineraries. Journeys, itineraries, profile edits, settings, and conversation history stay in browser memory in both modes (page reload clears them). Each feature owns its service; proposed HTTP endpoints are not called until implemented.

```sh
cp frontend/.env.example frontend/.env   # then edit
docker compose restart frontend          # Vite only reads .env on start
```

| Variable            | Default                  | Meaning |
|---------------------|--------------------------|---------|
| `VITE_USE_MOCKS`    | `false`                  | `true` enables the offline design demo |
| `VITE_API_BASE_URL` | empty (same origin)      | Prefix for API calls; leave empty to use the Vite proxy |
| `BACKEND_URL`       | `http://backend:8000`    | Where the Vite proxy sends `/api` (use `http://localhost:8000` outside Docker) |

Chat calls `/api/ask` with prompt, successful conversation history, preferences, planning mode, and the latest structured itinerary for that journey. The Strands `update_itinerary` tool returns a validated full plan with the reply, and the panels update automatically. Plan days, map markers and budget totals share the same items. Costs are USD planning estimates; unavailable prices are excluded from totals and labeled accordingly. Road-trip stops use explicit one-traveler planning allowances when no price is listed: $25 per meal, $20 per activity, and $150 per room/night. These amounts are included in budget/approval totals and labeled on each stop; they are not menu, admission, or booking quotes. Explicit OSM free-entry tags or unambiguous USD entry fees take precedence for activities; conditional/hourly/foreign-currency fees use an allowance. Listed local opening schedules come from the same verified place record and appear on stop cards and map popups. Missing schedules are labeled "Hours not listed"; schedules are not live open/closed status. Coordinates come from place lookups; stops without coordinates remain listed. The last good plan stays visible while a request is pending or fails. The offline demo retains its sample plans.

Live chat uses `/api/ask/stream`. Road-trip requests use one Strands agent with direct place, route and budget tools; older API requests without `road_trip` retain the Places, Transport and Budget specialists. The Agent X-ray displays actual SDK hook events and tool durations for the agents that run. Revisions to an existing plan pause through a Strands interrupt before the itinerary tool runs. Review the proposed stop changes and cost estimates, then choose **Approve re-plan** or **Keep current plan**. The browser resumes the same agent through `/api/ask/{run_id}/resume`; the existing panels remain in place until an approved run finishes successfully. Hands-on mode also asks for approval of the first plan. Pending reviews expire after 15 minutes and are kept in the backend process, so run a single API worker for this demo.

| Feature   | Data today | Backend endpoint |
|-----------|------------|------------------|
| chat: send message | live Strands/Bedrock | `POST /api/ask` **implemented** (needs AWS keys in `backend/.env`) |
| chat: conversation history | browser memory | `GET /api/trips/{id}/messages` proposed |
| trips | browser memory | `GET /api/trips`, `GET /api/trips/{id}` proposed |
| itinerary | live agent updates, stored per journey in browser memory | `POST /api/ask` returns optional `itinerary`; standalone GET proposed |
| profile | browser memory | `GET /api/me` proposed |
| health | real | `GET /api/health` **implemented** |

"Proposed" means the frontend expects that shape (see each feature's `types.ts`) but nobody has built it; agree on it as a team before implementing.
