"""Tests for the Plane / Road toggle: airports, ticket links, day-by-day driving, and the prompts.

All map, routing and model calls are replaced, so no network or AWS keys are needed.
"""

from datetime import date
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import tools
from evidence import Evidence, recording_tools
from routers import ask as ask_router
from tools import airports, driving, places

KANSAS_CITY = {"display_name": "Kansas City, Missouri, United States", "lat": "39.0997", "lon": "-94.5786"}
DENVER = {"display_name": "Denver, Colorado, United States", "lat": "39.7392", "lon": "-104.9903"}


def aerodrome(iata, name, lat, lon, importance, aerodrome_tag="", osm_id=1, **extratags):
    return {
        "osm_type": "way", "osm_id": osm_id, "lat": str(lat), "lon": str(lon), "category": "aeroway", "type": "aerodrome",
        "name": name, "importance": importance, "namedetails": {"iata": iata, "name": name},
        "extratags": {"aerodrome": aerodrome_tag, **extratags},
    }


AIRPORT_RESULTS = [
    aerodrome("STJ", "Rosecrans Memorial Airport", 39.77, -94.91, 0.2, osm_id=2),
    aerodrome("MCI", "Kansas City International Airport", 39.30, -94.71, 0.45, "international", osm_id=1, website="https://flykc.com"),
    aerodrome("WRI", "McGuire Air Force Base", 40.01, -74.59, 0.3, osm_id=3),
    aerodrome("OFF", "Offutt Field", 41.12, -95.91, 0.3, osm_id=4, military="airfield"),
    # No airport code: not a passenger airport for our purposes.
    {**aerodrome("", "Private Strip", 39.2, -94.6, 0.1, osm_id=5), "namedetails": {"name": "Private Strip"}},
    # A different kind of result for the same words.
    {"osm_type": "node", "osm_id": 6, "lat": "39.1", "lon": "-94.6", "category": "waterway", "type": "dam", "name": "Airport Dam"},
]


@pytest.fixture
def services(monkeypatch):
    """Nominatim: geocoding by name, airport searches (with a viewbox), and reverse lookups. OSRM: one route."""
    state = {"calls": [], "route": {"code": "Ok", "routes": [{"distance": 965_606.4, "duration": 30_600}]}}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"].append(request)
        if "nominatim" in request.url.host:
            if request.url.path.endswith("/reverse"):
                return httpx.Response(200, json={"address": {"town": "Hays", "state": "Kansas"}})
            if "viewbox" in request.url.params:
                return httpx.Response(200, json=AIRPORT_RESULTS)
            hit = {"kansas city, mo": KANSAS_CITY, "denver, co": DENVER}.get(request.url.params["q"].lower())
            return httpx.Response(200, json=[hit] if hit else [])
        return httpx.Response(200, json=state["route"])

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    for cache in (places.clear_caches, airports.clear_cache, driving.clear_cache):
        cache()
    yield state
    for cache in (places.clear_caches, airports.clear_cache, driving.clear_cache):
        cache()


def test_airports_are_passenger_airports_international_first(services):
    found = airports.find_airports("Kansas City, MO")
    assert [airport.iata for airport in found] == ["MCI", "STJ"]
    mci = found[0]
    assert mci.international and mci.website_url == "https://flykc.com"
    assert mci.source_urls == ["https://www.openstreetmap.org/way/1"]
    assert 0 < mci.distance_km < 40
    searched = [call.url.params["q"] for call in services["calls"] if "viewbox" in call.url.params]
    assert searched == ["international airport", "airport"]
    assert airports.find_airports("Nowhereville") is None


def test_flight_links_fill_in_route_dates_and_travelers():
    links = airports.flight_search_links("jfk", "BRI", date(2026, 6, 18), date(2026, 6, 25), 2)
    query = parse_qs(urlsplit(links["google_flights_url"]).query)["q"][0]
    assert query == "Flights from JFK to BRI on 2026-06-18 through 2026-06-25 for 2 adults"
    assert links["kayak_url"] == "https://www.kayak.com/flights/JFK-BRI/2026-06-18/2026-06-25/2adults"
    assert airports.flight_search_links("JFK", "BRI")["kayak_url"] == "https://www.kayak.com/flights/JFK-BRI"
    with pytest.raises(ValueError):
        airports.flight_search_links("JFK1", "BRI")


def test_tools_never_raise_and_report_bad_input(services):
    assert tools.find_airports("Kansas City, MO")["airports"][0]["iata"] == "MCI"
    assert tools.find_airports("Nowhereville")["status"] == "no_results"
    assert tools.flight_links("JFK", "BRI", "18 June")["status"] == "error"
    assert tools.flight_links("JFK", "BRI", "2026-06-18", travelers=2)["status"] == "ok"


