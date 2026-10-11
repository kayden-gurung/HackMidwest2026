"""Route search and the fast first plan, on a small fake Kansas City -> Denver world. No network.

The fake Nominatim answers bounded searches ("museums", "hotels"... inside a viewbox) from the
places below, the way the real one does.
"""

import math
from datetime import date

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from evidence import evidence_from_snapshot
from routers import trips as trips_router
from tools import driving, places, route_search
from trip_planner import TripRequest, build_first_plan, choose_stops
from validation import validate_snapshot

KC = (39.0997, -94.5786)
DENVER = (39.7392, -104.9903)


def on_route(fraction: float, north_km: float = 0.0) -> tuple[float, float]:
    """A point `fraction` of the way from Kansas City to Denver, moved `north_km` off the road."""
    return (KC[0] + fraction * (DENVER[0] - KC[0]) + north_km / 111.32,
            KC[1] + fraction * (DENVER[1] - KC[1]))


def line(points: int = 300, bend_km: float = 0.0) -> list[list[float]]:
    """The route as GeoJSON [lng, lat]. `bend_km` bows it north, for an alternative road."""
    coords = []
    for i in range(points):
        f = i / (points - 1)
        lat, lng = on_route(f, bend_km * math.sin(math.pi * f))
        coords.append([lng, lat])
    return coords


def place(osm_id, spot, category, kind, name, town=None, town_kind="town", **extratags):
    address = {town_kind: town} if town else {}
    return {"osm_type": "node", "osm_id": osm_id, "lat": str(spot[0]), "lon": str(spot[1]), "name": name,
            "category": category, "type": kind, "extratags": extratags, "address": address}


HAYS = on_route(0.55, 5)
PLACES = [
    # A town with a fort and a museum: the best stop.
    place(11, (HAYS[0] + 0.004, HAYS[1] + 0.004), "historic", "fort", "Fort Hays", "Hays", wikidata="Q1",
          website="https://example.org/forthays"),
    place(12, (HAYS[0] - 0.004, HAYS[1]), "tourism", "museum", "Ellis County Museum", "Hays"),
    # Beside Kansas City: part of the start, not a stop on the way.
    place(21, on_route(0.02, 3.3), "historic", "monument", "Quivira Monument", "Lake Quivira", "village"),
    # A village with a historic monument.
    place(51, on_route(0.30, 2.2), "historic", "monument", "Wilson Czech Monument", "Wilson", "village"),
    # A documented viewpoint outside any town.
    place(4, on_route(0.85, 3), "tourism", "viewpoint", "High Plains Overlook", wikidata="Q4"),
    # Far from the road (25 km): the search box may return it, the distance check drops it.
    place(61, on_route(0.40, 25.2), "tourism", "museum", "Faraway Museum", "Faraway", wikidata="Q6"),
    # An undocumented roadside sight outside any town: not a stop.
    place(71, on_route(0.65, 1), "tourism", "attraction", "Big Painted Rock"),
]
# Which kinds each search word finds, as Nominatim's special phrases do.
PHRASES = {
    "museums": [("tourism", "museum")],
    "monuments": [("historic", "monument"), ("historic", "fort")],
    "attractions": [("tourism", "attraction")],
    "viewpoints": [("tourism", "viewpoint")],
    "parks": [], "castles": [],
}
NAMES = {"kansas city, mo": KC, "denver, co": DENVER}


def in_box(spot, viewbox):
    west, north, east, south = map(float, viewbox.split(","))
    return south <= spot[0] <= north and west <= spot[1] <= east


