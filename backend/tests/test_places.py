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
    assert overpass_hosts == [httpx.URL(url).host for url in places.OVERPASS_URLS]


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


# A Nominatim category search result ("restaurants" inside the box), as the fast path receives it.
NOMINATIM_RESTAURANTS = [
    {"osm_type": "node", "osm_id": 11, "lat": "40.9960", "lon": "17.2230", "category": "amenity", "type": "restaurant",
     "name": "Pescheria Antonio", "extratags": {"cuisine": "seafood", "website": "pescheria.example"},
     "address": {"road": "Via Roma", "house_number": "5", "town": "Polignano a Mare"}},
    {"osm_type": "node", "osm_id": 12, "lat": "40.9955", "lon": "17.2228", "category": "amenity", "type": "restaurant",
     "name": "Pizzeria Mare", "extratags": {"cuisine": "pizza"}},
    # Not a Food place: the fast path must drop it.
    {"osm_type": "node", "osm_id": 13, "lat": "40.9950", "lon": "17.2225", "category": "tourism", "type": "hotel", "name": "Hotel Blu"},
]


@pytest.fixture
def fast_services(services):
    """Nominatim answers geocoding with the town and category searches with NOMINATIM_RESTAURANTS."""
    def handler(request: httpx.Request) -> httpx.Response:
        services["calls"].append(request)
        if "nominatim" in request.url.host:
            category_search = "viewbox" in request.url.params
            return httpx.Response(200, json=NOMINATIM_RESTAURANTS if category_search else NOMINATIM_HIT)
        return httpx.Response(services["overpass_status"], json=services["overpass"])

    places._client = httpx.Client(transport=httpx.MockTransport(handler))
    return services


def test_search_uses_fast_nominatim_path_without_overpass(fast_services):
    found = places.search_places("Polignano a Mare", "Food", "seafood", radius_m=1500)
    assert [place.name for place in found] == ["Pescheria Antonio"]
    place = found[0]
    assert place.cuisine == "seafood" and place.website_url == "https://pescheria.example"
    assert place.address == "Via Roma 5, Polignano a Mare"
    assert place.source_urls == ["https://www.openstreetmap.org/node/11"]
    search = [call for call in fast_services["calls"] if "viewbox" in call.url.params][0]
    searched = [call.url.params["q"] for call in fast_services["calls"] if "viewbox" in call.url.params]
    assert searched == ["seafood", "restaurants"] and search.url.params["bounded"] == "1"
    assert not [call for call in fast_services["calls"] if "nominatim" not in call.url.host]


def test_keyword_that_names_a_phrase_picks_it(fast_services):
    places.search_places("Polignano a Mare", "Food", "cafe")
    search = [call for call in fast_services["calls"] if "viewbox" in call.url.params][0]
    assert search.url.params["q"] == "cafes"


def test_fast_path_with_no_match_falls_back_to_overpass(fast_services):
    found = places.search_places("Polignano a Mare", "Food", "sushi")
    assert any("overpass" in call.url.host for call in fast_services["calls"])
    assert found  # the Overpass fixture still answers


def test_model_category_aliases_and_no_retry_message(fast_services):
    result = tools.find_places("Polignano a Mare", "restaurant", keyword="seafood")
    assert result["status"] == "ok" and result["places"][0]["name"] == "Pescheria Antonio"
    assert tools.find_places("Polignano a Mare", "Nightlife")["status"] == "error"
    fast_services["overpass_status"] = 500
    places.clear_caches()
    unavailable = tools.find_places("Polignano a Mare", "Food", keyword="sushi")
    assert unavailable["status"] == "unavailable" and "Do not retry" in unavailable["message"]


def test_phrase_keywords_match_whole_words():
    assert places._phrases_for("Food", "barbecue") == (("restaurants",), "barbecue")
    assert places._phrases_for("Food", "cocktail bars") == (("bars",), None)
    assert places._phrases_for("Activities", "art galleries") == (("galleries",), None)
    assert places._phrases_for("Activities", "parks") == (("parks",), None)
    assert places._phrases_for("Activities", "jazz") == (("attractions", "museums", "parks"), "jazz")
