"""Route search and the first plan, on a small fake Kansas City -> Denver world. No network."""

import itertools
import json
import math
import re
import threading
import time
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


def node(id_, lat_lng, **tags):
    return {"type": "node", "id": id_, "lat": lat_lng[0], "lon": lat_lng[1], "tags": tags}


HAYS = on_route(0.55, 5)
OAKLEY = on_route(0.72, 4)
CORRIDOR = [
    # A small town with a fort and a museum: the best stop.
    node(1, HAYS, place="town", name="Hays", population="21000", wikipedia="en:Hays, Kansas"),
    node(11, (HAYS[0] + 0.004, HAYS[1] + 0.004), historic="fort", name="Fort Hays", wikidata="Q1", website="https://example.org/forthays"),
    node(12, (HAYS[0] - 0.004, HAYS[1]), tourism="museum", name="Ellis County Museum"),
    # A village beside Kansas City: part of the city, not a stop on the way.
    node(2, on_route(0.02, 3), place="village", name="Lake Quivira"),
    node(21, on_route(0.02, 3.3), historic="monument", name="Quivira Monument"),
    # A town whose only food is a chain: not "local food".
    node(3, OAKLEY, place="town", name="Oakley", population="2000"),
    node(31, (OAKLEY[0] + 0.003, OAKLEY[1]), amenity="restaurant", name="Burger Chain", brand="Burger Chain"),
    # A documented viewpoint outside any town.
    node(4, on_route(0.85, 3), tourism="viewpoint", name="High Plains Overlook", wikidata="Q4"),
    # Far from the road (25 km): the box search returns them, the distance check drops them.
    node(6, on_route(0.40, 25), place="town", name="Faraway", wikipedia="en:Faraway"),
    node(61, on_route(0.40, 25.2), tourism="museum", name="Faraway Museum", wikidata="Q6"),
    # A tiny village with a historic church.
    node(5, on_route(0.30, 2), place="village", name="Wilson", population="780"),
    node(51, on_route(0.30, 2.2), historic="church", name="St. Wenceslaus Church", heritage="2"),
]
NAMES = {
    "kansas city, mo": KC, "denver, co": DENVER, "hays, ks": HAYS,
}


@pytest.fixture
def world(monkeypatch):
    state = {"overpass_up": True, "table_up": True, "queries": [], "routes": [line(), line(bend_km=40)]}

    def handler(request: httpx.Request) -> httpx.Response:
        host, path = request.url.host, request.url.path
        if "nominatim" in host and path.endswith("/reverse"):
            return httpx.Response(200, json={"address": {"town": "Somewhere", "state": "Kansas"}})
        if "nominatim" in host:
            hit = NAMES.get(request.url.params["q"].lower())
            return httpx.Response(200, json=[{"display_name": request.url.params["q"], "lat": str(hit[0]), "lon": str(hit[1]),
                                              "addresstype": "city"}] if hit else [])
        if "/table/" in path:
            if not state["table_up"]:
                return httpx.Response(503)
            coords = [tuple(map(float, c.split(",")))[::-1] for c in path.split("/driving/")[1].split(";")]
            sources = [int(i) for i in request.url.params["sources"].split(";")]
            destinations = [int(i) for i in request.url.params["destinations"].split(";")]
            meters = [[places._distance_m(*coords[s], *coords[d]) * 1.2 for d in destinations] for s in sources]
            return httpx.Response(200, json={"code": "Ok", "distances": meters,
                                             "durations": [[m / 25 for m in row] for row in meters]})
        if "router.project-osrm.org" in host:
            routes = [{"distance": 965_606 + 30_000 * i, "duration": 30_600 + 1_800 * i, "geometry": {"type": "LineString", "coordinates": c}}
                      for i, c in enumerate(state["routes"])]
            return httpx.Response(200, json={"code": "Ok", "routes": routes})
        if "overpass" in host:
            query = httpx.QueryParams(request.content.decode()).get("data")
            state["queries"].append(query)
            if not state["overpass_up"]:
                return httpx.Response(504)
            if '"place"~"^(town|village)$"' in query:  # the search along the route line
                return httpx.Response(200, json={"elements": CORRIDOR})
            # Meals and beds: a local diner, a chain and a hotel at every anchor.
            elements = []
            for n, (key, lat, lng) in enumerate(re.findall(r'nwr\["(\w+)".*?\(around:\d+,([-\d.]+),([-\d.]+)\)', query)):
                lat, lng = float(lat), float(lng)
                if key == "tourism":
                    elements.append(node(1000 + n, (lat + 0.01, lng), tourism="motel", name=f"Prairie Motel {n}", website="https://example.org/motel"))
                    # Better documented, but not what a road trip wants.
                    elements.append(node(4000 + n, (lat + 0.002, lng), tourism="hotel", name=f"The Ritz-Carlton {n}", stars="5",
                                         wikidata="Q9", website="https://example.org/ritz"))
                else:
                    elements.append(node(2000 + n, (lat + 0.005, lng), amenity="restaurant", name=f"Big Chain {n}", brand="Big Chain", website="https://example.org/chain"))
                    elements.append(node(3000 + n, (lat + 0.006, lng), amenity="cafe", name=f"Main Street Diner {n}"))
            return httpx.Response(200, json={"elements": elements})
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


