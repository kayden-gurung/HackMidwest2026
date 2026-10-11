"""Verified source edits and real SDK consent/cancellation on the faster road-trip path."""

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

import agent
import main
from evidence import recording_tools
from itinerary import ItinerarySnapshot
from roadtrip_actions import roadtrip_actions
from routers.ask import AskRequest, checked_updates
from tests.test_orchestration import ScriptedModel, call, events
from tests.test_roadtrip import plan, preferences, providers


def actions(current=None):
    body = AskRequest(prompt="Plan", road_trip=preferences(), current_itinerary=current)
    updates, evidence = checked_updates(body)
    evidence.add_place({"name": "Verified Cafe", "category": "Food", "lat": 0, "lng": 1,
                       "source_urls": ["https://www.openstreetmap.org/node/cafe"],
                       "website_url": "https://cafe.example/", "address": "Main Street"})
    tools = recording_tools(evidence, 450, updates.roadtrip_planner)
    by_name = {item.tool_name: item for item in roadtrip_actions(body, updates, evidence, tools)}
    return body, updates, evidence, by_name


def test_new_plan_uses_verified_source_facts_unknown_price_and_measured_fuel(providers):
    _, updates, _, tools = actions()
    result = tools["create_road_trip"](stops=[{"source_url": "https://www.openstreetmap.org/node/cafe"}], start_date="2026-10-17")
    assert result["road_trip"]["fuelCostUsd"] == 13
    assert result["unknown_costs"]
    assert updates.latest is None
    draft = updates.review_draft
    cafe = next(item for item in draft.items if item.category == "Food")
    assert cafe.title == "Verified Cafe" and cafe.costUsd is None
    assert cafe.location.lat == 0 and cafe.location.lng == 1
    assert cafe.websiteUrl == "https://cafe.example/"
    assert draft.overview.destination == "End"
    assert updates.update_itinerary()["status"] == "updated"


def test_new_plan_computes_sufficient_driving_dates_and_checks_total_detour(providers):
    body, updates, evidence, tools = actions()
    updates.roadtrip_planner.max_miles = 50
    tools["create_road_trip"](stops=[{"source_url": "https://www.openstreetmap.org/node/cafe"}], start_date="2026-10-17")
    assert updates.review_draft.endDate.isoformat() == "2026-10-19"
    assert len([item for item in updates.review_draft.items if item.category == "Driving"]) == 3
    evidence.add_place({"name": "Another Cafe", "category": "Food", "lat": 0, "lng": 2,
                        "source_urls": ["https://www.openstreetmap.org/node/other"]})
    with pytest.raises(ValueError, match="exceeding"):
        tools["create_road_trip"](stops=[{"source_url": "https://www.openstreetmap.org/node/cafe"},
                                        {"source_url": "https://www.openstreetmap.org/node/other"}])
    assert updates.checked_draft is None


def test_replacement_preserves_ids_dates_metadata_and_unaffected_stops(providers):
    current = plan(2)
    original = current.model_dump()
    _, updates, _, tools = actions(current)
    tools["edit_stops"](remove_ids=["stop-2"], replacements=[{"stop_id": "stop-1", "source_url": "https://www.openstreetmap.org/node/cafe"}])
    cafe = next(item for item in updates.review_draft.items if item.category != "Driving")
    assert cafe.id == "stop-1" and cafe.date == current.items[0].date and cafe.time == current.items[0].time
    assert cafe.category == "Food" and cafe.costUsd is None
    assert current.model_dump() == original
    assert updates.latest is None


@pytest.mark.parametrize("change", [
    {"remove_ids": ["unknown"]},
    {"remove_ids": ["road-drive-1"]},
    {"remove_ids": ["stop-1", "stop-1"]},
    {"remove_ids": ["stop-1"], "replacements": [{"stop_id": "stop-1", "source_url": "https://www.openstreetmap.org/node/cafe"}]},
    {"replacements": [{"stop_id": "stop-1", "source_url": "https://fake.example/invented"}]},
    {"additions": [{"source_url": "https://www.openstreetmap.org/node/cafe", "day": 2}]},
])
def test_invalid_edits_are_atomic_and_clear_a_previous_draft(providers, change):
    current = plan()
    _, updates, _, tools = actions(current)
    tools["edit_stops"]()
    before = current.model_dump()
    with pytest.raises(ValueError):
        tools["edit_stops"](**change)
    assert updates.checked_draft is None
    assert updates.update_itinerary()["status"] == "budget_check_required"
    assert current.model_dump() == before


