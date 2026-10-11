# Roam team plan

Goal: enter trip preferences, generate an itinerary, and revise it when plans change. Finish this complete flow before adding more platforms.

See [docs/STRANDS.md](docs/STRANDS.md) for agent responsibilities, real data tools, and an optional Decider experiment. B owns the agent and decision routing; C owns data integrations; D owns schemas and hard constraint validation. Build the core Strands flow before adding Decider.

This is a proposed implementation contract, not a description of features already built. The repository includes a health endpoint, a generic Strands `/api/ask` endpoint, and the Roam frontend exported from Figma. Verify existing UI behavior before replacing it.

## Claim your lane before coding

Replace `Unclaimed` with your name and update status as you go. Each lane has one owner. Ask that owner before changing their files.

| Lane | Owner | Status | Owns | First deliverable |
| --- | --- | --- | --- | --- |
| A: UI | Codex (destination drive cards) | Destination drive cards implemented | `frontend/src/components/`, `frontend/src/index.css` | Trip form, itinerary cards, loading and error states |
| B: Agent | Unclaimed | Not started | `backend/agents/`, `backend/prompts/` | Strands planner returning the agreed itinerary schema |
| C: Data tools | Codex (destination drive cards) | Destination photo lookup implemented | `backend/tools/` | One real place or weather integration with source URLs |
| D: Integration | Codex (Josh's integration request) | Implemented on `feat/strands-roadtrip-integration`; pending review | API routes, schemas, frontend API client, app entry points, Docker and dependencies | Live road-trip form, scoped Strands tools, measured route validation, and approved revisions; see `docs/ROADTRIP_STRANDS.md` |

With three teammates, combine B and D. With two, combine A+D and B+C. With five, the fifth person owns manual demo checks and the demo script in `docs/DEMO.md`. Owners can help elsewhere after coordinating; avoid two people editing one file at once.

## Proposed folder boundaries

```text
backend/
  main.py                 # D: app setup and router registration
  schemas.py              # D: request/response models, agreed with B
  routes/trips.py         # D: HTTP handling
  agents/planner.py       # B: agent construction and planning/revision
  prompts/travel.py       # B: travel instructions
  tools/places.py         # C: real place lookup
  tools/weather.py        # C: forecast lookup, if time permits
frontend/src/
  App.tsx                 # D: wiring components and request state
  api/trips.ts            # D: fetch functions
  types/trip.ts           # D: matching TypeScript types
  components/TripForm.tsx  # A: collects preferences
  components/Itinerary.tsx # A: displays returned plan
  components/ReviseForm.tsx# A: collects requested change
  index.css               # A: styling
docs/
  DEMO.md                 # D, or fifth teammate: demo and manual checks
```

These paths are targets to create, not existing modules. D should create the shared schemas and component prop types first. Dependency files and `compose.yaml` also belong to D to reduce conflicts.

## Shared contract — agree before splitting up

### Plan a trip

`POST /api/trips/plan`

Request:

```json
{
  "destination": "Kansas City",
  "start_date": "2026-10-10",
  "days": 2,
  "budget_usd": 300,
  "travelers": 1,
  "interests": ["food", "museums"]
}
```

Response:

```json
{
  "summary": "Two days of food and museums",
  "activities": [
    {
      "day": 1,
      "time": "10:00",
      "title": "Museum visit",
      "description": "Example activity for UI development",
      "location": "Kansas City",
      "estimated_cost_usd": 25,
      "source_urls": []
    }
  ],
  "estimated_total_usd": 25,
  "assumptions": ["Example fixture; not live travel information"],
  "changes": []
}
```

Budget means total trip budget for all travelers, in USD. Activity costs are totals for all travelers. `days` is 1–7, `travelers` is 1–10, budget is positive, and destination is required. Dates use `YYYY-MM-DD`; day numbers start at 1. Times are destination local time. The total is the sum of listed activity costs; any excluded lodging, transport or other costs must be explicit in assumptions. Source URLs must come from tool results. Estimates and unverified information must be labeled.

### Revise a trip

`POST /api/trips/revise`

Request has three fields: `trip_request` (original plan request), `itinerary` (current response), and `change` (for example, "It will rain on day 1; replace outdoor activities"). Response uses the same itinerary shape, with `changes` containing plain-language explanations. Preserve unaffected activities where practical. No database or trip ID is needed for the first version.

### Internal interfaces

- B provides `plan_trip(request: TripRequest) -> Itinerary` and `revise_trip(request: ReviseRequest) -> Itinerary` in `backend/agents/planner.py`.
- C provides Strands tools through `get_travel_tools()` in `backend/tools/__init__.py`. Each tool has typed arguments, a docstring, a bounded network timeout, and clear unavailable-data results.
- D supplies the Pydantic models and matching frontend types. D calls synchronous agent functions from synchronous FastAPI routes, or explicitly offloads them if using async routes.
- A's form calls `onSubmit(request)`; the itinerary component receives `itinerary`; the revision form calls `onSubmit(change)`. D supplies loading and error props. A does not call AWS or fetch APIs directly.
- Keep the existing `/api/health` and `/api/ask` endpoints working while integrating.
- Validation failures use FastAPI's normal 422 response. Upstream planning failures return an appropriate HTTP error with a safe `detail` message. The UI must handle non-2xx responses.

If a field or function must change, tell all affected owners and update this document before merging.

## Work in this order

1. Everyone claims a lane. D defines schemas/types and a clearly labeled example response.
2. A builds against that example; B builds the agent; C builds the first real tool. These can happen in parallel.
3. D connects the pieces and confirms one real Bedrock request works with the team's credentials and chosen model.
4. Add revision, then run the complete demo together.
5. Only after that, consider streaming, saved trips, memory, additional tools or sponsor integrations.

## Branches and handoffs

Create one branch per lane from an up-to-date `main`: `feat/trip-ui`, `feat/travel-agent`, `feat/travel-tools`, or `feat/trip-api`.

```sh
git switch main
git pull --ff-only
git switch -c feat/trip-ui
```

Commit only your lane's files. Open a small PR with what works, how to run it, and any missing dependencies. D coordinates merge order: schemas/types, tools, agent, UI and wiring. Pull updated main into your branch as needed. Do not copy another teammate's unmerged implementation into your branch; coordinate the dependency or merge it first.

Use a quick team check-in when a deliverable lands or a blocker appears:

```text
Owner / lane:
Working now:
Next handoff:
Blocked by:
Files or contract fields changing:
```

## Definition of done

- A user can enter preferences and see an itinerary from the backend.
- At least one real data tool is called successfully and its sources appear in the result.
- A requested disruption produces an updated itinerary with explanations.
- Loading, bad input, missing data and AWS errors show understandable UI messages.
- AWS credentials stay in the backend environment and out of Git and frontend code.
- The team can demonstrate the full flow in about three minutes. Include a clearly labeled example fallback for outages; do not present it as live data.

Stretch features: booking, payments, account login, multi-agent orchestration, persistent memory, and extra cloud platforms. Pick these only when the core flow is ready.