def test_corridor_search_finds_towns_and_landmarks_with_real_detours(world):
    stops = stops_for(["History", "Nature"])
    names = [s.name for s in stops]
    assert "Fort Hays" in names  # the fort leads Hays, ahead of the museum
    assert "High Plains Overlook" in names  # a documented landmark outside any town
    assert "Quivira Monument" not in names  # beside Kansas City, so part of the start
    fort = next(s for s in stops if s.name == "Fort Hays")
    assert fort.town == "Hays" and "Also nearby: 1 museum" in fort.reason
    assert fort.source_urls == ["https://www.openstreetmap.org/node/11"]
    assert fort.website_url == "https://example.org/forthays"
    assert not fort.detour_estimated and fort.detour_minutes > 0 and fort.gas_cost_usd > 0
    assert 320 <= fort.miles_from_start <= 340  # 55% of 600 miles, to the nearest route point (about 3 miles apart)
    # One Overpass request per piece of the route, searching around the line and around the towns.
    query = world["queries"][0]
    # One request of small boxes along the route (fast for Overpass), not "around this line" (slow).
    assert len(world["queries"]) == 1
    assert "(around:" not in query and '["place"~"^(town|village)$"]["name"](' in query
    # Node coordinates kept; ways and relations as tags and a centre only.
    assert "node.found;out qt" in query and ");out tags center qt" in query


def test_local_food_skips_chains_and_small_towns_favours_villages(world):
    food = stops_for(["Local food"])
    assert not any(s.town == "Oakley" for s in food)  # its only restaurant is a chain
    small = stops_for(["Small towns", "History"])
    wilson = next(s for s in small if s.town == "Wilson")
    assert "Small towns" in wilson.interests and wilson.less_explored


def test_exclude_skips_places_and_towns_already_in_the_plan(world):
    names = [s.name for s in stops_for(["History"], exclude=["fort hays"])]
    assert "Fort Hays" not in names and "Ellis County Museum" in names  # the next best place in Hays
    assert all(s.town != "Hays" for s in stops_for(["History"], exclude=["Hays"]))


def test_detours_are_estimated_and_flagged_when_routing_is_down(world):
    world["table_up"] = False
    stops = stops_for(["History"])
    assert stops and all(s.detour_estimated for s in stops)


def test_max_detour_filters_far_stops(world):
    assert all(s.detour_minutes <= 5 for s in stops_for(["History", "Nature"], max_detour_minutes=5))


def test_route_options_and_choosing_a_different_road(world):
    options = route_search.route_options("Kansas City, MO", "Denver, CO")
    assert [o.index for o in options] == [0, 1] and options[1].miles > options[0].miles
    assert options[0].via == "Somewhere, Kansas"
    fastest = driving.estimate_drive("Kansas City, MO", "Denver, CO", route_index=0)
    other = driving.estimate_drive("Kansas City, MO", "Denver, CO", route_index=1)
    assert other.distance_miles > fastest.distance_miles and other.route_count == 2
    assert driving.estimate_drive("Kansas City, MO", "Denver, CO", route_index=5) is None