@pytest.mark.parametrize("approved", [True, False])
def test_one_model_call_replan_and_resume_keeps_native_consent(providers, monkeypatch, approved):
    current = plan()
    model = ScriptedModel([{"tools": [
        {"name": "edit_stops", "input": {"remove_ids": ["stop-1"]}, "id": "edit"},
        {"name": "update_itinerary", "input": {}, "id": "publish"},
    ]}])
    monkeypatch.setattr(agent, "build_model", lambda: model)
    client = TestClient(main.app)
    initial = events(client.post("/api/ask/stream", json={"prompt": "Remove this stop", "road_trip": preferences().model_dump(),
                   "current_itinerary": current.model_dump(mode="json")}))
    approval = next(item["approval"] for item in initial if "approval" in item)
    preview = approval["interrupts"][0]["reason"]["itinerary"]
    assert len(model.seen) == 1
    assert not any("itinerary" in item for item in initial)
    assert "research_places" not in model.seen[0]["tools"]
    assert {"plan_drive", "find_places", "create_road_trip", "edit_stops"} <= model.seen[0]["tools"]
    calls = deepcopy(providers)
    resumed = events(client.post(f"/api/ask/{approval['run_id']}/resume", json={"approved": approved,
                    "interrupt_ids": [item["id"] for item in approval["interrupts"]]}))
    assert providers == calls  # approved publication uses the frozen route; no repeated lookup
    assert len(model.seen) == 1  # no model call after commit or denial
    assert not any("model_started" == item.get("xray", {}).get("kind") for item in resumed)
    if approved:
        assert next(item["itinerary"] for item in resumed if "itinerary" in item) == preview
    else:
        assert not any("itinerary" in item for item in resumed)
        assert next(item["reply"] for item in resumed if "reply" in item).startswith("Kept your current plan")


@pytest.mark.parametrize("streaming", [True, False])
def test_published_road_trip_finishes_without_final_model_narration(providers, monkeypatch, streaming):
    forecasts = []
    monkeypatch.setattr("tools.fetch_forecast", lambda *args: forecasts.append(args))
    monkeypatch.setattr("tools.find_places", lambda *args: {"status": "ok", "places": [{
        "name": "Town 1 Museum", "category": "Activities", "lat": 0, "lng": 1,
        "source_urls": ["https://www.openstreetmap.org/node/1"]}]})
    model = ScriptedModel([{"tools": [
        {"name": "research_stops", "input": {"towns": ["Town 1"], "categories": ["Activities"]}, "id": "lookup"},
        {"name": "create_road_trip", "input": {"stops": [{"source_url": "https://www.openstreetmap.org/node/1"}], "start_date": "2026-10-17"}, "id": "create"},
        {"name": "update_itinerary", "input": {}, "id": "publish"},
        {"name": "get_forecast", "input": {"near": "End", "start_date": "2026-10-17", "end_date": "2026-10-17"}, "id": "unneeded"},
    ]}])
    monkeypatch.setattr(agent, "build_model", lambda: model)
    response = TestClient(main.app).post("/api/ask/stream" if streaming else "/api/ask", json={
        "prompt": "Plan my drive", "road_trip": preferences().model_dump()})
    assert len(model.seen) == 1
    assert not forecasts  # remaining tools in the same batch also stop after publication
    assert not {"find_places", "locate", "find_route_towns", "plan_drive", "edit_stops"} & model.seen[0]["tools"]
    result = next(item for item in events(response) if "itinerary" in item) if streaming else response.json()
    if streaming:
        assert any(item.get("xray", {}).get("tool") == "get_forecast" and item["xray"].get("status") == "cancelled"
                   for item in events(response))
    assert result["itinerary"]["roadTrip"]["detourMinutes"] == 15
    assert response.status_code == 200 and "model call denied by hook" not in response.text