def test_airports_and_ticket_links_count_as_real_for_the_itinerary(services):
    evidence = Evidence()
    by_name = {t.tool_name: t for t in recording_tools(evidence)}
    by_name["find_airports"]("Kansas City, MO")
    assert evidence.known_source("https://www.openstreetmap.org/way/1").name == "Kansas City International Airport"
    links = by_name["flight_links"]("MCI", "DEN", "2026-10-17", "2026-10-19", 2)
    assert links["google_flights_url"] in evidence.drive_links and links["kayak_url"] in evidence.drive_links


def test_drive_days_name_real_overnight_towns_on_the_route(services):
    services["route"] = {"code": "Ok", "routes": [{
        "distance": 965_606.4, "duration": 30_600,
        "geometry": {"type": "LineString", "coordinates": [[-94.5786, 39.0997], [-99.3, 38.9], [-104.9903, 39.7392]]},
    }]}
    estimate = driving.estimate_drive("Kansas City, MO", "Denver, CO", max_miles_per_day=250)
    assert estimate.driving_days_each_way == 3
    days = estimate.drive_days
    assert [(d.day, d.start, d.end) for d in days] == [
        (1, "Kansas City, MO", "Hays, Kansas"), (2, "Hays, Kansas", "Hays, Kansas"), (3, "Hays, Kansas", "Denver, CO"),
    ]
    assert all(d.miles == 200 for d in days)
    assert "Kansas+City" in days[0].google_maps_url and "Hays" in days[0].google_maps_url


def test_drive_days_without_route_shape_still_split_the_drive(services):
    estimate = driving.estimate_drive("Kansas City, MO", "Denver, CO")
    assert [d.end for d in estimate.drive_days] == ["Overnight stop after about 300 miles", "Denver, CO"]
    # A leg ending at an unnamed point links to directions for the whole route.
    assert "Denver" in estimate.drive_days[0].google_maps_url


def test_plane_and_road_toggle_reach_the_agent(monkeypatch):
    agents = []

    class Recorder:
        system_prompt = "Roam"

        def __init__(self, kwargs):
            agents.append(self)

        def __call__(self, prompt):
            return "ok"

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: Recorder(kwargs))
    app = FastAPI()
    app.include_router(ask_router.router)
    client = TestClient(app)

    client.post("/api/ask", json={"prompt": "x", "travel_mode": "plane"})
    assert "TRAVEL BY PLANE" in agents[-1].system_prompt and "CAR MODE" not in agents[-1].system_prompt

    client.post("/api/ask", json={"prompt": "x", "travel_mode": "road", "max_drive_miles_per_day": 300})
    prompt = agents[-1].system_prompt
    assert "TRAVEL BY ROAD" in prompt and "at most 300 miles" in prompt and "TRAVEL BY PLANE" not in prompt

    client.post("/api/ask", json={"prompt": "x"})
    assert "TRAVEL BY" not in agents[-1].system_prompt
    assert client.post("/api/ask", json={"prompt": "x", "travel_mode": "boat"}).status_code == 422


def test_flight_at_a_real_airport_keeps_its_ticket_link(services):
    from itinerary import ItinerarySnapshot
    from validation import validate_snapshot

    evidence = Evidence()
    by_name = {t.tool_name: t for t in recording_tools(evidence)}
    by_name["find_airports"]("Kansas City, MO")
    google = by_name["flight_links"]("DEN", "MCI", "2026-10-17")["google_flights_url"]
    plan = ItinerarySnapshot.model_validate({
        "startDate": "2026-10-17", "endDate": "2026-10-18", "budget": {"plannedUsd": 900},
        "items": [{"id": "f1", "date": "2026-10-17", "title": "Flight DEN → MCI", "category": "Flights", "costUsd": 400,
                   "location": {"name": "Kansas City International Airport", "lat": 39.30, "lng": -94.71},
                   "websiteUrl": google, "sourceUrls": ["https://www.openstreetmap.org/way/1"]}],
    })
    cleaned, _ = validate_snapshot(plan, evidence)
    assert cleaned.items[0].websiteUrl == google
    assert cleaned.items[0].sourceUrls == ["https://www.openstreetmap.org/way/1"]


def test_drive_home_is_split_like_the_way_there_and_summarized(services):
    estimate = driving.estimate_drive("Kansas City, MO", "Denver, CO", max_miles_per_day=400)
    assert [(d.start, d.end) for d in estimate.drive_days_home] == [(d.end, d.start) for d in reversed(estimate.drive_days)]
    assert all(d.miles <= 400 for d in [*estimate.drive_days, *estimate.drive_days_home])
    assert estimate.summary.startswith("600 miles each way (1,200 miles round trip)")
    assert driving.estimate_drive("Kansas City, MO", "Denver, CO", round_trip=False).drive_days_home == []