@pytest.fixture
def world(monkeypatch):
    state = {"nominatim_up": True, "search_up": True, "table_up": True, "searches": [],
             "routes": [line(), line(bend_km=40)]}

    def handler(request: httpx.Request) -> httpx.Response:
        host, path, params = request.url.host, request.url.path, request.url.params
        if "nominatim" in host and path.endswith("/reverse"):
            return httpx.Response(200, json={"address": {"town": "Somewhere", "state": "Kansas"}})
        if "nominatim" in host:
            if not state["nominatim_up"]:
                return httpx.Response(429)
            if params.get("bounded"):
                if not state["search_up"]:
                    return httpx.Response(429)
                phrase, box = params["q"], params["viewbox"]
                state["searches"].append(phrase)
                west, north, east, south = map(float, box.split(","))
                middle = ((north + south) / 2, (west + east) / 2)
                n = len(state["searches"])
                if phrase in ("hotels", "motels"):
                    return httpx.Response(200, json=[
                        # About 9 km off the road, so a night there costs measurable extra driving.
                        place(1000 + n, (middle[0] + 0.08, middle[1]), "tourism", "motel", "Prairie Motel",
                              website="https://example.org/motel"),
                        # Better documented, but not what a road trip wants.
                        place(4000 + n, (middle[0] + 0.075, middle[1]), "tourism", "hotel", "The Ritz-Carlton",
                              stars="5", wikidata="Q9", website="https://example.org/ritz")])
                if phrase == "restaurants":
                    return httpx.Response(200, json=[
                        place(2000 + n, (middle[0] + 0.001, middle[1]), "amenity", "restaurant", "Big Chain",
                              brand="Big Chain", website="https://example.org/chain"),
                        place(3000 + n, (middle[0] + 0.002, middle[1]), "amenity", "cafe", "Main Street Diner")])
                kinds = PHRASES.get(phrase, [])
                return httpx.Response(200, json=[p for p in PLACES if (p["category"], p["type"]) in kinds
                                                 and in_box((float(p["lat"]), float(p["lon"])), box)])
            hit = NAMES.get(params["q"].lower())
            return httpx.Response(200, json=[{"display_name": params["q"], "lat": str(hit[0]), "lon": str(hit[1]),
                                              "addresstype": "city"}] if hit else [])
        if "/table/" in path:
            if not state["table_up"]:
                return httpx.Response(503)
            coords = [tuple(map(float, c.split(",")))[::-1] for c in path.split("/driving/")[1].split(";")]
            sources = [int(i) for i in params["sources"].split(";")]
            destinations = [int(i) for i in params["destinations"].split(";")]
            meters = [[places._distance_m(*coords[s], *coords[d]) * 1.2 for d in destinations] for s in sources]
            return httpx.Response(200, json={"code": "Ok", "distances": meters, "durations": [[m / 25 for m in row] for row in meters]})
        if "router.project-osrm.org" in host:
            waypoints = [tuple(map(float, c.split(",")))[::-1] for c in path.split("/driving/")[1].split(";")]
            if len(waypoints) == 2:
                routes = [{"distance": 965_606 + 30_000 * i, "duration": 30_600 + 1_800 * i,
                           "geometry": {"type": "LineString", "coordinates": c}} for i, c in enumerate(state["routes"])]
                if params.get("alternatives") in ("false", None):
                    routes = routes[:1]
                return httpx.Response(200, json={"code": "Ok", "routes": routes})
            # Through stops: straight legs between them, at the same scale and speed as the direct route,
            # so going through a stop off the road costs measurable extra time.
            scale = 965_606 / places._distance_m(*KC, *DENVER)
            meters = scale * sum(places._distance_m(*a, *b) for a, b in zip(waypoints, waypoints[1:]))
            geometry = [[a[1] + (b[1] - a[1]) * k / 20, a[0] + (b[0] - a[0]) * k / 20]
                        for a, b in zip(waypoints, waypoints[1:]) for k in range(20)] + [[waypoints[-1][1], waypoints[-1][0]]]
            return httpx.Response(200, json={"code": "Ok", "routes": [
                {"distance": meters, "duration": meters / (965_606 / 30_600), "geometry": {"type": "LineString", "coordinates": geometry}}]})
        return httpx.Response(404)

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    places.clear_caches()
    driving.clear_cache()
    yield state
    places.clear_caches()
    driving.clear_cache()


def stops_for(interests, **kwargs):
    return route_search.corridor_stops(line(), interests, route_miles=600, **kwargs)


# ---------------------------------------------------------------------------------------------
# The search


def test_route_search_finds_towns_and_landmarks_with_real_detours(world):
    stops = stops_for(["History", "Nature"])
    names = [s.name for s in stops]
    assert "Fort Hays" in names  # the fort leads Hays, ahead of the museum
    assert "High Plains Overlook" in names  # a documented landmark outside any town
    assert "Quivira Monument" not in names  # beside Kansas City, so part of the start
    assert "Faraway Museum" not in names  # 25 km from the road
    fort = next(s for s in stops if s.name == "Fort Hays")
    assert fort.town == "Hays" and "Also nearby: 1 museum" in fort.reason
    assert fort.source_urls == ["https://www.openstreetmap.org/node/11"]
    assert fort.website_url == "https://example.org/forthays"
    assert not fort.detour_estimated
    assert 320 <= fort.miles_from_start <= 340  # 55% of 600 miles


