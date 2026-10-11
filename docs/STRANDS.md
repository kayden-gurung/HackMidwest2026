# Strands implementation in Roam

Roam runs an orchestrator plus three specialist Strands agents on Amazon Bedrock. The specialists are typed tools the orchestrator can call. SDK hooks drive the live Agent X-ray panel, and a native Strands interrupt pauses itinerary revisions before they are applied.

## Agent team

| Agent | Tools | Responsibility |
| --- | --- | --- |
| Roam orchestrator | `research_places`, `plan_transport`, `review_trip_budget`, `check_budget`, `update_itinerary` | Delegate research, synthesize a complete plan, request consent and apply approved updates |
| Places | `find_places`, `locate`, `get_forecast` | Retrieve specific places, coordinates, live forecasts and source links |
| Transport | `plan_drive`, `locate` | Check driving feasibility, routes, day-by-day legs, times and fuel assumptions (Roam plans drives only) |
| Budget | `calculate_budget` | Review estimates for all travelers, unknown costs and budget overruns |

`backend/orchestration.py` wraps each specialist with an async `@tool` that invokes that agent. All agents receive the same current itinerary, dates, preferences, car constraints, and trip types. Their conversation state and lookup evidence belong to one request; they are never shared between travelers. A sequential tool executor prevents concurrent invocations of the same specialist. Each run allows at most 24 model calls across the team.

The model chooses which specialist tools to call. The orchestrator instructions require place research for concrete plans, relevant transport checks, and a budget review before an itinerary update. The Places specialist handles the existing live forecast tool. Both budget tools use the shared deterministic arithmetic; the orchestrator's `check_budget` verifies the exact draft before it can request consent or publish. Greetings and clarifying questions do not need specialist calls. The Transport specialist also holds the Plane mode tools (`find_airports`, `flight_links`); every lookup tool must belong to a specialist, and a test fails if one is left out. Lookup evidence collected by specialists reaches the existing Python itinerary validator. Only the orchestrator can update the panels.

