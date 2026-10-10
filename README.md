# HackMidwest2026
Hackathon for Hack Midwest 2026

## Design

The Roam travel planner UI comes from this Figma Make file: [Travel Planner App](https://www.figma.com/make/Re9k0P2Oh80luv2pWkopZd/Travel-Planner-App?p=f&t=Ir5mVq0ECUq0FqlP-0). The exported code lives in `frontend/src/App.tsx`, with design tokens in `frontend/src/index.css`.

## Quickstart for teammates

You only need Git and Docker Desktop (or Docker Engine with Compose v2). Make sure Docker is running first.

```sh
git clone https://github.com/kayden-gurung/HackMidwest2026.git
cd HackMidwest2026
cp backend/.env.example backend/.env   # fill in the AWS keys the team shares with you
docker compose up --build              # builds both base images, then starts them
```

When it finishes, open http://localhost:5173 and look for "backend ok". Edit code in `frontend/` or `backend/` on your machine and it reloads inside the containers. Next time, `git pull` then `docker compose up` is enough; add `--build -V` if someone changed dependencies. Details are below.

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

Open http://localhost:5173. The page calls `/api/health`, which Vite proxies to the backend, so "backend ok" means both containers are talking.

### Day to day

- `docker compose up` starts everything. Code in `backend/` and `frontend/` is mounted in, so edits hot-reload in both.
- After changing `backend/requirements.txt` or `frontend/package.json`, rebuild and refresh the frontend's `node_modules` volume: `docker compose up --build -V`.
- Add a frontend package: `docker compose run --rm frontend npm install <pkg>` (updates `package.json` and `package-lock.json` on your machine), then `docker compose up --build -V`.
- Add a backend package: add it to `backend/requirements.txt`, then `docker compose up --build`.
- Shell into a container: `docker compose exec backend bash` or `docker compose exec frontend bash`.
- Stop: `docker compose down`.

### Secrets

`backend/.env` is gitignored and loaded only if it exists. Never commit it; share keys out of band.