def test_trip_mpg_and_gas_price_override_the_defaults(world):
    estimate = driving.estimate_drive("Kansas City, MO", "Denver, CO", round_trip=False, mpg=30, gas_price=4)
    assert estimate.fuel_cost_usd == 80  # 600 miles / 30 mpg * $4


def test_towns_along_route_is_in_route_order(world):
    stops = route_search.towns_along_route("Kansas City, MO", "Denver, CO", ["History", "Nature", "Small towns"])
    assert [s.miles_from_start for s in stops] == sorted(s.miles_from_start for s in stops)
    assert route_search.towns_along_route("Kansas City, MO", "Atlantis") == []


# ---------------------------------------------------------------------------------------------
# The first plan


def plan(**overrides):
    request = TripRequest(start="Kansas City, MO", destination="Denver, CO", interests=["History", "Nature"],
                          departure_date=date(2026, 10, 17), **overrides)
    return build_first_plan(request)


def test_first_plan_is_a_complete_valid_itinerary(world):
    result = plan(detour_budget_minutes=120)
    items = result.itinerary.items
    assert result.route.miles == 600 and result.route.route_count == 2 and len(result.route.path) > 10
    assert result.detour_minutes_used <= 120 and result.stops
    # Two driving days (400 miles a day), each with its route line and directions link.
    drives = [i for i in items if i.category == "Driving"]
    assert len(drives) == 2 and all(d.route and d.websiteUrl.startswith("https://www.google.com/maps/dir/") for d in drives)
    # Every stop, meal and bed is a looked-up place with a pin and an OpenStreetMap source.
    for item in items:
        if item.category != "Driving":
            assert item.location.lat is not None and item.sourceUrls[0].startswith("https://www.openstreetmap.org/")
    # Meals prefer local places over chains; there is a bed at the end of each day.
    lunches = [i for i in items if i.title.startswith("Lunch")]
    assert lunches and all("Diner" in i.title for i in lunches)
    assert sum(i.category == "Stays" for i in items) == 2
    # Times run forward through each day.
    for day in {i.date for i in items}:
        times = [i.time for i in items if i.date == day]
        assert times == sorted(times)
    assert result.itinerary.startDate == date(2026, 10, 17) and result.itinerary.endDate == date(2026, 10, 18)
    assert result.notes == []


def test_detour_budget_is_respected(world):
    tight = plan(detour_budget_minutes=0)
    assert tight.detour_minutes_used == 0 and all(s.detour_minutes == 0 for s in tight.stops)
    roomy = plan(detour_budget_minutes=240)
    assert len(roomy.stops) >= len(tight.stops)


def test_choose_stops_spaces_them_out(world):
    stops = stops_for(["History", "Nature", "Small towns"])
    chosen = choose_stops(stops, 480, 600, 2)
    gaps = [b.miles_from_start - a.miles_from_start for a, b in zip(chosen, chosen[1:])]
    assert all(gap >= 25 for gap in gaps)


def test_round_trip_adds_the_drive_home_with_the_same_overnight_town(world):
    result = plan(round_trip=True)
    items = result.itinerary.items
    assert [i.id for i in items if i.category == "Driving"] == ["drive-1", "drive-2", "drive-home-1", "drive-home-2"]
    out_stay = next(i for i in items if i.id == "stay-1")
    home_stay = next(i for i in items if i.id == "stay-home-1")
    assert out_stay.location == home_stay.location
    assert result.itinerary.endDate == date(2026, 10, 20)


def test_first_plan_passes_the_chat_accuracy_check_unchanged(world):
    """The chat checks every plan it publishes. A plan made here must come through it intact,
    so the traveler's first edit does not strip pins, links or routes."""
    result = plan(detour_budget_minutes=120)
    cleaned, notes = validate_snapshot(result.itinerary, evidence_from_snapshot(result.itinerary), car_mode=True)
    assert not [n for n in notes if n.startswith(("Removed", "Not found", "Several stops"))]
    before = {i.id: (i.location, i.sourceUrls, i.websiteUrl, i.route) for i in result.itinerary.items}
    after = {i.id: (i.location, i.sourceUrls, i.websiteUrl, i.route) for i in cleaned.items}
    assert after == before


