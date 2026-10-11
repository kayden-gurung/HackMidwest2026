# Route planner: the fast first plan

A new drive gets its **first plan in code, from live map data, with no AI**. Every change after
that goes through the Strands chat and its approval step (docs/ROADTRIP_STRANDS.md).

1. **Find stops along my drive** (Trip setup) calls `planFirstDrive`
   (`frontend/src/roadtrip/api/firstPlan.ts`), which asks `POST /api/trips/plan` twice at once:
   - the route alone (`include_places: false`), on screen in about 3 seconds;
   - the full plan: stops along the route that fit the interests and detour budget, lunch, and a
     bed for each night. About 18 seconds on a first search of a route, because Nominatim allows
     one request a second; a route planned before is instant (saved answers, see below).
2. The plan goes into the same itinerary store the chat uses, and the chat opens with a short
   message about it. The traveler's next request ("a different town", the four change buttons)
   goes to Strands with this plan as `current_itinerary`.
3. If the fast planner can't make a plan, the chat plans it instead (the previous behavior).

Every place comes from OpenStreetMap (Nominatim) and keeps its source link. Routes and detour times
come from OSRM. Times and visit lengths are planning estimates and are labeled as such.

## How it picks stops

- **Searching.** A few small Nominatim searches along the route: the words come from the interests
  (History → "museums", "monuments"; Nature → "viewpoints"; Quirky stops → "attractions"...), at
  most 3 words and 9 searches per route, each inside a box around one stretch of road. The start and
  end cities (first and last 30 km) are skipped.
- **Keeping.** Only places within 10 km of the road. Each place's town comes from its address;
  places outside any town must be well documented (Wikipedia/Wikidata, a website or heritage status).
- **Ranking.** Towns score higher for more and better-documented matching places (OpenStreetMap has
  no ratings), and small towns score higher when "Small towns" is chosen. One OSRM table request
  measures the real detour for the best 25.
- **Choosing.** Best value for detour first, until the detour budget is used: at least 25 miles
  apart, at most 3 a day and 4 in all (the chat's "two to four stops").
- **Meals and beds.** Lunch at a local (non-chain) place near the stop closest to midday, or halfway
  through the day's drive; a bed near each night's town and at the destination (ordinary hotels and
  motels before luxury ones).
- **The whole-route check.** The finished plan goes through the same check every Strands change gets
  (`roadtrip.RoadTripPlanner.validate`): the route through every stop, meal and bed must fit the
  detour budget. If it doesn't, extras are left out first (the destination's bed, then the halfway
  lunch, then lunch at a stop, then the weakest stop) and the traveler is told. The check also adds
  the measured mileage, fuel and driving legs the Drive screen shows.

If a lookup fails (a dropped connection, a timeout, or the service answering "slow down"), it is
tried once more after 3 seconds: the stop searches that failed, the meal and bed search, and the
whole-route check. Answers already received are kept. If the map services stay down, the plan still
comes back with the driving and a note, and a part-searched route says so.

## Search functions for changes

Plain Python in `backend/tools/route_search.py`, also served as `GET /api/trips/routes`, `/towns`,
`/attractions` and `/restaurants`. They are not Strands tools; the chat has its own (`find_places`,
`find_route_towns`, `plan_drive`). They could replace or back them up later.

| Traveler says | Function |
|---|---|
| "Take a different road" | `route_options(origin, destination)`; `estimate_drive` takes a `route_index` |
| "A different town on the way" | `towns_along_route(origin, destination, interests, route_index, exclude, max_detour_minutes, limit)` |
| "Something else to do in Hays" | `find_attractions(near, interests, exclude, radius_m, limit)` |
| "Somewhere else to eat in Hays" | `find_restaurants(near, keyword, exclude, radius_m, limit)` |

## Speed

- **Saved answers.** Every successful map answer is kept in `backend/.roam_cache/http/`
  (git-ignored), so a route planned once comes back in about a second, even after a restart and on
  bad wifi. Delete the folder to refresh the data.
- `docker compose logs backend | grep roam` shows how long each step took (`roam.planner`,
  `roam.route_search`) and why any lookup failed.

## Tests

`backend/tests/test_route_search.py` runs everything on a small fake Kansas City → Denver world (no
network), including the chat's own checks on a first plan, and leaving extras out over budget.
`frontend/tests/integration.test.ts` covers the request, the route-then-plan order, the opening
message and the fallback.
