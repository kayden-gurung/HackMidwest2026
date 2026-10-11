"""Exercise the real Strands agent loop, tools, hooks and interrupt/resume without AWS."""

import asyncio
import json
import time
from collections import deque
from copy import deepcopy

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from strands import tool
from strands.models import Model

import agent
import main
from agent_runs import runs
from evidence import Evidence
from itinerary import ItineraryUpdates
from routers import ask


def plan(title="Free afternoon", cost=0):
    return {"startDate": "2026-10-17", "endDate": "2026-10-17", "budget": {"plannedUsd": 300},
            "summary": "A relaxed afternoon", "items": [
                {"id": "afternoon", "date": "2026-10-17", "title": title, "category": "Activities", "costUsd": cost},
                {"id": "dinner", "date": "2026-10-17", "title": "Dinner", "category": "Food", "costUsd": 30}]}


def call(name, arguments, call_id):
    return {"tools": [{"name": name, "input": arguments, "id": call_id}]}


def checked_update(candidate, call_id):
    return {"tools": [
        {"name": "check_budget", "input": {"itinerary": candidate}, "id": f"{call_id}-budget"},
        {"name": "update_itinerary", "input": {"itinerary": candidate}, "id": call_id},
    ]}


class ScriptedModel(Model):
    def __init__(self, steps):
        self.steps = deque(steps)
        self.seen = []

    def update_config(self, **kwargs):
        pass

    def get_config(self):
        return {"context_window_limit": 200000}

    async def structured_output(self, *args, **kwargs):
        raise AssertionError("No structured-output model call expected")
        yield

    async def stream(self, messages, tool_specs=None, system_prompt=None, **kwargs):
        self.seen.append({"tools": {spec["name"] for spec in tool_specs or []}, "prompt": system_prompt, "messages": deepcopy(messages)})
        step = self.steps.popleft()
        if "error" in step:
            raise step["error"]
        if "wait" in step:
            await step["wait"].wait()
        yield {"messageStart": {"role": "assistant"}}
        if "tools" in step:
            for index, action in enumerate(step["tools"]):
                yield {"contentBlockStart": {"contentBlockIndex": index, "start": {"toolUse": {"name": action["name"], "toolUseId": action["id"]}}}}
                yield {"contentBlockDelta": {"contentBlockIndex": index, "delta": {"toolUse": {"input": json.dumps(action["input"])}}}}
                yield {"contentBlockStop": {"contentBlockIndex": index}}
            yield {"messageStop": {"stopReason": "tool_use"}}
        else:
            yield {"contentBlockStart": {"contentBlockIndex": 0, "start": {}}}
            yield {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": step["text"]}}}
            yield {"contentBlockStop": {"contentBlockIndex": 0}}
            yield {"messageStop": {"stopReason": "end_turn"}}
        yield {"metadata": {"usage": {"inputTokens": 10, "outputTokens": 10, "totalTokens": 20}, "metrics": {"latencyMs": 1}}}


def events(response):
    assert response.status_code == 200, response.text
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


@pytest.fixture
def install(monkeypatch):
    created = []

    def setup(steps, check=None):
        model = ScriptedModel(steps)
        monkeypatch.setattr(agent, "build_model", lambda: model)
        def checked(body):
            updates = ItineraryUpdates(check=check)
            created.append(updates)
            return updates, Evidence()
        monkeypatch.setattr(ask, "checked_updates", checked)
        return model, created

    yield setup
    for key in list(runs._runs):
        runs.discard(key)


@pytest.mark.parametrize("approved", [True, False])
def test_real_sdk_pauses_before_commit_and_resumes_same_agent(install, approved):
    candidate = plan("Indoor afternoon", 20)
    checks = []
    def check(snapshot):
        checks.append(snapshot)
        return snapshot, []
    model, updates = install([checked_update(candidate, "replan"), {"text": "Your revised plan is ready."}], check)
    with TestClient(main.app) as client:
        initial = events(client.post("/api/ask/stream", json={"prompt": "Rain tomorrow, move inside", "current_itinerary": plan()}))
        approval = next(event["approval"] for event in initial if "approval" in event)
        assert updates[0].latest is None
        assert not any("reply" in event or "itinerary" in event for event in initial)
        assert approval["interrupts"][0]["reason"]["unchanged_stops"] == 1
        assert approval["interrupts"][0]["reason"]["after_total_usd"] == 50
        ids = [item["id"] for item in approval["interrupts"]]
        resumed = events(client.post(f"/api/ask/{approval['run_id']}/resume", json={"approved": approved, "interrupt_ids": ids}))
        assert len(model.seen) == 2  # resume executes the pending tool; no repeated proposal call
        assert len(checks) == 1  # exact validated preview reused by the tool
        if approved:
            assert updates[0].latest.items[0].title == "Indoor afternoon"
            assert next(ev["itinerary"] for ev in resumed if "itinerary" in ev)["items"][0]["title"] == "Indoor afternoon"
        else:
            assert updates[0].latest is None
            assert not any("itinerary" in event for event in resumed)
            assert next(ev["reply"] for ev in resumed if "reply" in ev).startswith("Kept your current plan")
        assert any(ev.get("xray", {}).get("kind") == "consent_resolved" for ev in resumed)
        assert client.post(f"/api/ask/{approval['run_id']}/resume", json={"approved": True, "interrupt_ids": ids}).status_code == 404


def test_unchecked_replan_is_repaired_before_requesting_consent(install):
    candidate = plan("Indoor afternoon", 20)
    checks = []

    def check(snapshot):
        checks.append(snapshot)
        return snapshot, []

    model, updates = install([
        call("update_itinerary", {"itinerary": candidate}, "unchecked"),
        checked_update(candidate, "checked"),
    ], check)
    result = events(TestClient(main.app).post("/api/ask/stream", json={
        "prompt": "Move the afternoon inside", "current_itinerary": plan(),
    }))
    assert len(model.seen) == 2
    assert "budget_check_required" in json.dumps(model.seen[1]["messages"])
    assert len(checks) == 1  # An unchecked candidate never reaches the consent validator.
    assert updates[0].latest is None
    assert len([event for event in result if "approval" in event]) == 1
    assert not any("itinerary" in event for event in result)


def test_real_specialists_use_scoped_tools_and_emit_nested_hooks(install, monkeypatch):
    @tool
    def find_places(near: str, category: str) -> dict:
        """Find verified places near a city."""
        return {"status": "ok", "places": []}
    @tool
    def plan_drive(origin: str, destination: str) -> dict:
        """Estimate a driving route."""
        return {"status": "ok", "distance_miles": 180}
    @tool
    def get_forecast(near: str) -> dict:
        """Get a live forecast for the destination."""
        return {"status": "ok", "source_urls": ["https://open-meteo.com/"]}
    monkeypatch.setattr(ask, "recording_tools", lambda *args: [find_places, plan_drive, get_forecast])
    candidate = plan()
    model, _ = install([
        call("research_places", {"task": "Research KC"}, "delegate-places"),
        {"tools": [call("find_places", {"near": "Kansas City", "category": "attractions"}, "lookup")["tools"][0],
                   call("get_forecast", {"near": "Kansas City"}, "forecast")["tools"][0]]}, {"text": "No verified places found."},
        call("plan_transport", {"task": "Drive Omaha to KC"}, "delegate-transport"),
        call("plan_drive", {"origin": "Omaha", "destination": "Kansas City"}, "route"), {"text": "Estimated drive: 180 miles."},
        call("review_trip_budget", {"task": json.dumps(candidate)}, "delegate-budget"),
        call("calculate_budget", {"itinerary": candidate}, "costs"), {"text": "Estimated total $30, within budget."},
        checked_update(candidate, "update"), {"text": "Your plan is ready."},
    ])
    response = TestClient(main.app).post("/api/ask/stream", json={"prompt": "Plan a KC road trip", "car_mode": True, "max_drive_miles_per_day": 300, "preferences": {"interests": ["Local food"]}})
    trace = [ev["xray"] for ev in events(response) if "xray" in ev]
    assert {ev["agent"] for ev in trace} == {"orchestrator", "places", "transport", "budget"}
    starts = {(ev["agent"], ev.get("tool")) for ev in trace if ev["kind"] == "tool_started"}
    assert ("places", "find_places") in starts and ("transport", "plan_drive") in starts and ("budget", "calculate_budget") in starts
    assert ("places", "get_forecast") in starts and ("orchestrator", "check_budget") in starts
    assert model.seen[0]["tools"] == {"research_places", "plan_transport", "review_trip_budget", "check_budget", "update_itinerary"}
    assert model.seen[1]["tools"] == {"find_places", "get_forecast"}
    assert model.seen[4]["tools"] == {"plan_drive"}
    assert model.seen[7]["tools"] == {"calculate_budget"}
    assert all("CAR MODE IS ON" in item["prompt"] and "Local food" in item["prompt"] for item in model.seen)


def test_specialist_failures_are_sanitized_before_reaching_the_orchestrator(install):
    failure = ClientError({"Error": {"Code": "AccessDeniedException", "Message": "private upstream detail"}}, "ConverseStream")
    model, _ = install([call("research_places", {"task": "Research KC"}, "delegate"), {"error": failure}, {"text": "The place service is unavailable. What would you like to explore?"}])
    result = events(TestClient(main.app).post("/api/ask/stream", json={"prompt": "Find things to do in KC"}))
    messages = json.dumps(model.seen[-1]["messages"])
    assert "access is denied" in messages and "private upstream detail" not in messages
    assert "private upstream detail" not in json.dumps(result)


def test_nudge_can_interrupt_and_hands_on_first_plan_requires_consent(install):
    install([{"text": "Day 1: a relaxed afternoon."}, checked_update(plan(), "nudged")])
    response = events(TestClient(main.app).post("/api/ask/stream", json={"prompt": "Plan my afternoon", "mode": "Hands-on"}))
    assert any("approval" in ev for ev in response)
    assert not any("itinerary" in ev for ev in response)


def test_sync_api_also_requires_consent_and_rejects_wrong_expired_or_duplicate_responses(install):
    install([checked_update(plan("Indoor afternoon"), "sync"), {"text": "Done"}])
    with TestClient(main.app) as client:
        response = client.post("/api/ask", json={"prompt": "Move inside", "current_itinerary": plan()}).json()
        assert "approval" in response and "itinerary" not in response
        approval = response["approval"]
        url = f"/api/ask/{approval['run_id']}/resume"
        assert client.post(url, json={"approved": True, "interrupt_ids": ["wrong"]}).status_code == 409
        ids = [item["id"] for item in approval["interrupts"]]
        run = runs.claim(approval["run_id"], ids)
        assert client.post(url, json={"approved": True, "interrupt_ids": ids}).status_code == 409
        run.busy = False
        run.expires = time.monotonic() - 1
        assert client.post(url, json={"approved": True, "interrupt_ids": ids}).status_code == 410


def test_specialist_hooks_are_streamed_while_specialist_model_is_still_running(install):
    async def scenario():
        ready = asyncio.Event()
        install([call("research_places", {"task": "Research KC"}, "delegate"), {"wait": ready, "text": "No live places available."}, {"text": "Where would you like to go?"}])
        response = await ask.ask_stream(ask.AskRequest(prompt="Help choose a destination"))
        iterator = response.body_iterator
        observed = []
        try:
            while True:
                chunk = await asyncio.wait_for(anext(iterator), timeout=2)
                event = json.loads(chunk[6:])
                observed.append(event)
                if event.get("xray", {}).get("agent") == "places" and event["xray"]["kind"] == "model_started":
                    break
            assert not ready.is_set() and not any("reply" in event for event in observed)
            ready.set()
            async for chunk in iterator:
                observed.append(json.loads(chunk[6:]))
            assert observed[-1] == {"done": True}
        finally:
            ready.set()
            await iterator.aclose()
    asyncio.run(scenario())
