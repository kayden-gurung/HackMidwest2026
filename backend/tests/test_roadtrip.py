from copy import deepcopy

import httpx
import pytest
from fastapi.testclient import TestClient

import agent
import main
import roadtrip
from agent_runs import runs
from evidence import Evidence, recording_tools
from itinerary import ItinerarySnapshot, ItineraryUpdates
from orchestration import specialist_tools
from routers.ask import AskRequest, checked_updates
from schemas import RoadTripPreferences
from tests.test_orchestration import ScriptedModel, call, checked_update, events
from tools import places
from tools.driving import road_routes


def preferences(**changes):
    return RoadTripPreferences(origin="Start", destination="End", detour_minutes=60, mpg=30, gas_price=3, **changes)


def plan(stops=1):
    return ItinerarySnapshot.model_validate({"startDate": "2026-10-17", "endDate": "2026-10-17",
        "budget": {"plannedUsd": 100}, "items": [
            {"id": f"stop-{index}", "date": "2026-10-17", "title": f"Town {index}", "category": "Activities",
             "costUsd": None, "location": {"name": f"Town {index}", "lat": 0, "lng": index},
             "sourceUrls": [f"https://www.openstreetmap.org/node/{index}"]} for index in range(1, stops + 1)]})


@pytest.fixture
def providers(monkeypatch):
    calls = []
    def geocode(name):
        lng = {"Start": 0, "End": 3, "Town 1": 1, "Town 2": 2, "Large city": 1.5}[name]
        return places.GeoPoint(name=name, lat=0, lng=lng, kind="city" if name in {"Start", "End", "Large city"} else "town",
                               source_url=f"https://www.openstreetmap.org/node/{lng}")
    def route(points, alternatives=False):
        calls.append((deepcopy(points), alternatives))
        miles, minutes = (120, 120) if len(points) == 2 else (130, 135) if len(points) == 3 else (170, 210)
        geometry = [[lng, lat] for lat, lng in points] if len(points) > 2 else [[0, 0], [1, 0], [2, 0], [3, 0]]
        return [{"miles": miles, "minutes": minutes, "coordinates": geometry}]
    monkeypatch.setattr(places, "geocode", geocode)
    monkeypatch.setattr(roadtrip, "road_routes", route)
    monkeypatch.setattr("routers.ask.pin_stops", lambda items, evidence: None)
    yield calls
    for run_id in list(runs._runs):
        runs.discard(run_id)


def test_complete_route_is_measured_and_fuel_overrides_model_values(providers):
    planner = roadtrip.RoadTripPlanner(preferences(), None, 450)
    candidate = plan()
    validated = planner.validate(candidate)
    assert candidate.roadTrip is None  # no mutation of traveler or model data
    assert validated.roadTrip.distanceMiles == 130
    assert validated.roadTrip.detourMinutes == 15
    assert validated.roadTrip.fuelCostUsd == 13
    assert validated.roadTrip.extraFuelCostUsd == 1
    assert validated.items[0].category == "Driving"
    assert validated.items[0].costUsd == 13
    assert validated.items[0].route == [[0, 0], [0, 1], [0, 3]]
    assert validated.items[1].costUsd is None


def test_combined_detour_and_unverified_stops_cannot_be_published(providers):
    planner = roadtrip.RoadTripPlanner(preferences(), None, 450)
    with pytest.raises(ValueError, match="complete route adds 90.0"):
        planner.validate(plan(2))
    candidate = plan()
    candidate.items[0].sourceUrls = []
    with pytest.raises(ValueError, match="exact location and source"):
        planner.validate(candidate)
    with pytest.raises(ValueError, match="at least 3 driving days"):
        roadtrip.RoadTripPlanner(preferences(), None, 50).validate(plan())


def test_missing_alternative_is_reported_without_changing_route_selection(providers):
    planner = roadtrip.RoadTripPlanner(preferences(), None, 450)
    assert planner.plan_drive(alternative=True)["status"] == "unavailable"
    assert planner.route_option == 0
    assert planner.plan_drive()["status"] == "ok"


