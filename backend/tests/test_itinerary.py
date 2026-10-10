import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from itinerary import ItinerarySnapshot, ItineraryUpdates
from main import app
from routers import ask as ask_router


def draft():
    return {"startDate": "2026-10-17", "endDate": "2026-10-18", "budget": {"plannedUsd": 300},
            "items": [{"id": "park", "date": "2026-10-17", "title": "Park picnic", "category": "Food", "costUsd": 30,
                       "location": {"name": "Park", "lat": 39.1, "lng": -94.6}},
                      {"id": "stay", "date": "2026-10-17", "title": "Stay", "category": "Stays", "costUsd": None}]}


def test_strands_tool_accepts_nested_input_and_isolates_request_state():
    updates = ItineraryUpdates()

    async def run():
        return [event async for event in updates.update_itinerary.stream(
            {"toolUseId": "plan-1", "name": "update_itinerary", "input": {"itinerary": draft()}}, {})]

    events = asyncio.run(run())
    assert events[-1]["tool_result"]["status"] == "success"
    assert updates.latest.items[0].title == "Park picnic"
    assert updates.latest.items[1].costUsd is None
    assert ItineraryUpdates().latest is None


@pytest.mark.parametrize("mutation", [
    lambda plan: plan.update(endDate="2026-10-16"),
    lambda plan: plan.update(endDate="2027-10-18"),
    lambda plan: plan["items"][0].update(date="2026-10-19"),
    lambda plan: plan["items"][1].update(id="park"),
    lambda plan: plan["items"][0].update(costUsd=-10),
    lambda plan: plan["items"][0].update(costUsd=float("nan")),
    lambda plan: plan["items"][0].update(category="Bogus"),
    lambda plan: plan["items"][0].update(time="25:90"),
    lambda plan: plan["items"][0]["location"].update(lat=100),
    lambda plan: plan["items"][0]["location"].pop("lng"),
])
def test_bad_updates_cannot_replace_previous_plan(mutation):
    updates = ItineraryUpdates()
    updates.update_itinerary(itinerary=draft())
    before = updates.latest.model_dump()
    invalid = draft()
    mutation(invalid)
    with pytest.raises(ValidationError):
        updates.update_itinerary(itinerary=invalid)
    assert updates.latest.model_dump() == before


def test_chat_revisions_use_current_plan_and_return_complete_snapshots(monkeypatch):
    agents = []

    class FakeAgent:
        system_prompt = "Roam"

        def __init__(self, tools):
            self.update = tools[0]

        def __call__(self, prompt):
            plan = draft()
            if prompt == "Change picnic":
                plan["items"][0].update(title="Restaurant lunch", costUsd=60)
            self.update(itinerary=plan)
            return "Your plan is ready."

    def factory(**kwargs):
        agent = FakeAgent(kwargs["extra_tools"])
        agents.append(agent)
        return agent

    monkeypatch.setattr(ask_router, "build_agent", factory)
    client = TestClient(app)
    first = client.post("/api/ask", json={"prompt": "Plan trip"}).json()
    assert first["itinerary"]["items"][1]["costUsd"] is None
    second = client.post("/api/ask", json={"prompt": "Change picnic", "current_itinerary": first["itinerary"]}).json()
    assert "Park picnic" in agents[-1].system_prompt
    assert second["itinerary"]["items"][0]["title"] == "Restaurant lunch"
    assert second["itinerary"]["items"][1] == first["itinerary"]["items"][1]
    client.post("/api/ask", json={"prompt": "New trip"})
    assert "Current itinerary" not in agents[-1].system_prompt


def test_invalid_request_plan_rejected_before_model(monkeypatch):
    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: pytest.fail("must not invoke model"))
    invalid = draft()
    invalid["items"][0]["location"]["lat"] = 900
    assert TestClient(app).post("/api/ask", json={"prompt": "revise", "current_itinerary": invalid}).status_code == 422


def test_completed_tool_update_without_chat_text_still_returns_a_confirmation(monkeypatch):
    class FakeAgent:
        system_prompt = "Roam"

        def __init__(self, tool):
            self.update = tool

        def __call__(self, prompt):
            self.update(itinerary=draft())
            return " \n"

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: FakeAgent(kwargs["extra_tools"][0]))
    response = TestClient(app).post("/api/ask", json={"prompt": "Revise plan"})
    assert response.status_code == 200
    assert "$30.00" in response.json()["reply"]
    assert "$300.00 budget" in response.json()["reply"]
    assert "unknown" in response.json()["reply"]
    assert len(response.json()["itinerary"]["items"]) == 2


def test_stream_plan_commits_only_after_success(monkeypatch):
    fail = False

    class FakeAgent:
        system_prompt = "Roam"

        def __init__(self, tool):
            self.update = tool

        async def stream_async(self, prompt):
            self.update(itinerary=draft())
            yield {"data": "Plan reply"}
            if fail:
                raise RuntimeError("private upstream detail")

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: FakeAgent(kwargs["extra_tools"][0]))
    client = TestClient(app)
    def events():
        response = client.post("/api/ask/stream", json={"prompt": "Plan trip"})
        return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]

    success = events()
    assert success[-2]["itinerary"]["items"][0]["title"] == "Park picnic"
    assert success[-1] == {"done": True}
    fail = True
    failed = events()
    assert any("error" in event for event in failed)
    assert not any("itinerary" in event for event in failed)
