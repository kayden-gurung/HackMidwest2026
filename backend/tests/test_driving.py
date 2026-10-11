"""Tests for the road trip estimate. The map and routing services are replaced with canned responses."""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import tools
from routers import places as places_router
from tools import driving, places

COORDINATES = {
    "kansas city, mo": {"display_name": "Kansas City, Missouri, United States", "lat": "39.0997", "lon": "-94.5786"},
    "denver, co": {"display_name": "Denver, Colorado, United States", "lat": "39.7392", "lon": "-104.9903"},
    "honolulu, hi": {"display_name": "Honolulu, Hawaii, United States", "lat": "21.3069", "lon": "-157.8583"},
}
# About 600 miles and 8.5 hours, roughly the real Kansas City to Denver drive.
ROUTE = {"code": "Ok", "routes": [{"distance": 965_606.4, "duration": 30_600}]}


@pytest.fixture
def services(monkeypatch):
    state = {"route_status": 200, "route": ROUTE, "calls": []}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"].append(request)
        if "nominatim" in request.url.host:
            hit = COORDINATES.get(request.url.params["q"].lower())
            return httpx.Response(200, json=[hit] if hit else [])
        if "157.858300" in request.url.path:
            return httpx.Response(400, json={"code": "NoRoute", "message": "Impossible route between points"})
        return httpx.Response(state["route_status"], json=state["route"])

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    monkeypatch.delenv("ROAM_CAR_MPG", raising=False)
    monkeypatch.delenv("ROAM_GAS_USD_PER_GALLON", raising=False)
    places.clear_caches()
    driving.clear_cache()
    yield state
    places.clear_caches()
    driving.clear_cache()


def test_estimate_gives_distance_time_and_round_trip_fuel(services):
    estimate = driving.estimate_drive("Kansas City, MO", "Denver, CO")
    assert estimate is not None
    assert estimate.distance_miles == 600
    assert estimate.drive_hours == 8.5
    assert estimate.driving_days_each_way == 2
    # 1,200 miles there and back / 27 mpg * $3.40
    assert estimate.fuel_cost_usd == 151
    assert "27 miles per gallon and $3.40 per gallon" in estimate.assumptions[0]
    assert "travelmode=driving" in estimate.google_maps_url and "Kansas+City" in estimate.google_maps_url
    # OSRM takes longitude first.
    assert services["calls"][-1].url.path.endswith("/-94.578600,39.099700;-104.990300,39.739200")


def test_one_way_and_custom_assumptions(services, monkeypatch):
    monkeypatch.setenv("ROAM_CAR_MPG", "30")
    monkeypatch.setenv("ROAM_GAS_USD_PER_GALLON", "4")
    estimate = driving.estimate_drive("Kansas City, MO", "Denver, CO", round_trip=False)
    assert estimate.fuel_cost_usd == 80
    assert estimate.assumptions[0].endswith("one way.")


def test_no_road_or_unknown_place_is_none(services):
    assert driving.estimate_drive("Kansas City, MO", "Honolulu, HI") is None
    assert driving.estimate_drive("Kansas City, MO", "Nowhereville") is None


def test_routing_outage_is_reported_and_tool_never_raises(services):
    services["route_status"] = 502
    with pytest.raises(places.PlacesUnavailable):
        driving.estimate_drive("Kansas City, MO", "Denver, CO")
    assert tools.plan_drive("Kansas City, MO", "Denver, CO")["status"] == "unavailable"

    services["route_status"] = 200
    assert tools.plan_drive("Kansas City, MO", "Denver, CO")["distance_miles"] == 600
    assert tools.plan_drive("Kansas City, MO", "Honolulu, HI")["status"] == "no_route"


def test_drive_endpoint(services):
    app = FastAPI()
    app.include_router(places_router.router)
    client = TestClient(app)
    response = client.get("/api/places/drive", params={"origin": "Kansas City, MO", "destination": "Denver, CO"})
    assert response.status_code == 200 and response.json()["fuel_cost_usd"] == 151
    assert client.get("/api/places/drive", params={"origin": "Kansas City, MO", "destination": "Honolulu, HI"}).status_code == 404


def test_miles_per_day_limit_splits_the_drive(services):
    # 600 miles: 2 days by the 6-hour rule, 3 days with a 250-mile daily limit.
    estimate = driving.estimate_drive("Kansas City, MO", "Denver, CO", max_miles_per_day=250)
    assert estimate.driving_days_each_way == 3 and estimate.max_miles_per_day == 250
    assert any("under 250 miles" in line for line in estimate.assumptions)
    assert tools.plan_drive("Kansas City, MO", "Denver, CO", max_miles_per_day=250)["driving_days_each_way"] == 3
    # A generous limit never shortens the 6-hour rule.
    assert driving.estimate_drive("Kansas City, MO", "Denver, CO", max_miles_per_day=900).driving_days_each_way == 2
