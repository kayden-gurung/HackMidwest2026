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

How it picks: one Overpass request covers the route with small boxes (about 60 km each, widened
by 10 km), which Overpass answers quickly from its spatial index; searching "around the route line"
took 30+ seconds on the public server. The backend then measures each result's distance to the road
and keeps small towns and villages within 10 km, and places within 5 km of the road or 3 km of one of
those towns. The search fetches every interest's places at once, so the same saved answer serves
any choice of interests. Places outside towns must be well documented (Wikipedia/Wikidata, a website
or heritage status). Towns score higher for more and better-documented matching places
(OpenStreetMap has no ratings). Places next to the start or end city are skipped. One OSRM table
request measures the real detour for the top 25. Then stops are chosen, best value for detour first,
until the detour budget is used, at least 25 miles apart and at most 3 per driving day.

At the same time, a second Overpass request finds a bed for each night (ordinary hotels and motels
before luxury ones) and a fallback lunch halfway through each day. Lunch near a stop comes from the
local (non-chain) places the route search already found.

If the place search is down, the plan still comes back with the driving and a note. Searches give up
after about 25 seconds in total, across the main and backup Overpass servers.

## Speed

- **Saved answers.** Every successful map answer (Nominatim, OSRM, Overpass) is saved in
  `backend/.roam_cache/http/` (git-ignored). A route planned once comes back in about a second, even
  after a restart and on bad wifi. Delete the folder to refresh the data.
- **Demo routes are planned at startup** in the background (`backend/warm.py`): Kansas City to
  Denver, St. Louis, Omaha and Wichita by default. Change them with `ROAM_WARM_ROUTES` in
  `backend/.env`. To warm by hand and watch: `docker compose exec backend python warm.py`.
- **The route shows first.** The Drive screen asks for the route alone (`include_places: false`,
  a few seconds) and the full plan at the same time, and shows the route until the stops arrive.
- `docker compose logs backend` shows how long each step took (`roam.planner`, `roam.route_search`,
  `roam.warm`).

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