Official pattern: [Agents as Tools](https://strandsagents.com/docs/user-guide/sdk/multi-agent/agents-as-tools/).

## Live Agent X-ray

`XrayHooks` in `backend/agent_runs.py` subscribes to `BeforeInvocationEvent`, `AfterInvocationEvent`, `BeforeModelCallEvent`, `AfterModelCallEvent`, `BeforeToolCallEvent` and `AfterToolCallEvent` on every agent. Events identify the agent, tool, call ID, timestamp, result status and tool duration. Resume does not duplicate a tool-start event.

The agent task and SSE consumer run independently. Hooks inside a specialist reach the browser while the orchestrator is still awaiting that specialist. These are actual execution events; the UI does not infer activity from generated text or display private model reasoning. Mock mode is explicitly labeled and has no fabricated execution trace.

Official API: [Hooks](https://strandsagents.com/docs/user-guide/sdk/agents/hooks/).

## Act, with consent

1. The traveler requests a revision, such as “Check tomorrow's forecast. Replace the outdoor afternoon if it will rain, and keep dinner.” The Places specialist checks live weather within the tool's coverage and reports unavailable or out-of-range forecasts honestly.
2. Roam gathers relevant evidence and calls `check_budget` with the complete draft. That is the only time a model writes the plan out: the Budget specialist's `calculate_budget` and the orchestrator's `update_itinerary` are both called with no arguments and read that checked draft in Python.
3. `ConsentHook` validates the candidate before the tool executes and builds a preview: added, removed and changed stops, unchanged stop count, complete proposed plan, totals, unknown costs, assumptions and validation notes.
4. `BeforeToolCallEvent.interrupt("roam.itinerary-consent", reason=preview)` pauses the actual Strands loop. The pending tool has not committed an itinerary.
5. The browser displays the review card and disables new messages for that journey. Other journeys remain independent.
6. Approve sends `{ "approved": true }` with the opaque SDK interrupt IDs. FastAPI invokes the same agent instance with `interruptResponse` content blocks. The pending hook receives the response and the tool commits the exact validated snapshot shown in the preview.
7. Keep current plan sends a negative response. The hook sets `cancel_tool`; later update attempts in that turn are also cancelled. No proposed itinerary is published.
8. Plan, Map and Budget update only after an approved invocation completes successfully. A failure or truncated connection preserves the last good plan. Changes to car settings or the current plan during review invalidate approval in the browser.

Existing-plan changes require consent in every planning mode. Hands-on mode also requires consent for the first plan. Co-pilot and Surprise me can create the first plan directly. An unchanged snapshot or a repeated already accepted snapshot does not need another review.

Official API: [Interrupts and resume](https://strandsagents.com/docs/user-guide/sdk/interrupts/). The minimum SDK version is pinned to the tested `strands-agents>=1.59.0,<2` range.

## HTTP contract

`POST /api/ask/stream` takes the existing `AskRequest`. It emits JSON SSE payloads:

| Payload | Meaning |
| --- | --- |
| `run: { id }` | Opaque request/run identity |
| `xray: { id, agent, kind, timestamp, ... }` | SDK lifecycle/tool event |
| `text` / `tool` | Draft chat text and current top-level tool |
| `approval: { run_id, interrupts, expires_in_seconds }` | Paused run and validated preview(s) |
| `reply` / `itinerary` | Final response and optional committed plan |
| `error` / `status` | Sanitized failure |
| `done: true` | Stream ended, including a pause for review |

A paused stream emits approval and done, with no final reply or committed itinerary. SSE comments keep an active connection alive every 15 seconds. Proxy buffering is disabled through response headers.

`POST /api/ask/{run_id}/resume` takes:

```json
{
  "interrupt_ids": ["opaque ID returned by Strands"],
  "approved": true
}
```

It returns the same SSE event contract and can pause again if a different update needs review. Never parse or construct SDK interrupt IDs. Incorrect IDs, duplicate or in-flight approvals return 409; expired reviews return 410; unavailable runs return 404. `POST /api/ask` remains available as a JSON endpoint and returns an optional `approval` field when interrupted. It uses the same resume endpoint.

## Runtime and limits

Pending runs retain the original agent, request, evidence and validated candidates in memory. Opaque, unpredictable run IDs act as browser-held capabilities. Reviews expire after 15 minutes; the registry holds at most 100 runs. Completed and failed runs are removed, and expired entries are pruned when the registry is accessed. Reloading the browser loses its review, and restarting the backend loses paused agents.

Use one API worker for the hackathon demo. A production deployment needs authentication plus shared session persistence and routing for interrupt/resume across workers. Existing AWS setup, retry limits, safe error messages, source validation and cost estimates still apply. There are no booking or payment tools.

## Verification and demo

```sh
docker compose exec -T backend python -m pytest -q
docker compose exec -T frontend npm test
docker compose exec -T frontend npm run build
```

`backend/tests/test_orchestration.py` uses the actual Strands agents, tools, hooks, executor and interrupt loop with a scripted model. It checks nested specialist execution, live events while a specialist is still working, exact validated preview reuse, approval/rejection, the sync API, nudge-triggered interrupts, incorrect responses, duplicate claims and expiry. No AWS calls are needed for these checks. Frontend regressions cover journey isolation, approval requests, unchanged panels until consent, duplicate clicks, stale context, expiry and truncated streams.

For a live demo, create a short trip and expand Agent X-ray. Ask for an indoor re-plan while preserving dinner. Review the stop changes and estimated budget; show the original plan alongside the proposal. Tap Approve re-plan to resume. Request another change and choose Keep current plan to demonstrate cancellation. Live model/tool results depend on configured Bedrock access and external map services; mock conversations are explicitly examples.

Decider 2B remains an optional, separate experiment. It is not needed for this orchestrator, hook, or interrupt functionality, and no Decider routing or performance claims are made by this implementation. The original team planning contract remains in [TEAM_PLAN.md](../TEAM_PLAN.md).
