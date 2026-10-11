# Road-trip latency experiment

Branch: `GPT-Astra-test`, based on `origin/main` at `b2f18fe` (including the Explore page). This branch name is a Git label; it does not select an application model. The default remains Bedrock Claude Sonnet 4.5, `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, unless `BEDROCK_MODEL_ID` is configured.

## Changed

| Area | Before | On this branch |
| --- | --- | --- |
| Road-trip orchestration | Coordinator plus model-driven Places, Transport and Budget delegations | One Strands agent calls Python tools directly |
| First-plan research | Repeated research/delegation passes | One bounded `research_stops` pass: at most two towns, Food/Activities together, at most four searches with three results each; repeats return the same verified pool |
| Plan generation | Model emits a full itinerary with map facts | `create_road_trip` accepts verified source URLs and optional dates/times; Python fills source facts, IDs, unknown costs and sufficient driving dates |
| Small revisions | Model rewrites every stop and repeats specialist opinions | `edit_stops` accepts removals, replacements and additions, retaining unrelated items and metadata; Python remeasures the complete route and budget |
| Publication | Another model response after the checked update | SDK hooks stop model calls and remaining tools after publication or denial; Python supplies the measured confirmation |
| Recovery | Model rewrites the full plan if it forgets to publish | A road-trip recovery prompt uses an already checked draft and asks only for `update_itinerary()` |
| Progress UI | Always displayed all specialist roles | Displays agents actually observed in SDK events, with labels for the three new actions |
| Measurement | One-off diagnostic scripts | `backend/evals/roadtrip_latency.py` measures SSE/hook timings and supports an isolated model experiment |

All requested stop edits belong in one atomic `edit_stops` call. A retry starts from the current itinerary and replaces the unpublished draft. Invalid edits clear a previous draft, so an older partial change cannot accidentally be published. Date changes still use the existing full-draft `check_budget` fallback.

## Unchanged

- AWS credentials, region, default model, temperature, token cap and dependency versions. Haiku was benchmarked in a separate process; it was not set as the running app's model.
- Existing OSM/OSRM place and routing providers, public-service retry behavior and request-local route cache. No new paid map service or API key.
- Full-route evidence validation, combined detour checks, daily mileage/time limits, measured one-way fuel and unknown-cost handling. Source-based actions feed the same validation pipeline.
- Native Strands consent interrupts, Approve/Keep-current behavior, frozen preview reuse, 15-minute expiry, per-journey isolation and stale-review protection. Existing-trip changes and Hands-on first plans still require approval.
- Request/response schemas, SSE endpoints, map, trip form, itinerary and budget rendering, Explore page and mock workspace. Frontend changes are progress labels and agent-role display.
- The specialist agents and older API behavior when `road_trip` is absent. This is a specific road-trip optimization, not a rewrite of every planner.
- Storage, authentication and deployment architecture. The demo still runs one backend worker with browser-memory journeys.

`docs/PIVOT_TEAM_PLAN.md` was already an untracked local file and is excluded from this change.

## Measured on October 11, 2026

Same initial request: Kansas City → St. Louis, flexible departure, History/Small towns/Local food/Nature, 60-minute total detour, 450 miles/day, 28 MPG and $3.25/gallon, no spending limit.

| Run | Wall time | Model calls | Model time | Result |
| --- | ---: | ---: | ---: | --- |
| Baseline specialist workflow, Sonnet 4.5 | 179.2 s | 21 | 128.3 s | Two verified stops; 56.9-minute detour |
| Direct bounded workflow, Sonnet 4.5 | 24.4 s | 2 | 7.9 s | Four verified stops; 54.2-minute detour |
| Direct bounded workflow, isolated Haiku 4.5 | 21.3 s | 3 | 6.2 s | Two verified stops; 34.8-minute detour |

The successful Sonnet sample was 86% shorter than the measured baseline. Its research tool still took 15.8 seconds; building/checking the route took 0.7 seconds. It selected Grindstone Nature Area and Sycamore in Columbia, plus Zydeco and Deutschheim State Historic Site in Hermann: 274.4 miles, 338.7 driving minutes and $31.85 fuel, with all four visit prices unknown.

The same existing-plan removal request took 36.2 seconds and eight model calls in the baseline. With the optimized workflow, isolated Haiku produced a real approval card in 7.3 seconds and three calls. Approval then published the identical preview in about 0.006 seconds with zero additional model calls. The unrelated Rocheport stop retained its exact ID, details and date. This comparison changes both workflow and model, so it does not isolate either one's contribution.

These are single samples, not a latency guarantee or a controlled statistical benchmark. Stop choices and public-service caches/response times differed. The Haiku tests used FastAPI TestClient in a separate process: wall time and SDK hook durations are measured, but that client buffers SSE, so no first-token or browser-delivery latency is claimed for those samples. Automated tests use a scripted model; the numbers above used real Bedrock inference and live map providers.

The live Sonnet follow-up test was blocked by Bedrock's **“Too many tokens per day, please wait before trying again”** quota error. That failed sample is excluded from performance results. Sonnet revision performance still needs a live repeat after quota access returns. A short retry cannot resolve the daily account allowance. Haiku remains an optional experiment because it needed recovery to invoke the approval tool in one trial; source accuracy, valid routes and native approval passed the successful live checks.

Faster planning trades exhaustive initial research for a small verified pool; not every interest is guaranteed a distinct stop. Subsequent restaurant, attraction, town and road-route actions remain available. Provider failures or combined-detour rejection can still make a request slower or unsuccessful.

## Reproduce

Run the normal server with the team's existing AWS configuration:

```sh
docker compose up -d
docker compose exec -T backend python evals/roadtrip_latency.py --output /tmp/roadtrip-timing.json
```

For a revision, pass a JSON `AskRequest` containing `current_itinerary` and the specific change:

```sh
docker compose exec -T backend python evals/roadtrip_latency.py --request /tmp/revision-request.json --output /tmp/revision-timing.json
```

That measures time to the approval card; it does not approve a proposed change. Benchmark files omit live run capabilities and interrupt IDs.

To try Haiku without altering `.env` or the running app:

```sh
docker compose exec -T backend python evals/roadtrip_latency.py --in-process --model-id us.anthropic.claude-haiku-4-5-20251001-v1:0 --output /tmp/haiku-timing.json
```

This makes real AWS requests under the configured account and needs model access and quota. `--model-id` is only accepted with `--in-process`.

## Validation and review

```sh
docker compose exec -T backend python -m pytest -q
docker compose exec -T frontend npm test
docker compose exec -T frontend npm run build
```

Source-action tests exercise the actual Strands loop with a scripted model: approved/declined removals, Hands-on first-plan consent, exact preview publication, no inference or remaining tool execution after publication, unknown-source and invalid-ID rejection, preservation of unrelated stops, driving-date calculation, combined-detour rejection, bounded/memoized research, outage handling and recovery without full-plan rewriting. Existing compatibility and frontend regressions are included in the full suites.

Verified on this branch: **175 backend tests plus 12 subtests, 28 frontend tests, and the frontend production build pass.** Vite still reports the existing bundle-size warning; this branch does not address code splitting.

For review, compare `GPT-Astra-test` against `main`, create a fresh trip, remove one stop, approve the preview, then try another change and decline it. Check the live X-ray, map, fuel/detour totals and the retained stops. Run an older request without `road_trip` to exercise the retained specialist path. Do not merge until the team has reviewed the branch.