def test_place_search_outage_still_returns_the_drive(world):
    world["overpass_up"] = False
    result = plan()
    assert result.stops == [] and [i.category for i in result.itinerary.items] == ["Driving", "Driving"]
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


def test_plan_endpoint(client, world):
    response = client.post("/api/trips/plan", json={"start": "Kansas City, MO", "destination": "Denver, CO",
                                                    "interests": ["History"], "detour_budget_minutes": 60})
    assert response.status_code == 200
    body = response.json()
    assert body["itinerary"]["items"] and body["route"]["miles"] == 600
    assert client.post("/api/trips/plan", json={"start": "Kansas City, MO", "destination": "Atlantis"}).status_code == 404
    assert client.post("/api/trips/plan", json={"start": "K", "destination": "Denver, CO"}).status_code == 422
    # The Trip setup field allows typed detour budgets up to 600 minutes.
    assert client.post("/api/trips/plan", json={"start": "Kansas City, MO", "destination": "Denver, CO",
                                                "detour_budget_minutes": 600}).status_code == 200


def test_search_endpoints(client, world):
    assert [r["index"] for r in client.get("/api/trips/routes", params={"origin": "Kansas City, MO", "destination": "Denver, CO"}).json()] == [0, 1]
    towns = client.get("/api/trips/towns", params={"origin": "Kansas City, MO", "destination": "Denver, CO",
                                                   "interests": ["History"], "exclude": ["Fort Hays"]}).json()
    assert towns and "Fort Hays" not in [t["name"] for t in towns]
    world["overpass_up"] = False
    places.clear_caches()
    driving.clear_cache()
    assert client.get("/api/trips/towns", params={"origin": "Kansas City, MO", "destination": "Denver, CO"}).status_code == 503


def test_long_drive_is_searched_in_pieces_at_the_same_time_and_merged(world, monkeypatch):
    monkeypatch.setattr(route_search, "BOXES_PER_REQUEST", 3)
    stops = stops_for(["History", "Nature"])
    assert len(world["queries"]) > 1
    # Each piece returns the same fake places: they are merged, not repeated.
    assert len([s for s in stops if s.name == "Fort Hays"]) == 1


def test_one_piece_failing_keeps_the_rest(world, monkeypatch):
    monkeypatch.setattr(route_search, "BOXES_PER_REQUEST", 3)
    calls = {"n": 0}
    real = places.overpass

    def flaky(query, timeout_s=10.0, budget_s=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise places.PlacesUnavailable("busy")
        return real(query, timeout_s, budget_s)

    monkeypatch.setattr(places, "overpass", flaky)
    assert stops_for(["History"])  # the other pieces still found stops



def test_places_far_from_the_road_are_left_out(world):
    stops = stops_for(["History", "Small towns"])
    assert not any(s.town == "Faraway" or s.name == "Faraway Museum" for s in stops)


def test_plan_makes_two_map_requests_at_the_same_time_and_skips_luxury_hotels(world):
    result = plan(detour_budget_minutes=120)
    assert len(world["queries"]) == 2  # stops along the route, and beds and meals
    stays = [i.title for i in result.itinerary.items if i.category == "Stays"]
    assert stays and all("Prairie Motel" in title for title in stays)


def test_route_only_answer_is_quick_and_marked_incomplete(world):
    result = build_first_plan(TripRequest(start="Kansas City, MO", destination="Denver, CO", include_places=False))
    assert world["queries"] == []  # no place search at all
    assert result.complete is False and result.stops == []
    assert [i.category for i in result.itinerary.items] == ["Driving", "Driving"]


def test_disk_cache_answers_repeats_without_the_network(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"elements": [{"type": "node", "id": 1}]})

    client = httpx.Client(transport=places.DiskCacheTransport(httpx.MockTransport(handler), tmp_path))
    first = client.post("https://overpass-api.de/api/interpreter", data={"data": "query"})
    again = client.post("https://overpass-api.de/api/interpreter", data={"data": "query"})
    other = client.post("https://overpass-api.de/api/interpreter", data={"data": "another query"})
    assert first.json() == again.json() and again.headers["x-roam-cache"] == "hit"
    assert len(calls) == 2 and other.status_code == 200
    # Failures are never saved.
    failing = httpx.Client(transport=places.DiskCacheTransport(httpx.MockTransport(lambda r: httpx.Response(504)), tmp_path / "f"))
    assert failing.get("https://example.org/x").status_code == 504 and not list((tmp_path / "f").rglob("*.json"))


