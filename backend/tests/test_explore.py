import httpx
import pytest
from fastapi.testclient import TestClient

import main
from tools import explore, places

START = places.GeoPoint(name="Kansas City, Missouri", lat=39.1, lng=-94.58)


def result(name, lat, lng, category="leisure", kind="park", town="Boonville", osm_id=1, **tags):
    return {"name": name, "lat": str(lat), "lon": str(lng), "category": category, "type": kind,
            "osm_type": "way", "osm_id": osm_id, "extratags": tags,
            "address": {"town": town, "ISO3166-2-lvl4": "US-MO"}}


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self.body


@pytest.fixture
def services(monkeypatch):
    """Nominatim answers per phrase; OSRM's table gives each spot (index + 1) * 30 minutes, (index + 1) * 25 miles."""
    explore.clear_cache()
    answers: dict[str, list] = {}
    calls = {"table": 0}
    monkeypatch.setattr(places, "geocode", lambda name: START if name == "Kansas City, MO" else None)
    monkeypatch.setattr(places, "nominatim_request", lambda url, params: answers.get(params["q"], []))

    class Http:
        def get(self, url, params=None, timeout=None):
            assert "/table/v1/driving/" in url and params["sources"] == "0"
            calls["table"] += 1
            count = url.rsplit("/", 1)[1].count(";")
            return FakeResponse({"durations": [[0] + [(i + 1) * 1800 for i in range(count)]],
                                 "distances": [[0] + [(i + 1) * 25 * 1609.344 for i in range(count)]]})

    monkeypatch.setattr(places, "_http", lambda: Http())
    yield answers, calls
    explore.clear_cache()


def test_spots_are_real_stops_away_from_the_start(services):
    answers, _ = services
    answers["riverfront park"] = [
        result("Riverfront Park", 38.97, -92.74, town="Boonville", osm_id=1, wikipedia="en:Boonville Riverfront"),
        # A road, an unnamed park, a generic label, a campground and a park inside the starting city are not stops.
        result("River Road", 38.9, -93.0, category="highway", kind="residential", osm_id=2),
        result("", 38.8, -93.1, osm_id=3),
        result("Riverfront", 38.7, -93.2, osm_id=4),
        result("Riverfront Park Campground", 38.6, -93.3, osm_id=6),
        result("Berkley Riverfront Park", 39.11, -94.57, town="Kansas City", osm_id=5),
    ]
    found = explore.explore_theme("river-towns", "Kansas City, MO")
    assert [spot.name for spot in found.spots] == ["Riverfront Park"]
    spot = found.spots[0]
    assert (spot.town, spot.kind, spot.drive_minutes, spot.drive_miles) == ("Boonville, MO", "Riverfront", 30, 25.0)
    assert spot.wikipedia_url == "https://en.wikipedia.org/wiki/Boonville_Riverfront"
    assert spot.source_url == "https://www.openstreetmap.org/way/1"
    assert (found.origin.lat, found.origin.lng, found.title) == (39.1, -94.58, "River towns")


def test_best_documented_first_two_per_town_nearest_shown_first_and_cached(services):
    answers, calls = services
    answers["state park"] = [
        result("Plain Park", 38.5, -93.0, kind="park", town="Sedalia", osm_id=1),
        result("Famous State Park", 38.0, -92.0, town="Camdenton", osm_id=2, wikidata="Q1", website="https://example.org"),
        result("Second State Park", 38.1, -92.1, town="Camdenton", osm_id=3, wikidata="Q2"),
        result("Third State Park", 38.2, -92.2, town="Camdenton", osm_id=4, wikidata="Q3"),
    ]
    found = explore.explore_theme("trailheads", "Kansas City, MO")
    # Third is dropped: two per town. The table measures them in notability order, so Famous is nearest.
    assert [spot.name for spot in found.spots] == ["Famous State Park", "Second State Park", "Plain Park"]
    assert found.spots[0].website_url == "https://example.org"
    # A different time limit filters the same measured spots: no new lookups.
    assert explore.explore_theme("trailheads", "Kansas City, MO", max_hours=1).spots == found.spots[:2]
    assert calls["table"] == 1


def test_spots_beyond_the_time_limit_are_left_out(services):
    answers, _ = services
    answers["state historic site"] = [result(f"Site {i}", 38.0 + i / 10, -92.0, town=f"Town {i}", osm_id=i, category="historic", kind="fort")
                                      for i in range(4)]
    found = explore.explore_theme("historic-main-streets", "Kansas City, MO", max_hours=1.5)
    assert [spot.drive_minutes for spot in found.spots] == [30, 60, 90]
    assert all(spot.kind == "Historic site" for spot in found.spots)


def test_unknown_origin_and_unknown_theme(services):
    assert explore.explore_theme("trailheads", "Nowhere") is None
    with pytest.raises(ValueError):
        explore.explore_theme("beaches", "Kansas City, MO")


def test_api(services, monkeypatch):
    answers, _ = services
    answers["state park"] = [result("Knob Noster State Park", 38.76, -93.6, town="Knob Noster", osm_id=9)]
    client = TestClient(main.app)
    body = client.get("/api/explore/trailheads", params={"origin": "Kansas City, MO"}).json()
    assert body["spots"][0]["name"] == "Knob Noster State Park" and body["max_hours"] == 3
    assert client.get("/api/explore/trailheads", params={"origin": "Nowhere"}).status_code == 404
    assert client.get("/api/explore/beaches").status_code == 422

    def down(*args, **kwargs):
        raise httpx.ConnectError("down")

    explore.clear_cache()
    monkeypatch.setattr(places, "_http", lambda: type("Down", (), {"get": down})())
    assert client.get("/api/explore/trailheads", params={"origin": "Kansas City, MO"}).status_code == 503


def test_route_is_thinned_and_flipped_to_lat_lng(monkeypatch):
    path = [[-94.0 + i / 1000, 39.0] for i in range(1001)]
    monkeypatch.setattr(explore, "road_routes", lambda points: [{"miles": 50.04, "minutes": 61.4, "coordinates": path}])
    route = explore.route_to(39.0, -94.0, 39.0, -93.0)
    assert (route.miles, route.minutes) == (50.0, 61)
    assert len(route.path) <= explore.MAX_ROUTE_POINTS + 1
    assert route.path[0] == [39.0, -94.0] and route.path[-1] == [39.0, -93.0]
    monkeypatch.setattr(explore, "road_routes", lambda points: [])
    assert TestClient(main.app).get("/api/explore/route", params={"from_lat": 39, "from_lng": -94, "to_lat": 39, "to_lng": -93}).status_code == 404