def test_towns_are_verified_filtered_and_recorded_as_evidence(providers, monkeypatch):
    monkeypatch.setattr(places, "town_at", lambda lat, lng: "Town 1" if lng < 1.5 else "Large city")
    planner = roadtrip.RoadTripPlanner(preferences(), None, 450)
    evidence = Evidence()
    tools = recording_tools(evidence, 450, planner)
    town_tool = next(tool for tool in tools if tool.tool_name == "find_route_towns")
    result = town_tool()
    assert [town["name"] for town in result["towns"]] == ["Town 1"]
    assert evidence.known_source("https://www.openstreetmap.org/node/1") is not None
    assert planner.find_route_towns(exclude=["Town 1"])["status"] == "no_results"
    planner.current = plan()
    assert planner.find_route_towns()["status"] == "no_results"
    _, specialists = specialist_tools(ScriptedModel([]), tools)
    assert "find_route_towns" in specialists["places"].tool_names


def test_place_replacement_excludes_current_sources(providers, monkeypatch):
    monkeypatch.setattr("tools.find_places", lambda *args: {"status": "ok", "places": [
        {"name": "Already selected", "lat": 0, "lng": 1, "source_urls": ["https://www.openstreetmap.org/node/1"]},
        {"name": "New lunch", "lat": 0, "lng": 1.2, "source_urls": ["https://www.openstreetmap.org/node/12"]}]})
    planner = roadtrip.RoadTripPlanner(preferences(), plan(), 450)
    tool = next(tool for tool in recording_tools(Evidence(), 450, planner) if tool.tool_name == "find_places")
    result = tool(near="End", category="Food", exclude_current=True)
    assert [place["name"] for place in result["places"]] == ["New lunch"]


@pytest.mark.parametrize("approved", [True, False])
def test_real_strands_review_uses_measured_cost_and_exact_frozen_route(providers, monkeypatch, approved):
    candidate = plan()
    candidate.items[0].title = "New town stop"
    model = ScriptedModel([checked_update(candidate.model_dump(mode="json"), "road-replan"), {"text": "Finished."}])
    monkeypatch.setattr(agent, "build_model", lambda: model)
    body = {"prompt": "Replace this town", "current_itinerary": plan().model_dump(mode="json"),
            "road_trip": preferences().model_dump(), "max_drive_miles_per_day": 450}
    client = TestClient(main.app)
    initial = events(client.post("/api/ask/stream", json=body))
    approval = next(ev["approval"] for ev in initial if "approval" in ev)
    preview = approval["interrupts"][0]["reason"]
    assert preview["after_total_usd"] == 13
    assert preview["itinerary"]["roadTrip"]["detourMinutes"] == 15
    assert not any("itinerary" in ev for ev in initial)
    route_calls = len(providers)
    resumed = events(client.post(f"/api/ask/{approval['run_id']}/resume", json={
        "approved": approved, "interrupt_ids": [item["id"] for item in approval["interrupts"]]}))
    assert len(providers) == route_calls
    if approved:
        assert next(ev["itinerary"] for ev in resumed if "itinerary" in ev) == preview["itinerary"]
        reply = next(ev["reply"] for ev in resumed if "reply" in ev)
        assert "one-way drive" in reply and "$13.00" in reply
        assert "round-trip" not in reply and reply != "Finished."
    else:
        assert not any("itinerary" in ev for ev in resumed)


def test_budget_specialist_reads_measured_draft_and_failures_clear_it(providers):
    updates, evidence = checked_updates(AskRequest(prompt="Plan", road_trip=preferences()))
    for index in (1, 2):
        evidence.add_point(places.geocode(f"Town {index}").model_dump())
    result = updates.check_budget(plan())
    assert result["estimated_total_usd"] == 13
    assert updates.review_draft.roadTrip.fuelCostUsd == 13
    with pytest.raises(ValueError, match="exceeding"):
        updates.check_budget(plan(2))
    assert updates.checked_draft is None
    assert updates.update_itinerary()["status"] == "budget_check_required"