def test_overpass_gives_up_within_its_time_budget(monkeypatch):
    tried = []

    def handler(request):
        tried.append(request.url.host)
        time.sleep(1.5)
        raise httpx.ReadTimeout("slow", request=request)

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "_rotation", itertools.count())
    began = time.monotonic()
    with pytest.raises(places.PlacesUnavailable):
        places.overpass("q", timeout_s=20, budget_s=4)
    # After the first server failed at 1.5 s, under 3 s were left: no other server was started.
    assert tried == ["overpass-api.de"] and time.monotonic() - began < 3.5


def test_a_slow_server_gets_a_second_server_asked_and_the_first_answer_wins(monkeypatch):
    tried = []

    def handler(request):
        tried.append(request.url.host)
        if request.url.host == "overpass-api.de":
            time.sleep(3)  # merely slow
        return httpx.Response(200, json={"elements": [{"type": "node", "id": request.url.host}]})

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "_rotation", itertools.count())
    monkeypatch.setattr(places, "HEDGE_AFTER_S", 0.5)
    began = time.monotonic()
    assert places.overpass("q", timeout_s=20, budget_s=20) == [{"type": "node", "id": "overpass.private.coffee"}]
    assert time.monotonic() - began < 2 and tried == ["overpass-api.de", "overpass.private.coffee"]


def test_concurrent_searches_start_on_different_servers(monkeypatch):
    tried = []
    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(
        lambda r: tried.append(r.url.host) or httpx.Response(200, json={"elements": []}))))
    monkeypatch.setattr(places, "_rotation", itertools.count())
    places.overpass("a")
    places.overpass("b")
    assert tried == ["overpass-api.de", "overpass.private.coffee"]


TIMED_OUT = {"elements": [{"type": "node", "id": 1}],
             "remark": 'runtime error: Query timed out in "query" at line 1 after 26 seconds.'}


def test_an_overpass_answer_that_ran_out_of_time_is_never_trusted_or_saved(tmp_path, monkeypatch):
    tried = []

    def handler(request):
        tried.append(request.url.host)
        if request.url.host == "overpass-api.de":
            return httpx.Response(200, json=TIMED_OUT)  # "OK", but cut short
        return httpx.Response(200, json={"elements": [{"type": "node", "id": 2}]})

    monkeypatch.setattr(places, "_client", httpx.Client(transport=places.DiskCacheTransport(httpx.MockTransport(handler), tmp_path)))
    monkeypatch.setattr(places, "_rotation", itertools.count())
    assert places.overpass("q") == [{"type": "node", "id": 2}]  # the backup server's full answer
    assert tried == ["overpass-api.de", "overpass.private.coffee"]
    saved = [p.read_text() for p in tmp_path.rglob("*.json")]
    assert len(saved) == 1 and "timed out" not in saved[0]
    # An incomplete answer saved by an older version is not reused either.
    assert places.overpass_failed(json.dumps(TIMED_OUT))
    assert not places.overpass_failed(json.dumps({"elements": [], "remark": "note: fine"}))