def test_road_trip_recovery_publishes_checked_edit_without_rewriting_it(providers, monkeypatch):
    model = ScriptedModel([
        call("edit_stops", {"remove_ids": ["stop-1"]}, "edit"),
        {"text": "Removed the museum from the proposed plan. Review the change for approval."},
        call("update_itinerary", {}, "publish"),
    ])
    monkeypatch.setattr(agent, "build_model", lambda: model)
    response = events(TestClient(main.app).post("/api/ask/stream", json={"prompt": "Remove the museum", "road_trip": preferences().model_dump(),
                      "current_itinerary": plan().model_dump(mode="json")}))
    assert any("approval" in item for item in response)
    recovery = model.seen[-1]["messages"][-1]["content"][0]["text"]
    assert "already checked" in recovery and "NO arguments" in recovery
    assert "Do not retype" in recovery


def test_hands_on_new_road_trip_still_requires_approval(providers, monkeypatch):
    monkeypatch.setattr("tools.find_places", lambda *args: {"status": "ok", "places": [{
        "name": "Town 1 Museum", "category": "Activities", "lat": 0, "lng": 1,
        "source_urls": ["https://www.openstreetmap.org/node/1"]}]})
    model = ScriptedModel([{"tools": [
        {"name": "research_stops", "input": {"towns": ["Town 1"], "categories": ["Activities"]}, "id": "lookup"},
        {"name": "create_road_trip", "input": {"stops": [{"source_url": "https://www.openstreetmap.org/node/1"}], "start_date": "2026-10-17"}, "id": "create"},
        {"name": "update_itinerary", "input": {}, "id": "publish"},
    ]}])
    monkeypatch.setattr(agent, "build_model", lambda: model)
    client = TestClient(main.app)
    initial = events(client.post("/api/ask/stream", json={"prompt": "Plan my drive", "mode": "Hands-on", "road_trip": preferences().model_dump()}))
    approval = next(item["approval"] for item in initial if "approval" in item)
    assert not any("itinerary" in item for item in initial)
    preview = approval["interrupts"][0]["reason"]["itinerary"]
    resumed = events(client.post(f"/api/ask/{approval['run_id']}/resume", json={"approved": True,
                    "interrupt_ids": [item["id"] for item in approval["interrupts"]]}))
    assert next(item["itinerary"] for item in resumed if "itinerary" in item) == preview
    assert len(model.seen) == 1


def test_research_is_bounded_memoized_and_records_provenance(providers, monkeypatch):
    calls = []
    def find(near, category, keyword, radius, limit):
        calls.append((near, category, limit))
        return {"status": "ok", "places": [{"name": f"{near} {category}", "category": category, "lat": 0, "lng": 1,
                 "source_urls": [f"https://www.openstreetmap.org/node/{near}-{category}"]}]}
    monkeypatch.setattr("tools.find_places", find)
    _, _, evidence, tools = actions()
    result = tools["research_stops"](towns=["Town 1", "Town 2"])
    assert len(calls) == 4 and all(limit == 3 for _, _, limit in calls)
    assert len(result["places"]) == 4
    assert all(evidence.known_source(place["source_url"]) for place in result["places"])
    assert tools["research_stops"](towns=["Town 1", "Town 2"]) == result
    assert len(calls) == 4
    assert tools["research_stops"](towns=["End"])["places"] == result["places"]
    assert len(calls) == 4  # a changed query cannot bypass the initial one-pass bound
    with pytest.raises(ValueError, match="at most two"):
        tools["research_stops"](towns=["Town 1", "Town 2", "End"])


def test_research_outage_is_not_a_verified_empty_plan(providers, monkeypatch):
    monkeypatch.setattr("tools.find_places", lambda *args: {"status": "unavailable", "places": [], "message": "Offline"})
    _, updates, _, tools = actions()
    result = tools["research_stops"](towns=["Town 1"])
    assert result["status"] == "unavailable" and not result["places"]
    assert updates.latest is None and updates.checked_draft is None
