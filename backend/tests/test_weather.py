"""Forecast coverage, units and failure handling, without calling public services."""

from copy import deepcopy

import httpx
import pytest

import tools
from evidence import Evidence, recording_tools
from tools import places, weather

PAYLOAD = {
    "timezone": "America/Chicago",
    "daily_units": {"temperature_2m_max": "°C", "temperature_2m_min": "°C",
                    "precipitation_probability_max": "%", "precipitation_sum": "mm", "wind_speed_10m_max": "km/h"},
    "daily": {"time": ["2026-10-10", "2026-10-11", "2026-10-12"],
              "temperature_2m_max": [24, 20, None], "temperature_2m_min": [15, 11, None],
              "precipitation_probability_max": [10, 90, None], "precipitation_sum": [0, 12, None],
              "wind_speed_10m_max": [8, 25, None]},
}


@pytest.fixture
def services(monkeypatch):
    state = {"payload": deepcopy(PAYLOAD), "status": 200, "calls": [], "timeout": False}

    def handler(request):
        state["calls"].append(request)
        if state["timeout"]:
            raise httpx.ReadTimeout("private upstream detail", request=request)
        return httpx.Response(state["status"], json=state["payload"])

    point = places.GeoPoint(name="Kansas City, Missouri", lat=39.1, lng=-94.58)
    monkeypatch.setattr(places, "geocode", lambda name: point if name else None)
    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    return state


def test_forecast_returns_requested_local_dates_units_and_sources(services):
    result = tools.get_forecast("Kansas City", "2026-10-11", "2026-10-12")
    assert result["status"] == "ok"
    assert [day["date"] for day in result["daily"]] == ["2026-10-11", "2026-10-12"]
    assert result["daily"][0]["precipitation_probability_max"] == 90
    assert result["daily"][1]["temperature_2m_max"] is None  # unavailable is never zero
    assert result["units"]["temperature_2m_max"] == "°C"
    assert result["timezone"] == "America/Chicago" and result["retrieved_at"].endswith("+00:00")
    request = services["calls"][0]
    assert request.url.host == "api.open-meteo.com" and request.url.params["timezone"] == "auto"
    assert request.url.params["forecast_days"] == "16"
    assert request.extensions["timeout"]["read"] == weather.FORECAST_TIMEOUT_S
    assert result["source_urls"] == [str(request.url)]


def test_default_forecast_and_one_day_request(services):
    result = tools.get_forecast("Kansas City")
    assert len(result["daily"]) == 3 and services["calls"][0].url.params["forecast_days"] == "7"
    assert len(tools.get_forecast("Kansas City", "2026-10-11")["daily"]) == 1


@pytest.mark.parametrize("start,end", [("2026-10-09", ""), ("2026-10-11", "2026-10-13"), ("2029-06-18", "")])
def test_dates_outside_actual_coverage_never_get_substitute_weather(services, start, end):
    result = tools.get_forecast("Kansas City", start, end)
    assert result["status"] == "out_of_range" and "daily" not in result
    assert result["coverage_start"] == "2026-10-10" and result["coverage_end"] == "2026-10-12"


@pytest.mark.parametrize("start,end", [("bad", ""), ("2026-02-30", ""), ("20261010", ""),
                                        ("", "2026-10-11"), ("2026-10-12", "2026-10-11")])
def test_bad_dates_fail_before_network(services, start, end):
    assert tools.get_forecast("Kansas City", start, end)["status"] == "error"
    assert services["calls"] == []


@pytest.mark.parametrize("failure", ["http", "timeout", "missing", "mismatched", "invalid", "empty"])
def test_outages_and_malformed_data_are_explicit(services, failure):
    if failure == "http":
        services["status"] = 503
    elif failure == "timeout":
        services["timeout"] = True
    elif failure == "missing":
        services["payload"] = {"error": True}
    elif failure == "mismatched":
        services["payload"]["daily"]["precipitation_sum"] = [0]
    elif failure == "invalid":
        services["payload"]["daily"]["precipitation_probability_max"][0] = 200
    else:
        services["payload"]["daily"] = {"time": [], **{key: [] for key in weather.DAILY_FIELDS}}
    result = tools.get_forecast("Kansas City")
    assert result["status"] == "unavailable" and "daily" not in result
    assert "private upstream" not in result["message"]


def test_unknown_location_and_geocode_outage(services, monkeypatch):
    assert tools.get_forecast("")["status"] == "no_results"

    def unavailable(name):
        raise places.PlacesUnavailable("private upstream detail")

    monkeypatch.setattr(places, "geocode", unavailable)
    assert tools.get_forecast("Kansas City")["status"] == "unavailable"
    assert services["calls"] == []


def test_forecast_is_available_in_the_real_request_tool_set(services):
    tool = {t.tool_name: t for t in recording_tools(Evidence())}["get_forecast"]
    assert tool(near="Kansas City", start_date="2026-10-11")["status"] == "ok"