def test_search_stays_within_nominatims_limits(world):
    stops_for(["History", "Small towns", "Nature", "Architecture"])
    # At most 12 searches, at most 3 kinds of place, each interest's first word first.
    assert len(world["searches"]) <= route_search.MAX_SEARCHES
    assert sorted(set(world["searches"])) == ["attractions", "museums", "viewpoints"]


def test_search_phrases_follow_the_interests():
    assert route_search.search_phrases(["History"]) == ["museums", "monuments"]
    assert route_search.search_phrases(["Nature", "Quirky stops"]) == ["viewpoints", "attractions", "parks"]
    assert route_search.search_phrases(["Local food"]) == ["attractions", "museums"]  # meals are separate


def test_undocumented_places_outside_towns_are_not_stops(world):
    assert "Big Painted Rock" not in [s.name for s in stops_for(["Quirky stops"])]


def test_small_towns_are_marked(world):
    wilson = next(s for s in stops_for(["Small towns", "History"]) if s.town == "Wilson")
    assert "Small towns" in wilson.interests and wilson.less_explored


def test_exclude_skips_places_and_towns_already_in_the_plan(world):
    names = [s.name for s in stops_for(["History"], exclude=["fort hays"])]
    assert "Fort Hays" not in names and "Ellis County Museum" in names  # the next best place in Hays
    assert all(s.town != "Hays" for s in stops_for(["History"], exclude=["Hays"]))


def test_detours_are_estimated_and_flagged_when_routing_is_down(world):
    world["table_up"] = False
    stops = stops_for(["History"])
    assert stops and all(s.detour_estimated for s in stops)


def test_search_failing_is_reported_not_hidden(world):
    world["nominatim_up"] = False
    with pytest.raises(places.PlacesUnavailable):
        route_search.search_route(line(), ["History"])


def test_route_options_and_choosing_a_different_road(world):
    options = route_search.route_options("Kansas City, MO", "Denver, CO")
    assert [o.index for o in options] == [0, 1] and options[1].miles > options[0].miles
    other = driving.estimate_drive("Kansas City, MO", "Denver, CO", route_index=1)
    assert other.distance_miles > driving.estimate_drive("Kansas City, MO", "Denver, CO").distance_miles
    assert driving.estimate_drive("Kansas City, MO", "Denver, CO", route_index=5) is None


def test_towns_along_route_is_in_route_order(world):
    stops = route_search.towns_along_route("Kansas City, MO", "Denver, CO", ["History", "Nature", "Small towns"])
    assert [s.miles_from_start for s in stops] == sorted(s.miles_from_start for s in stops)
    assert route_search.towns_along_route("Kansas City, MO", "Atlantis") == []


# ---------------------------------------------------------------------------------------------
# The first plan


def plan(**overrides):
    fields = {"start": "Kansas City, MO", "destination": "Denver, CO", "interests": ["History", "Nature"],
              "departure_date": date(2026, 10, 17), **overrides}
    return build_first_plan(TripRequest(**fields))


def test_first_plan_is_a_complete_valid_itinerary(world):
    result = plan(detour_budget_minutes=120)
    items = result.itinerary.items
    assert result.route.miles == 600 and len(result.route.path) > 10
    assert result.detour_minutes_used <= 120 and result.stops and result.notes == []
    drives = [i for i in items if i.category == "Driving"]
    assert len(drives) == 2 and all(d.route and d.websiteUrl.startswith("https://www.google.com/maps/dir/") for d in drives)
    for item in items:
        if item.category != "Driving":
            assert item.location.lat is not None and item.sourceUrls[0].startswith("https://www.openstreetmap.org/")
    # Local lunch places before chains; ordinary motels before luxury hotels; a bed every night.
    lunches = [i.title for i in items if i.title.startswith("Lunch")]
    stays = [i.title for i in items if i.category == "Stays"]
    assert lunches and all("Diner" in t for t in lunches)
    assert len(stays) == 2 and all("Prairie Motel" in t for t in stays)
    for day in {i.date for i in items}:
        times = [i.time for i in items if i.date == day and i.time]
        assert times == sorted(times)
    # Checked the way the chat checks road trips: measured route through every stop, meal and bed.
    assert result.itinerary.roadTrip is not None
    assert result.itinerary.roadTrip.detourMinutes <= 120 and result.detour_minutes_used <= 120


