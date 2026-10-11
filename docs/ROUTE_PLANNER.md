# Route planner

Roam plans a drive in two steps:

1. **First plan: code, no AI.** `POST /api/trips/plan` returns a complete plan in seconds:
   the route, stops along it that fit the traveler's interests and detour budget, lunch and an
   overnight stay for each day.
2. **Changes: Strands.** When the traveler asks for a change, the chat (`/api/ask/stream`) gets
   that plan as `current_itinerary`, and the agent calls the search functions below to revise it.

In the app, **Find stops along my drive** on the Trip setup screen calls it and shows the result on
the Drive screen (`frontend/src/roadtrip/api/tripPlanner.ts`): the real route line, the stops with
their detour times and sources, and a day-by-day list with lunch and overnight stays. If the plan
fails, the screen says why and offers a retry; the cached demo drive opens only when chosen, and
stays labeled "Cached demo".

Everything comes from OpenStreetMap (Overpass, Nominatim) or OSRM, and every place keeps its
source link. Times and visit lengths are planning estimates and are labeled as such.

## First plan

`POST /api/trips/plan` takes the Trip setup form (`DriveDraft` in `frontend/src/roadtrip/types.ts`):

```json
{
  "start": "Kansas City, MO",
  "destination": "Denver, CO",
  "interests": ["History", "Small towns"],
  "detour_budget_minutes": 60,
  "departure_date": "2026-10-17",
  "max_miles_per_day": 400,
  "mpg": 28,
  "gas_price": 3.25,
  "round_trip": false,
  "route_index": 0
}
```

Interests are the six chips on the setup screen: History, Small towns, Local food, Nature,
Architecture, Quirky stops. With none, it looks for history, nature and quirky stops.

It returns:

- `itinerary`: an `ItinerarySnapshot`, the same shape the chat edits. Send it to the chat as
  `current_itinerary` for changes.
- `route`: miles, hours, fuel, a summary sentence, the map line, and `route_count` (how many roads
  OSRM offered; ask again with another `route_index` for a different road).
- `stops`: the chosen stops in route order, each with `detour_minutes`, `gas_cost_usd`,
  `visit_minutes`, `interests`, `reason`, `less_explored` and its source link: the fields the
  Drive screen's stop cards show.
- `more_stops`: other good stops, for "swap this one".
- `notes`: anything the traveler should know, such as live place data being unavailable.

How it picks: one Overpass request per ~400 km of route finds small towns and villages within
15 km of the road, the places in them that match the interests, and well-documented landmarks
within 8 km. Towns score higher for more and better-documented matching places (OpenStreetMap
has no ratings). Places next to the start or end city are skipped. One OSRM table request measures
the real detour for the top 25. Then stops are chosen, best value for detour first, until the
detour budget is used, at least 25 miles apart and at most 3 per driving day. One more Overpass
request finds a local (non-chain) lunch spot and a hotel for each day.

If the place search is down, the plan still comes back with the driving and a note.

## Search functions for changes (to wire into Strands)

Plain Python in `backend/tools/route_search.py`. They are **not** wired into the agent yet.

| Traveler says | Function |
|---|---|
| "Take a different road" | `route_options(origin, destination)` lists the roads; `plan_drive` / `estimate_drive` take a `route_index` |
| "A different town on the way", "somewhere more historic" | `towns_along_route(origin, destination, interests, route_index, exclude, max_detour_minutes, limit)` |
| "Something else to do in Hays" | `find_attractions(near, interests, exclude, radius_m, limit)` |
| "Somewhere else to eat in Hays" | `find_restaurants(near, keyword, exclude, radius_m, limit)` |

Notes for wiring them up:

- **Pass `exclude` from the current plan** (stop names or source links), in code rather than
  trusting the model, so "another restaurant" can't return the current one.
- **Record results as evidence** like `evidence.recording_tools` does for `find_places`: each
  result has `name`, `lat`, `lng`, `source_urls` (and `website_url`, `address`), so
  `evidence.add_place(result)` works. Otherwise `validation.py` strips the new stops' pins as unverified.
- Wrap them like `tools/__init__.py` does: return plain dicts and never raise (`PlacesUnavailable`
  becomes `{"status": "unavailable", ...}`).

The same searches are also plain endpoints, for the UI to offer swaps without the AI:
`GET /api/trips/routes`, `/api/trips/towns`, `/api/trips/attractions`, `/api/trips/restaurants`.

## Tests

`backend/tests/test_route_search.py` runs everything on a small fake Kansas City → Denver world
(no network). It also checks that a first plan passes the chat's accuracy check unchanged, so the
first edit does not strip pins, links or route lines.

The public Overpass and OSRM servers can be slow. Results are cached in memory per backend
process, so a repeat of the same route is instant.