def test_every_driving_leg_link_counts_as_real(services, monkeypatch):
    evidence = Evidence()
    plan_drive = {t.tool_name: t for t in recording_tools(evidence, 400)}["plan_drive"]
    result = plan_drive("Kansas City, MO", "Denver, CO")
    for leg in [*result["drive_days"], *result["drive_days_home"]]:
        assert leg["google_maps_url"] in evidence.drive_links


ROUTE_WITH_SHAPE = {"code": "Ok", "routes": [{
    "distance": 965_606.4, "duration": 30_600,
    "geometry": {"type": "LineString", "coordinates": [[-94.5786, 39.0997], [-97.6, 38.8], [-99.3, 38.9], [-102.0, 39.3], [-104.9903, 39.7392]]},
}]}


def test_driving_legs_get_their_route_line_and_end_pin(services):
    from itinerary import ItinerarySnapshot
    from validation import validate_snapshot

    services["route"] = ROUTE_WITH_SHAPE
    evidence = Evidence()
    plan_drive = {t.tool_name: t for t in recording_tools(evidence, 250)}["plan_drive"]
    result = plan_drive("Kansas City, MO", "Denver, CO")
    # The model never sees the route points: they would only cost time.
    assert all("path" not in leg and "end_lat" not in leg for leg in [*result["drive_days"], *result["drive_days_home"]])
    first, home = result["drive_days"][0], result["drive_days_home"][0]

    plan = ItinerarySnapshot.model_validate({
        "startDate": "2026-10-17", "endDate": "2026-10-20", "budget": {"plannedUsd": 900},
        "items": [
            {"id": "d1", "date": "2026-10-17", "title": "Drive to Hays", "category": "Driving", "costUsd": 40, "websiteUrl": first["google_maps_url"]},
            {"id": "h1", "date": "2026-10-20", "title": "Drive home", "category": "Driving", "costUsd": 40, "websiteUrl": home["google_maps_url"]},
            # A route the model made up is dropped.
            {"id": "x", "date": "2026-10-18", "title": "Scenic loop", "category": "Driving", "costUsd": 0, "route": [[1.0, 2.0], [3.0, 4.0]]},
        ],
    })
    cleaned, _ = validate_snapshot(plan, evidence)
    by_id = {item.id: item for item in cleaned.items}
    assert by_id["d1"].route and by_id["d1"].route[0] == [39.0997, -94.5786]
    assert by_id["d1"].location.name == "Hays, Kansas" and by_id["d1"].location.lat is not None
    assert by_id["d1"].websiteUrl == first["google_maps_url"]
    assert by_id["h1"].route[0] == [39.7392, -104.9903]  # the first day home starts in Denver
    assert by_id["x"].route is None

    # A revision keeps the routes the plan already has.
    again, _ = validate_snapshot(cleaned, __import__("evidence").evidence_from_snapshot(cleaned))
    assert {item.id: bool(item.route) for item in again.items} == {"d1": True, "h1": True, "x": False}


def test_route_lines_stay_out_of_the_ai_prompt_but_survive_a_revision(monkeypatch):
    """Route points are for the map: the AI never sees them, and the backend puts them back on unchanged legs."""
    agents = []
    link = "https://www.google.com/maps/dir/?api=1&origin=Kansas+City&destination=Salina"
    path = [[39.1 + i / 1000, -94.6 - i / 100] for i in range(120)]
    leg = {"id": "drive1", "date": "2026-11-14", "title": "Drive Kansas City → Salina", "category": "Driving", "costUsd": 30,
           "websiteUrl": link, "route": path, "location": {"name": "Salina, Kansas", "lat": path[-1][0], "lng": path[-1][1]}}
    current = {"startDate": "2026-11-14", "endDate": "2026-11-15", "budget": {"plannedUsd": 900}, "items": [leg]}

    class Reviser:
        system_prompt = "Roam"

        def __init__(self, kwargs):
            self.tools = kwargs["extra_tools"]
            agents.append(self)

        def __call__(self, prompt):
            # Like the model: copies the leg it saw (no route) and adds a stop.
            seen = {**leg}
            seen.pop("route")
            draft = {**current, "items": [seen, {"id": "lunch", "date": "2026-11-14", "title": "Lunch", "category": "Food", "costUsd": 20}]}
            update, check = self.tools
            check(itinerary=draft)
            update()
            return "Added lunch."

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: Reviser(kwargs))
    app = FastAPI()
    app.include_router(ask_router.router)
    body = TestClient(app).post("/api/ask", json={"prompt": "Add lunch", "travel_mode": "road", "current_itinerary": current}).json()

    prompt = agents[-1].system_prompt
    assert "Current itinerary" in prompt and link in prompt
    assert '"route"' not in prompt and str(path[5][0]) not in prompt
    drive = next(i for i in body["itinerary"]["items"] if i["id"] == "drive1")
    assert drive["route"] == path
