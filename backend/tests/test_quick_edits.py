"""Changing one stop of a road trip without the model rewriting the plan (quick_edits.py).

Runs on the fake Kansas City -> Denver world from test_route_search (no network), with the real
accuracy check and whole-route check, and the real Strands loop for the end-to-end test.
"""

import pytest
from fastapi.testclient import TestClient

import agent
import main
from agent_runs import runs
from quick_edits import QuickEdits
from routers.ask import AskRequest, checked_updates
from tests.test_orchestration import ScriptedModel, call, events
from tests.test_route_search import plan as first_plan
from tests.test_route_search import world  # noqa: F401  (pytest fixture)


def road_trip(detour_minutes=60):
    return {"origin": "Kansas City, MO", "destination": "Denver, CO", "detour_minutes": detour_minutes, "mpg": 28, "gas_price": 3.25}


@pytest.fixture
def nature_plan(world, monkeypatch):  # noqa: F811
    """A first plan made for Nature only: one stop (the overlook), so History towns are still on offer."""
    monkeypatch.setattr("routers.ask.pin_stops", lambda items, evidence: None)
    itinerary = first_plan(interests=["Nature"]).itinerary
    assert [i.title for i in itinerary.items if i.category == "Activities"] == ["Stop: High Plains Overlook"]
    yield itinerary
    for run_id in list(runs._runs):
        runs.discard(run_id)


def quick_edits(itinerary, detour_minutes=60, interests=None):
    body = AskRequest(prompt="change a stop", current_itinerary=itinerary, road_trip=road_trip(detour_minutes),
                      max_drive_miles_per_day=400)
    updates, evidence = checked_updates(body)
    return QuickEdits(updates.roadtrip_planner, updates, evidence, itinerary, interests), updates


def titles(snapshot, category=None):
    return [i.title for i in snapshot.items if i.category != "Driving" and category in (None, i.category)]


def test_adding_a_town_changes_only_that_stop_and_checks_the_whole_route(nature_plan):
    edits, updates = quick_edits(nature_plan)
    found = edits.find_options("town", interests=["History"])
    assert found["status"] == "ok"
    names = [o["name"] for o in found["options"]]
    assert "Fort Hays" in names and "High Plains Overlook" not in names  # nothing already in the plan
    fort = next(o for o in found["options"] if o["name"] == "Fort Hays")
    assert fort["estimated_cost_usd"] == 8 and fort["town"] == "Hays"

    result = edits.edit_stops(add_option_ids=[fort["option_id"]])
    assert result["status"] == "checked" and result["added"] == ["Stop: Fort Hays"] and result["removed"] == []
    assert result["road_trip"]["detour_minutes"] <= 60

    draft = updates.review_draft
    before = {i.id: i for i in nature_plan.items if i.category != "Driving"}
    after = {i.id: i for i in draft.items if i.category != "Driving"}
    assert {k: after[k] for k in before} == before  # every other stop, meal and bed is untouched
    new = next(i for i in after.values() if i.id not in before)
    assert new.sourceUrls == ["https://www.openstreetmap.org/node/11"] and new.location.lat is not None
    # Hays is before the overlook on the road, so the new stop comes first on its day.
    overlook = next(i for i in after.values() if "Overlook" in i.title)
    assert (new.date, new.time) < (overlook.date, overlook.time)
    assert draft.roadTrip is not None and any(i.category == "Driving" and i.route for i in draft.items)


def test_swapping_an_attraction_in_the_same_town_keeps_its_place_in_the_day(world):  # noqa: F811
    itinerary = first_plan().itinerary
    fort = next(i for i in itinerary.items if "Fort Hays" in i.title)
    edits, updates = quick_edits(itinerary)
    found = edits.find_options("attraction", stop_id=fort.id)
    museum = next(o for o in found["options"] if o["name"] == "Ellis County Museum")
    assert all(o["name"] != "Fort Hays" for o in found["options"])

    result = edits.edit_stops(remove_ids=[fort.id], add_option_ids=[museum["option_id"]])
    assert result["status"] == "checked" and result["removed"] == [fort.title]
    new = next(i for i in updates.review_draft.items if "Ellis County Museum" in i.title)
    assert (new.date, new.time) == (fort.date, fort.time) and new.costUsd == 10
    assert "not its listed price" in new.description


