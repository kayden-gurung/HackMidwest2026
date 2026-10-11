import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from budget import analyze_budget
from itinerary import ItinerarySnapshot, ItineraryUpdates
from main import app
from routers import ask


def draft(costs=(120, 50, 40), budget=150):
    return {"startDate": "2026-10-11", "endDate": "2026-10-11", "budget": {"plannedUsd": budget},
            "items": [{"id": str(i), "date": "2026-10-11", "title": title, "category": category, "costUsd": cost}
                      for i, (cost, title, category) in enumerate(zip(costs, ("Hotel", "Dinner", "Museum"), ("Stays", "Food", "Activities")))]}


def test_over_budget_math_and_candidates_do_not_change_the_plan():
    updates = ItineraryUpdates()
    result = updates.check_budget(itinerary=draft())
    assert result["estimated_total_usd"] == 210
    assert result["remaining_usd"] == -60 and result["over_budget_usd"] == 60
    assert result["within_budget"] is False and result["budget_status"] == "over_budget"
    assert [item["title"] for item in result["cut_candidates"]] == ["Museum", "Dinner", "Hotel"]
    assert "alternative" in result["cut_candidates"][1]["suggestion"]
    assert updates.latest is None


@pytest.mark.parametrize("budget,status,remaining", [(300, "under_budget", 90), (210, "on_budget", 0), (None, "no_limit", None)])
def test_under_equal_and_unlimited_budgets(budget, status, remaining):
    result = ItineraryUpdates().check_budget(itinerary=draft(budget=budget))
    assert result["budget_status"] == status and result["remaining_usd"] == remaining
    assert result["cut_candidates"] == []
    assert result["within_budget"] is (None if budget is None else True)


def test_unknown_costs_are_not_free_or_a_promise_of_affordability():
    # The budget maths itself never counts a missing price as free.
    result = analyze_budget(ItinerarySnapshot.model_validate(draft((None, 50, 0))))
    assert result["estimated_total_usd"] == 50 and result["budget_status"] == "incomplete"
    assert result["within_budget"] is None and result["unknown_costs"] == [{"id": "0", "title": "Hotel"}]


def test_missing_prices_get_a_labelled_estimate_before_the_budget_check():
    updates = ItineraryUpdates()
    result = updates.check_budget(itinerary=draft((None, 50, 0), budget=300))
    # A hotel room for one traveler is estimated at $130; prices already given, including free, are kept.
    assert result["estimated_total_usd"] == 180 and result["unknown_costs"] == []
    assert result["budget_status"] == "under_budget" and result["within_budget"] is True
    checked = updates.checked_draft
    assert [item.costUsd for item in checked.items] == [130, 50, 0]
    assert any(line.startswith("Stop, meal and stay prices are rough estimates for 1 traveler") for line in checked.assumptions)
    over = ItineraryUpdates().check_budget(itinerary=draft((None, 200, 0)))
    assert over["budget_status"] == "over_budget" and over["within_budget"] is False


def test_decimal_costs_have_exact_cent_totals():
    result = ItineraryUpdates().check_budget(itinerary=draft((0.1, 0.2, 0), budget=0.3))
    assert result["estimated_total_usd"] == 0.3 and result["remaining_usd"] == 0
    assert result["budget_status"] == "on_budget"


def test_every_published_draft_requires_its_own_budget_check():
    updates = ItineraryUpdates()
    plan = draft()
    assert updates.update_itinerary(itinerary=plan)["status"] == "budget_check_required"
    assert updates.latest is None
    updates.check_budget(itinerary=plan)
    plan["items"][2]["costUsd"] = 0
    assert updates.update_itinerary(itinerary=plan)["status"] == "budget_check_required"
    assert updates.latest is None
    updates.check_budget(itinerary=plan)
    assert updates.update_itinerary(itinerary=plan)["status"] == "updated"
    assert updates.latest.items[2].costUsd == 0
    assert updates.update_itinerary(itinerary=plan)["status"] == "budget_check_required"
    assert ItineraryUpdates().update_itinerary(itinerary=plan)["status"] == "budget_check_required"


def test_nested_budget_tool_input_works_through_strands():
    updates = ItineraryUpdates()

    async def run():
        return [event async for event in updates.check_budget.stream(
            {"toolUseId": "budget-1", "name": "check_budget", "input": {"itinerary": draft()}}, {})]

    events = asyncio.run(run())
    assert events[-1]["tool_result"]["status"] == "success"
    assert updates.update_itinerary(itinerary=draft())["status"] == "updated"


@pytest.mark.parametrize("nudge", [False, True])
def test_budget_step_streams_before_plan_publication_including_recovery(monkeypatch, nudge):
    class Agent:
        system_prompt = "Roam"

        def __init__(self, kwargs):
            self.tools = {t.tool_name: t for t in kwargs["extra_tools"]}

        async def stream_async(self, prompt):
            if nudge and not prompt.startswith("You described"):
                yield {"result": "Day 1: a museum visit."}
                return
            plan = draft()
            yield {"current_tool_use": {"toolUseId": "b", "name": "check_budget"}}
            self.tools["check_budget"](itinerary=plan)
            yield {"current_tool_use": {"toolUseId": "u", "name": "update_itinerary"}}
            self.tools["update_itinerary"](itinerary=plan)
            yield {"result": "Here is your plan."}

    monkeypatch.setattr(ask, "build_agent", lambda **kwargs: Agent(kwargs))
    text = TestClient(app).post("/api/ask/stream", json={"prompt": "Plan a museum trip"}).text
    events = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
    assert [event["tool"] for event in events if "tool" in event] == ["check_budget", "update_itinerary"]
    assert events[-2]["itinerary"]["items"][2]["title"] == "Museum"


def test_prompt_requires_forecast_and_budget_checks():
    from prompts.travel import CHAT_PROMPT

    assert "use get_forecast" in CHAT_PROMPT and "MUST call check_budget" in CHAT_PROMPT


def test_update_without_arguments_publishes_the_checked_draft_once():
    """The model writes the plan for check_budget only; update_itinerary reuses that draft."""
    updates = ItineraryUpdates()
    assert updates.update_itinerary()["status"] == "budget_check_required"
    assert updates.checked_draft is None
    updates.check_budget(itinerary=draft())
    assert updates.checked_draft == ItinerarySnapshot.model_validate(draft())
    assert updates.update_itinerary()["status"] == "updated"
    assert updates.latest == ItinerarySnapshot.model_validate(draft())
    # Publishing consumes the draft; a repeat says so instead of asking for the plan again.
    assert updates.checked_draft is None
    assert updates.update_itinerary()["status"] == "already_updated"
