"""Regression coverage for checked-draft publication and rejected/missing edits."""

import asyncio
import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from itinerary import ItineraryUpdates
from evidence import Evidence
from main import app
from routers import ask


def plan():
    return {"startDate": "2026-10-14", "endDate": "2026-10-14", "budget": {"plannedUsd": 50},
            "summary": "Museum morning", "items": [
                {"id": "museum", "date": "2026-10-14", "time": "10:00", "title": "Museum visit",
                 "category": "Activities", "costUsd": 30},
                {"id": "lunch", "date": "2026-10-14", "title": "Lunch", "category": "Food", "costUsd": None},
            ]}


def test_id_publishes_stored_draft_without_regenerating_or_mutating_input():
    updates = ItineraryUpdates()
    draft = plan()
    checked = updates.check_budget(itinerary=draft)
    draft["summary"] = "Wording changed after the check"
    draft["items"][0]["costUsd"] = 1
    result = updates.update_itinerary(draft_id=checked["draft_id"])
    assert result["status"] == "updated"
    assert updates.latest.summary == "Museum morning"
    assert updates.latest.items[0].costUsd == 30
    assert updates.latest.items[1].costUsd is None
    assert updates.update_pending is False


def test_draft_ids_are_superseded_consumed_and_request_local():
    updates = ItineraryUpdates()
    first = updates.check_budget(itinerary=plan())["draft_id"]
    revised = plan()
    revised["items"][0]["costUsd"] = 20
    second = updates.check_budget(itinerary=revised)["draft_id"]
    for invalid in (first, "made-up"):
        with pytest.raises(ValueError, match="Budget check required"):
            updates.update_itinerary(draft_id=invalid)
        assert updates.latest is None
    with pytest.raises(ValueError):
        ItineraryUpdates().update_itinerary(draft_id=second)
    updates.update_itinerary(draft_id=second)
    assert updates.latest.items[0].costUsd == 20
    with pytest.raises(ValueError):
        updates.update_itinerary(draft_id=second)


def test_id_cannot_authorize_a_different_supplied_snapshot():
    updates = ItineraryUpdates()
    checked = updates.check_budget(itinerary=plan())
    changed = plan()
    changed["items"][0]["time"] = "11:00"
    with pytest.raises(ValueError, match="Budget check required"):
        updates.update_itinerary(draft_id=checked["draft_id"], itinerary=changed)
    assert updates.latest is None


def test_real_strands_tool_reports_rejection_as_error_then_accepts_checked_id():
    updates = ItineraryUpdates()

    async def call(inputs):
        events = [event async for event in updates.update_itinerary.stream(
            {"toolUseId": "edit", "name": "update_itinerary", "input": inputs}, {})]
        return events[-1]["tool_result"]

    rejected = asyncio.run(call({"draft_id": "missing"}))
    assert rejected["status"] == "error"
    assert "No plan was changed" in rejected["content"][0]["text"]
    checked = updates.check_budget(itinerary=plan())
    accepted = asyncio.run(call({"draft_id": checked["draft_id"]}))
    assert accepted["status"] == "success"
    assert updates.latest.items[0].id == "museum"


@pytest.mark.parametrize("stream", [False, True])
@pytest.mark.parametrize("initial", ["rejected", "checked_only", "adjusted_without_tools"])
@pytest.mark.parametrize("recover", [False, True])
def test_revision_recovery_confirms_publication_or_preserves_previous_plan(monkeypatch, stream, initial, recover):
    agents = []

    class Agent:
        system_prompt = "Roam"

        def __init__(self, kwargs):
            self.tools = {tool.tool_name: tool for tool in kwargs["extra_tools"]}
            self.calls = 0

        def act(self):
            self.calls += 1
            draft = deepcopy(plan())
            draft["items"][0]["time"] = "11:00"
            if self.calls == 1:
                if initial == "rejected":
                    # Strands normally delivers this error to the model, rather than raising out of the turn.
                    try:
                        self.tools["update_itinerary"](draft_id="missing")
                    except ValueError:
                        pass
                elif initial == "checked_only":
                    self.tools["check_budget"](itinerary=draft)
                    return ""  # Pending tool state must trigger recovery even without reply text.
                return "I've adjusted your itinerary: the museum is at 11 AM."
            if recover:
                checked = self.tools["check_budget"](itinerary=draft)
                self.tools["update_itinerary"](draft_id=checked["draft_id"])
                return "The museum is at 11 AM; lunch is unchanged."
            return "Done! I've updated your itinerary."  # A second unsupported claim must not escape.

        def __call__(self, prompt):
            return self.act()

        async def stream_async(self, prompt):
            yield {"result": self.act()}

    def factory(**kwargs):
        agent = Agent(kwargs)
        agents.append(agent)
        return agent

    monkeypatch.setattr(ask, "build_agent", factory)
    response = TestClient(app).post("/api/ask/stream" if stream else "/api/ask", json={
        "prompt": "Move the museum to 11 AM", "current_itinerary": plan(),
    })
    assert response.status_code == 200
    if stream:
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        assert events[-1] == {"done": True}
        result = {key: value for event in events for key, value in event.items() if key != "done"}
    else:
        result = response.json()
    assert agents[-1].calls == 2
    if recover:
        assert result["reply"] == "The museum is at 11 AM; lunch is unchanged."
        assert result["itinerary"]["items"][0]["time"] == "11:00"
        assert result["itinerary"]["items"][1]["id"] == "lunch"
        assert result["itinerary"]["items"][1]["costUsd"] is None
    else:
        assert "couldn't apply" in result["reply"] and "previous plan is unchanged" in result["reply"]
        assert "itinerary" not in result


def test_unfinished_second_edit_does_not_publish_an_earlier_draft_from_the_turn():
    updates = ItineraryUpdates()
    checked = updates.check_budget(itinerary=plan())
    updates.update_itinerary(draft_id=checked["draft_id"])
    changed = plan()
    changed["items"][0]["time"] = "11:00"
    updates.check_budget(itinerary=changed)
    body = ask.AskRequest(prompt="Move it again", current_itinerary=plan())
    assert ask.needs_panel_update(body, updates, "Done!")
    assert ask.final_itinerary(body, updates, None) is None
    assert "couldn't apply" in ask.confirmed_reply("Done!", updates, True)


def test_a_genuine_clarification_does_not_force_an_edit():
    updates = ItineraryUpdates()
    body = ask.AskRequest(prompt="What other museums could we visit?", current_itinerary=plan())
    reply = "Would you like me to replace the museum?"
    assert not ask.needs_panel_update(body, updates, reply)
    assert ask.confirmed_reply(reply, updates, False) == reply


def test_failed_revision_preserves_existing_car_mode_flight_cleanup():
    current = plan()
    current["items"].append({"id": "flight", "title": "Flight home", "date": "2026-10-14",
                             "category": "Flights", "costUsd": 200})
    body = ask.AskRequest(prompt="Drive instead", current_itinerary=current, car_mode=True)
    updates = ItineraryUpdates()
    with pytest.raises(ValueError):
        updates.update_itinerary(draft_id="missing")
    cleaned = ask.final_itinerary(body, updates, Evidence())
    assert [item.id for item in cleaned.items] == ["museum", "lunch"]
    reply = ask.confirmed_reply("Done!", updates, True, car_mode_cleanup=True)
    assert "couldn't apply" in reply and "Car mode removed flights" in reply