def test_detour_budget_is_respected(world):
    tight = plan(detour_budget_minutes=0)
    assert tight.detour_minutes_used == 0
    assert len(plan(detour_budget_minutes=240).stops) >= len(tight.stops)


def test_choose_stops_spaces_them_out(world):
    chosen = choose_stops(stops_for(["History", "Nature", "Small towns"]), 480, 600, 2)
    assert all(b.miles_from_start - a.miles_from_start >= 25 for a, b in zip(chosen, chosen[1:]))


def test_first_plan_passes_the_chat_road_trip_checks_unchanged(world):
    """Every edit runs the plan through the chat's checks (routers/ask.py): validate_snapshot, then
    RoadTripPlanner.validate. A first plan from here must come through both intact, with no warnings."""
    from roadtrip import RoadTripPlanner
    from schemas import RoadTripPreferences

    result = plan(detour_budget_minutes=120)
    cleaned, notes = validate_snapshot(result.itinerary, evidence_from_snapshot(result.itinerary), car_mode=True)
    assert not [n for n in notes if n.startswith(("Removed", "Not found", "Several stops"))]
    checked = RoadTripPlanner(RoadTripPreferences(origin="Kansas City, MO", destination="Denver, CO", detour_minutes=120,
                                                  mpg=28, gas_price=3.25), result.itinerary, 400).validate(cleaned)
    visits = lambda plan: {i.id: (i.location, i.sourceUrls, i.websiteUrl) for i in plan.items if i.category != "Driving"}
    assert visits(checked) == visits(result.itinerary) and visits(result.itinerary)


def test_plan_over_budget_leaves_out_extras_first(world):
    """Lunch and beds add driving too. When the whole route goes over the budget, extras go before
    stops (the destination's bed, then the halfway lunch, then lunch at a stop), and the result fits."""
    roomy = plan(detour_budget_minutes=240)
    everything = roomy.itinerary.roadTrip.detourMinutes
    budget = int(everything) - 1  # just under what the full plan needs
    assert budget >= 1
    tight = plan(detour_budget_minutes=budget)
    assert tight.itinerary.roadTrip.detourMinutes <= budget
    assert any(note.startswith(f"To stay within your {budget}-minute detour budget") for note in tight.notes)
    kept = {i.id for i in tight.itinerary.items}
    dropped = [i.id for i in roomy.itinerary.items if i.id not in kept and i.category != "Driving"]
    # The destination's bed is the first thing to go; no stop goes while a meal or that bed could.
    assert dropped and dropped[0].startswith("stay-")
    assert all(not d.startswith("stop-") for d in dropped) or all(not k.startswith(("lunch-",)) for k in kept)


def test_route_only_answer_makes_no_searches(world):
    result = plan(include_places=False)
    assert world["searches"] == [] and result.complete is False and result.stops == []
    assert [i.category for i in result.itinerary.items] == ["Driving", "Driving"]


def test_search_outage_still_returns_the_drive_with_a_note(world):
    world["search_up"] = False  # place searches refused; city lookups still work
    result = plan()
    assert result is not None and result.stops == []
    assert [i.category for i in result.itinerary.items] == ["Driving", "Driving"]
    assert any("unavailable" in note for note in result.notes)


def test_unknown_place_is_none(world):
    assert build_first_plan(TripRequest(start="Kansas City, MO", destination="Atlantis")) is None


# ---------------------------------------------------------------------------------------------
# Endpoints


@pytest.fixture
def client(world):
    app = FastAPI()
    app.include_router(trips_router.router)
    return TestClient(app)


def test_plan_endpoint(client):
    response = client.post("/api/trips/plan", json={"start": "Kansas City, MO", "destination": "Denver, CO",
                                                    "interests": ["History"], "detour_budget_minutes": 600})
    assert response.status_code == 200 and response.json()["route"]["miles"] == 600
    assert client.post("/api/trips/plan", json={"start": "Kansas City, MO", "destination": "Atlantis"}).status_code == 404
    assert client.post("/api/trips/plan", json={"start": "K", "destination": "Denver, CO"}).status_code == 422


def test_search_endpoints(client):
    assert [r["index"] for r in client.get("/api/trips/routes", params={"origin": "Kansas City, MO", "destination": "Denver, CO"}).json()] == [0, 1]
    towns = client.get("/api/trips/towns", params={"origin": "Kansas City, MO", "destination": "Denver, CO",
                                                   "interests": ["History"], "exclude": ["Fort Hays"]}).json()
    assert towns and "Fort Hays" not in [t["name"] for t in towns]
