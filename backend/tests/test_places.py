"""Tests for the place lookup. The map services are replaced with canned responses, so these run offline.

Run inside the backend container:  docker compose exec backend python -m pytest
"""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import tools
from routers import places as places_router
from tools import places

NOMINATIM_HIT = [{"display_name": "Polignano a Mare, Bari, Apulia, Italy", "lat": "40.9951", "lon": "17.2224", "osm_type": "relation"}]

OVERPASS_HIT = {
    "elements": [
        {"type": "node", "id": 1, "lat": 40.9953, "lon": 17.2226, "tags": {"amenity": "restaurant", "name": "Plain Trattoria"}},
        {
            "type": "way",
            "id": 2,
            "center": {"lat": 40.9960, "lon": 17.2200},
            "tags": {
                "amenity": "restaurant",
                "name": "Grotta Palazzese",
                "cuisine": "seafood;italian",
                "website": "www.grottapalazzese.it",
                "wikidata": "Q1",
                "addr:street": "Via Narciso",
                "addr:housenumber": "59",
                "addr:city": "Polignano a Mare",
                "opening_hours": "Mo-Su 12:30-15:00,19:30-22:30",
            },
        },
        # Same place mapped a second time as a point: must not appear twice.
        {"type": "node", "id": 3, "lat": 40.99601, "lon": 17.22001, "tags": {"amenity": "restaurant", "name": "Grotta Palazzese"}},
        # No name, and a script link: both must be dropped or cleaned.
        {"type": "node", "id": 4, "lat": 40.9955, "lon": 17.2225, "tags": {"amenity": "cafe"}},
        {"type": "node", "id": 5, "lat": 40.9990, "lon": 17.2300, "tags": {"amenity": "cafe", "name": "Odd Cafe", "website": "javascript:alert(1)"}},
    ]
}


@pytest.fixture
def services(monkeypatch):
    """Swap the real HTTP client for one that answers from `calls`-recording canned data."""
    state = {"nominatim": NOMINATIM_HIT, "overpass": OVERPASS_HIT, "overpass_status": 200, "calls": []}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"].append(request)
        if "nominatim" in request.url.host:
            return httpx.Response(200, json=state["nominatim"])
        return httpx.Response(state["overpass_status"], json=state["overpass"])

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    places.clear_caches()
    yield state
    places.clear_caches()


def test_geocode_returns_coordinates(services):
    point = places.geocode("  Polignano   a Mare ")
    assert point is not None and (point.lat, point.lng) == (40.9951, 17.2224)
    assert services["calls"][0].url.params["q"] == "Polignano a Mare"


def test_geocode_unknown_place_is_none_and_cached(services):
    services["nominatim"] = []
    assert places.geocode("Nowhereville") is None
    assert places.geocode("nowhereville") is None
    assert len(services["calls"]) == 1


def test_search_ranks_documented_places_first_and_cleans_results(services):
    found = places.search_places("Polignano a Mare", "Food")
    assert [place.name for place in found] == ["Grotta Palazzese", "Plain Trattoria", "Odd Cafe"]

    top = found[0]
    assert top.category == "Food" and top.kind == "restaurant"
    assert top.website_url == "https://www.grottapalazzese.it"
    assert top.cuisine == "seafood, italian"
    assert top.address == "Via Narciso 59, Polignano a Mare"
    assert top.source_urls == ["https://www.openstreetmap.org/way/2"]
    assert 150 < top.distance_m < 300
    # A non-web link from the map data is never passed on.
    assert found[2].website_url is None


def test_search_sends_category_keyword_and_radius_to_overpass(services):
    places.search_places("Polignano a Mare", "Food", keyword='sea"food;', radius_m=1500)
    query = httpx.QueryParams(services["calls"][-1].content.decode())["data"]
    assert "around:1500,40.995100,17.222400" in query
    assert '["amenity"~"^(restaurant|cafe|' in query
    # The quote and semicolon that could break out of the query are neutralised.
    assert '["name"~"sea.food.",i]' in query and '["cuisine"~"sea.food.",i]' in query


def test_search_limits_and_caches(services):
    assert len(places.search_places("Polignano a Mare", "Food", limit=1)) == 1
    before = len(services["calls"])
    places.search_places("polignano a mare", "Food", limit=1)
    assert len(services["calls"]) == before


def test_search_unknown_location_returns_nothing(services):
    services["nominatim"] = []
    assert places.search_places("Nowhereville", "Stays") == []


def test_search_tries_the_backup_server_then_reports_unavailable(services):
    services["overpass_status"] = 504
    with pytest.raises(places.PlacesUnavailable):
        places.search_places("Polignano a Mare", "Activities")
    overpass_hosts = [call.url.host for call in services["calls"] if "nominatim" not in call.url.host]
    assert overpass_hosts == ["overpass-api.de", "overpass.kumi.systems"]


def test_agent_tool_never_raises(services):
    assert tools.find_places("Polignano a Mare", "Food")["status"] == "ok"
    assert tools.find_places("Polignano a Mare", "Nightlife")["status"] == "error"
    services["overpass_status"] = 500
    places.clear_caches()
    result = tools.find_places("Polignano a Mare", "Food")
    assert result["status"] == "unavailable" and result["places"] == []
    assert tools.locate("Polignano a Mare")["lat"] == 40.9951


def test_endpoints(services):
    app = FastAPI()
    app.include_router(places_router.router)
    client = TestClient(app)

    response = client.get("/api/places/search", params={"near": "Polignano a Mare", "category": "Food", "limit": 2})
    assert response.status_code == 200
    assert [place["name"] for place in response.json()] == ["Grotta Palazzese", "Plain Trattoria"]

    assert client.get("/api/places/search", params={"near": "Polignano a Mare", "category": "Nightlife"}).status_code == 422
    assert client.get("/api/places/locate", params={"q": "Polignano a Mare"}).json()["lng"] == 17.2224

    services["nominatim"] = []
    places.clear_caches()
    assert client.get("/api/places/locate", params={"q": "Nowhereville"}).status_code == 404

    services["nominatim"] = NOMINATIM_HIT
    services["overpass_status"] = 503
    places.clear_caches()
    assert client.get("/api/places/search", params={"near": "Polignano a Mare", "category": "Stays"}).status_code == 503