def test_background_warming_waits_while_a_traveler_is_searching(monkeypatch):
    order = []
    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json={"elements": []}))))
    real_post = places._client.post

    def post(*args, **kwargs):
        order.append(threading.current_thread().name)
        return real_post(*args, **kwargs)

    monkeypatch.setattr(places._client, "post", post)
    background = threading.Thread(target=lambda: places.overpass("q"), name=places.BACKGROUND_THREAD_PREFIX)
    with places.foreground():
        background.start()
        time.sleep(0.8)
        assert order == []  # still waiting
        places.overpass("q")  # the traveler's own search goes straight through
    background.join(timeout=5)
    # The traveler's search first, then the background one (requests run on helper threads named after them).
    assert [name.split("-overpass")[0] for name in order] == ["MainThread", places.BACKGROUND_THREAD_PREFIX]


def test_route_search_leaves_out_the_start_and_end_cities(world):
    stops_for(["History"])
    boxes = [tuple(map(float, b)) for b in re.findall(r'\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\);', world["queries"][0])]
    # No box covers downtown Kansas City or Denver.
    assert boxes and not any(s <= lat <= n and w <= lng <= e for s, w, n, e in boxes for lat, lng in (KC, DENVER))


def test_city_lookup_falls_back_to_photon_when_nominatim_refuses(monkeypatch):
    state = {"photon_up": True}

    def handler(request):
        if "nominatim" in request.url.host:
            return httpx.Response(429, text="Too Many Requests")  # a throttled shared network
        if not state["photon_up"]:
            return httpx.Response(503)
        if request.url.path.endswith("/reverse"):
            return httpx.Response(200, json={"features": [{"geometry": {"coordinates": [-97.6, 38.84]},
                                                          "properties": {"type": "city", "name": "Salina", "state": "Kansas"}}]})
        return httpx.Response(200, json={"features": [{"geometry": {"coordinates": [-97.6114, 38.8403]},
                                                       "properties": {"osm_type": "R", "osm_id": 128123, "name": "Salina",
                                                                      "state": "Kansas", "country": "United States", "type": "city"}}]})

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    places.clear_caches()
    point = places.geocode("Salina, KS")
    assert (point.lat, point.lng, point.kind) == (38.8403, -97.6114, "city")
    assert point.source_url == "https://www.openstreetmap.org/relation/128123"
    assert places.town_at(38.84, -97.6) == "Salina, Kansas"
    # Both down: say the service is unavailable, never "unknown city".
    places.clear_caches()
    state["photon_up"] = False
    with pytest.raises(places.PlacesUnavailable):
        places.geocode("Salina, KS")
    places.clear_caches()


def test_warming_retries_routes_when_the_map_services_were_down(world):
    import warm

    world["overpass_up"] = False
    calls = []
    real = warm._warm_one

    def counting(start, destination):
        calls.append(start)
        if len(calls) == 2:
            world["overpass_up"] = True  # the network came back
            places.clear_caches()
            driving.clear_cache()
        return real(start, destination)

    warm._warm_one = counting
    try:
        warm.warm([("Kansas City, MO", "Denver, CO")], rounds=3, wait_s=0)
    finally:
        warm._warm_one = real
    assert len(calls) == 2  # failed once (no stops), then planned when the service was back


def test_compressed_answers_pass_through_the_disk_cache(tmp_path):
    """Real servers send gzip. The cache hands on the already-decompressed body, so it must not keep
    the Content-Encoding header, or httpx decompresses twice (DecodingError)."""
    import gzip

    body = json.dumps({"code": "Ok", "routes": []}).encode()
    transport = places.DiskCacheTransport(httpx.MockTransport(
        lambda r: httpx.Response(200, content=gzip.compress(body), headers={"content-encoding": "gzip", "content-type": "application/json"})),
        tmp_path)
    client = httpx.Client(transport=transport)
    assert client.get("https://router.project-osrm.org/route/x").json() == {"code": "Ok", "routes": []}  # fresh
    assert client.get("https://router.project-osrm.org/route/x").json() == {"code": "Ok", "routes": []}  # saved


def test_overpass_queries_use_valid_output_statements(world):
    """`node.found out ...` is a syntax error (Overpass answers 400): each output is its own statement."""
    plan(detour_budget_minutes=60)
    assert len(world["queries"]) == 2
    for query in world["queries"]:
        assert "found out" not in query
        assert query.count(";out ") == 2 and "node.found;out qt" in query and ");out tags center qt" in query
