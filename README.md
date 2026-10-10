# HackMidwest2026
Hackathon for Hack Midwest 2026

## Design

The Roam travel planner UI comes from this Figma Make file: [Travel Planner App](https://www.figma.com/make/Re9k0P2Oh80luv2pWkopZd/Travel-Planner-App?p=f&t=Ir5mVq0ECUq0FqlP-0). The exported code lives in `frontend/src/App.tsx`, with design tokens in `frontend/src/index.css`.

## Team coordination

The [Strands implementation guide](docs/STRANDS.md) explains the planning flow, team ownership, and optional Decider integration.

See [TEAM_PLAN.md](TEAM_PLAN.md) for task ownership, folder boundaries, API contracts, and integration order. Claim a lane before coding so teammates can work without overlapping.

## Quickstart for teammates

You only need Git and Docker Desktop (or Docker Engine with Compose v2). Make sure Docker is running first.

```sh
git clone https://github.com/kayden-gurung/HackMidwest2026.git
cd HackMidwest2026
cp backend/.env.example backend/.env   # fill in the AWS keys the team shares with you
docker compose up --build              # builds both base images, then starts them
```

When it finishes, open http://localhost:5173 to see the Roam planner, and http://localhost:5173/api/health should return `{"ok":true}` (that request goes through the frontend container to the backend, so it proves both are up). Edit code in `frontend/` or `backend/` on your machine and it reloads inside the containers. Next time, `git pull` then `docker compose up` is enough; add `--build -V` if someone changed dependencies. Details are below.

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

Open http://localhost:5173 for the app. Vite proxies every `/api/*` request to the backend, so http://localhost:5173/api/health returning `{"ok":true}` means both containers are talking.

### Day to day

- `docker compose up` starts everything. Code in `backend/` and `frontend/` is mounted in, so edits hot-reload in both.
- After changing `backend/requirements.txt` or `frontend/package.json`, rebuild and refresh the frontend's `node_modules` volume: `docker compose up --build -V`.
- Add a frontend package: `docker compose run --rm frontend npm install <pkg>` (updates `package.json` and `package-lock.json` on your machine), then `docker compose up --build -V`.
- Add a backend package: add it to `backend/requirements.txt`, then `docker compose up --build`.
- Shell into a container: `docker compose exec backend bash` or `docker compose exec frontend bash`.
- Stop: `docker compose down`.

- Type-check / build the frontend: `docker compose exec frontend npm run typecheck` or `npm run build`.

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

The frontend runs on mock data by default, so it works with no AWS keys and no backend endpoints. Each feature has a service (`features/<feature>/api/<feature>Service.ts`) with a mock and an http implementation behind the same interface.

```sh
cp frontend/.env.example frontend/.env   # then edit
docker compose restart frontend          # Vite only reads .env on start
```

| Variable            | Default                  | Meaning |
|---------------------|--------------------------|---------|
| `VITE_USE_MOCKS`    | `true`                   | `false` makes every feature call the backend |
| `VITE_API_BASE_URL` | empty (same origin)      | Prefix for API calls; leave empty to use the Vite proxy |
| `BACKEND_URL`       | `http://backend:8000`    | Where the Vite proxy sends `/api` (use `http://localhost:8000` outside Docker) |

To move just one feature to the real backend while others stay mocked, change the last line of that feature's service file, e.g. `export const chatService = httpChatService;`.

| Feature   | Data today | Backend endpoint |
|-----------|------------|------------------|
| chat: send message | mock | `POST /api/ask` **implemented** (needs AWS keys in `backend/.env`) |
| chat: conversation history | mock | `GET /api/trips/{id}/messages` proposed |
| trips | mock | `GET /api/trips`, `GET /api/trips/{id}` proposed |
| itinerary | mock | `GET /api/trips/{id}/itinerary` proposed |
| profile | mock | `GET /api/me` proposed |
| health | real | `GET /api/health` **implemented** |

"Proposed" means the frontend expects that shape (see each feature's `types.ts`) but nobody has built it; agree on it as a team before implementing.