def test_a_different_restaurant_near_the_same_stop(world):  # noqa: F811
    itinerary = first_plan().itinerary
    lunch = next(i for i in itinerary.items if i.title.startswith("Lunch"))
    edits, updates = quick_edits(itinerary)
    found = edits.find_options("restaurant", stop_id=lunch.id)
    choice = found["options"][0]
    result = edits.edit_stops(remove_ids=[lunch.id], add_option_ids=[choice["option_id"]])
    assert result["status"] == "checked"
    meals = [i for i in updates.review_draft.items if i.category == "Food" and i.date == lunch.date]
    assert [m.location.name for m in meals] == [choice["name"]] and meals[0].time == lunch.time


def test_a_swap_that_breaks_the_detour_budget_is_rejected_and_changes_nothing(nature_plan):
    edits, updates = quick_edits(nature_plan, detour_minutes=0)  # no extra driving allowed at all
    fort = next(o for o in edits.find_options("town", interests=["History"])["options"] if o["name"] == "Fort Hays")
    result = edits.edit_stops(add_option_ids=[fort["option_id"]])
    assert result["status"] == "rejected" and "detour budget" in result["message"]
    assert edits.working == nature_plan and updates.checked_draft is None
    assert updates.update_itinerary()["status"] == "budget_check_required"  # nothing to publish


def test_unknown_ids_are_explained_not_guessed(nature_plan):
    edits, _ = quick_edits(nature_plan)
    wrong = edits.edit_stops(remove_ids=["stop-nope"])
    assert wrong["status"] == "error" and any("Overlook" in title for title in wrong["valid_ids"].values())
    assert edits.edit_stops(add_option_ids=["o99"])["status"] == "error"
    assert edits.find_options("spaceship")["status"] == "error"


def test_search_outage_is_reported(nature_plan, world):  # noqa: F811
    world["search_up"] = False
    edits, _ = quick_edits(nature_plan)
    assert edits.find_options("attraction", city="Denver, CO")["status"] == "unavailable"


def test_strands_swaps_a_stop_in_three_short_calls_and_waits_for_approval(nature_plan, monkeypatch):
    overlook = next(i for i in nature_plan.items if "Overlook" in i.title)
    model = ScriptedModel([
        call("find_options", {"kind": "town", "interests": ["History"]}, "find"),
        call("edit_stops", {"remove_ids": [overlook.id], "add_option_ids": ["o1"]}, "edit"),  # o1: the best documented
        call("update_itinerary", {}, "publish"),
        {"text": "Swapped the overlook for Fort Hays."},
    ])
    monkeypatch.setattr(agent, "build_model", lambda: model)
    body = {"prompt": "Swap the overlook for a historic town", "current_itinerary": nature_plan.model_dump(mode="json"),
            "road_trip": road_trip(), "max_drive_miles_per_day": 400}
    client = TestClient(main.app)
    initial = events(client.post("/api/ask/stream", json=body))

    # The orchestrator holds the two tools and is told to use them; no specialist ran and the plan was never written out.
    assert {"find_options", "edit_stops"} <= model.seen[0]["tools"] and "QUICK CHANGES" in model.seen[0]["prompt"]
    assert len(model.seen) == 3
    tools_used = [ev["tool"] for ev in initial if "tool" in ev]
    assert tools_used == ["find_options", "edit_stops", "update_itinerary"]

    approval = next(ev["approval"] for ev in initial if "approval" in ev)
    preview = approval["interrupts"][0]["reason"]
    changed = {(c["type"], (c.get("after") or c.get("before"))["title"]) for c in preview["changes"]
               if (c.get("after") or c.get("before"))["category"] != "Driving"}
    # The overlook goes, Fort Hays comes, and the lunch picked for the overlook moves to a local place by the fort.
    assert changed == {("removed", overlook.title), ("added", "Stop: Fort Hays"),
                       ("removed", "Lunch: Main Street Diner"), ("added", "Lunch: Main Street Diner")}
    assert not any("itinerary" in ev for ev in initial)  # nothing published before approval

    resumed = events(client.post(f"/api/ask/{approval['run_id']}/resume", json={
        "approved": True, "interrupt_ids": [item["id"] for item in approval["interrupts"]]}))
    published = next(ev["itinerary"] for ev in resumed if "itinerary" in ev)
    assert published == preview["itinerary"]
    stops = [i["title"] for i in published["items"] if i["category"] == "Activities"]
    assert stops == ["Stop: Fort Hays"]