def test_osrm_request_uses_waypoints_and_rejects_malformed_geometry(monkeypatch):
    seen = []
    def handle(request):
        seen.append(request)
        return httpx.Response(200, json={"code": "Ok", "routes": [
            {"distance": 1609.344, "duration": 120, "geometry": {"coordinates": [[-94, 39], [-93, 38]]}},
            {"distance": 1609, "duration": 120, "geometry": {"coordinates": [[999, 39], [-93, 38]]}}]})
    monkeypatch.setattr(places, "_http", lambda: httpx.Client(transport=httpx.MockTransport(handle)))
    assert len(road_routes([(39, -94), (38, -93)], alternatives=True)) == 1
    assert seen[0].url.params["alternatives"] == "true"
    assert "-94.000000,39.000000;-93.000000,38.000000" in str(seen[0].url)


def test_invalid_road_preferences_return_422_without_inference():
    invalid = preferences().model_dump()
    invalid["mpg"] = 0
    assert TestClient(main.app).post("/api/ask", json={"prompt": "Plan", "road_trip": invalid}).status_code == 422


def test_same_draft_is_remeasured_after_alternative_selection(providers, monkeypatch):
    def routes(points, alternatives=False):
        base = {"miles": 130, "minutes": 135, "coordinates": [[0, 0], [1, 0], [3, 0]]}
        alternate = {"miles": 140, "minutes": 145, "coordinates": [[0, 0], [1, .1], [3, 0]]}
        return [base, alternate] if alternatives else [base]
    monkeypatch.setattr(roadtrip, "road_routes", routes)
    updates, evidence = checked_updates(AskRequest(prompt="Plan", road_trip=preferences()))
    evidence.add_point(places.geocode("Town 1").model_dump())
    assert updates.check_budget(plan())["road_trip"]["routeOption"] == 0
    planner = updates.roadtrip_planner
    assert planner.plan_drive(alternative=True)["route_option"] == 1
    assert planner.plan_drive(alternative=True)["route_option"] == 1
    assert updates.check_budget(plan())["road_trip"]["routeOption"] == 1
    assert updates.review_draft.roadTrip.fuelCostUsd == 14
    assert updates.update_itinerary()["status"] == "updated"
    assert updates.latest.items[0].route == [[0, 0], [.1, 1], [0, 3]]


@pytest.mark.parametrize("streaming", [True, False])
def test_three_failed_drafts_stop_with_actionable_error_and_no_publication(providers, monkeypatch, streaming):
    candidate = plan(2).model_dump(mode="json")
    model = ScriptedModel([call("check_budget", {"itinerary": candidate}, f"bad-{index}") for index in range(3)])
    monkeypatch.setattr(agent, "build_model", lambda: model)
    body = {"prompt": "Plan", "road_trip": preferences().model_dump(), "current_itinerary": plan().model_dump(mode="json")}
    response = TestClient(main.app).post("/api/ask/stream" if streaming else "/api/ask", json=body)
    if streaming:
        result = events(response)
        error = next(ev for ev in result if "error" in ev)
        assert error["status"] == 422
        assert "after three drafts" in error["error"]
        assert not any("itinerary" in ev or "approval" in ev for ev in result)
    else:
        assert response.status_code == 422
        assert "after three drafts" in response.json()["detail"]
    assert len(model.seen) == 3


def test_preview_does_not_silently_drop_excess_waypoints(providers):
    planner = roadtrip.RoadTripPlanner(preferences(), None, 450)
    result = planner.plan_drive(via=["Town 1"] * 11)
    assert result["status"] == "unavailable"
    assert "at most ten" in result["message"]
    assert not providers
