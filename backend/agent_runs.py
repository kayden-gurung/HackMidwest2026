"""Request-scoped Strands hooks, consent previews, and short-lived paused runs.

The opaque run ID is a browser-held capability. Nothing is persisted or shared between
journeys. Deploy this in one API worker; a shared session store is required for multiple workers.
"""

import asyncio
import secrets
import threading
import time
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import ValidationError
from strands import Agent
from strands.hooks import (AfterInvocationEvent, AfterModelCallEvent, AfterToolCallEvent,
                          BeforeInvocationEvent, BeforeModelCallEvent, BeforeToolCallEvent, HookProvider)

from budget import analyze_budget

# One traveler message: the orchestrator plus three specialists, each looping over its own tools.
# A long road trip with a budget review and one repair can pass 24 calls, so leave headroom.
MAX_MODEL_CALLS = 40


def proposal_preview(before, after) -> dict:
    old = {item.id: item.model_dump(mode="json") for item in before.items} if before else {}
    new = {item.id: item.model_dump(mode="json") for item in after.items}
    changes = []
    for key, item in old.items():
        if key not in new:
            changes.append({"type": "removed", "before": item})
        elif item != new[key]:
            changes.append({"type": "changed", "before": item, "after": new[key]})
    changes.extend({"type": "added", "after": item} for key, item in new.items() if key not in old)
    total = lambda plan: analyze_budget(plan)["estimated_total_usd"] if plan else 0
    return {"kind": "itinerary_replan", "summary": after.summary or "Review the proposed plan before applying it.",
            "changes": changes, "unchanged_stops": sum(old.get(key) == item for key, item in new.items()),
            "before_total_usd": total(before), "after_total_usd": total(after),
            "unknown_costs": sum(item.costUsd is None for item in after.items),
            "itinerary": after.model_dump(mode="json")}


class AgentRun:
    def __init__(self, body, updates, evidence):
        self.id = secrets.token_urlsafe(32)
        self.body, self.updates, self.evidence = body, updates, evidence
        self.agent = None
        self.pending = []
        self.busy = True
        self.denied = False
        self.expires = time.monotonic() + 900
        self.queue = None
        self.loop = None
        self.sequence = 0
        self.model_calls = 0
        self.started_tools = set()
        self._lock = threading.Lock()

    def bind(self):
        self.loop = asyncio.get_running_loop()
        self.queue = asyncio.Queue()

    def emit(self, payload):
        if self.loop is None or self.queue is None or self.loop.is_closed():
            return
        self.loop.call_soon_threadsafe(self.queue.put_nowait, payload)

    def trace(self, agent_id, kind, **details):
        with self._lock:
            self.sequence += 1
            sequence = self.sequence
        self.emit({"xray": {"id": f"{self.id}:{sequence}", "agent": agent_id, "kind": kind,
                            "timestamp": datetime.now(timezone.utc).isoformat(), **details}})

    def attach(self, agent):
        self.agent = agent
        if isinstance(agent, Agent):
            agent.hooks.add_hook(XrayHooks(self, "orchestrator"))
            agent.hooks.add_hook(ConsentHook(self))
            for role, specialist in getattr(agent, "roam_specialists", {}).items():
                specialist.hooks.add_hook(XrayHooks(self, role))

    def pause(self, result):
        self.pending = [{"id": item.id, "name": item.name, "reason": item.reason} for item in result.interrupts]
        self.busy = False
        self.expires = time.monotonic() + 900
        runs.keep(self)
        return {"run_id": self.id, "interrupts": self.pending, "expires_in_seconds": 900}


class XrayHooks(HookProvider):
    def __init__(self, run, role):
        self.run, self.role = run, role

    def register_hooks(self, registry, **kwargs):
        registry.add_callback(BeforeInvocationEvent, self.before_invocation)
        registry.add_callback(AfterInvocationEvent, self.after_invocation)
        registry.add_callback(BeforeModelCallEvent, self.before_model)
        registry.add_callback(AfterModelCallEvent, self.after_model)
        registry.add_callback(BeforeToolCallEvent, self.before_tool)
        registry.add_callback(AfterToolCallEvent, self.after_tool)

    def before_invocation(self, event):
        self.run.trace(self.role, "agent_started")

    def after_invocation(self, event):
        reason = event.result.stop_reason if event.result else "error"
        self.run.trace(self.role, "agent_finished", status=reason)

    def before_model(self, event):
        with self.run._lock:
            self.run.model_calls += 1
            count = self.run.model_calls
        if count > MAX_MODEL_CALLS:
            raise RuntimeError("Agent model-call limit reached")
        self.run.trace(self.role, "model_started")

    def after_model(self, event):
        self.run.trace(self.role, "model_finished", status="error" if event.exception else event.stop_response.stop_reason if event.stop_response else "done")

    def before_tool(self, event):
        key = (self.role, event.tool_use["toolUseId"])
        if key not in self.run.started_tools:
            self.run.started_tools.add(key)
            self.run.trace(self.role, "tool_started", tool=event.tool_use["name"], call_id=key[1])

    def after_tool(self, event):
        self.run.trace(self.role, "tool_finished", tool=event.tool_use["name"], call_id=event.tool_use["toolUseId"],
                       status="cancelled" if event.cancel_message else event.result.get("status", "success"),
                       duration_ms=round(event.duration * 1000) if event.duration is not None else None)


class ConsentHook(HookProvider):
    def __init__(self, run):
        self.run = run

    def register_hooks(self, registry, **kwargs):
        registry.add_callback(BeforeToolCallEvent, self.before_tool)

    async def before_tool(self, event):
        if event.tool_use["name"] != "update_itinerary":
            return
        if self.run.denied:
            event.cancel_tool = "The traveler declined this re-plan. Keep the current itinerary."
            return
        try:
            # No itinerary in the call means "publish the draft check_budget just accepted".
            draft = (event.tool_use.get("input") or {}).get("itinerary")
            if not self.run.updates.budget_checked(draft):
                return  # The tool asks the model to check the draft before requesting consent.
            candidate, notes = await asyncio.to_thread(self.run.updates.prepare, draft, freeze=True)
        except ValidationError:
            return  # Let the tool return its usual validation error so the model can repair it.
        before = self.run.body.current_itinerary
        mode = self.run.body.mode or (self.run.body.preferences.planning_style if self.run.body.preferences else None)
        if before is None and mode != "Hands-on":
            return
        if before is not None and before == candidate:
            return
        if self.run.updates.latest == candidate:
            return  # Repeating an already accepted snapshot does not need another review.
        preview = proposal_preview(before, candidate)
        preview["accuracy_notes"] = notes
        response = event.interrupt("roam.itinerary-consent", reason=preview)
        approved = isinstance(response, dict) and response.get("approved") is True
        self.run.trace("orchestrator", "consent_resolved", status="approved" if approved else "declined")
        if not approved:
            self.run.denied = True
            event.cancel_tool = "The traveler declined this re-plan. Keep the current itinerary and do not propose another update this turn."


class PausedRuns:
    def __init__(self):
        self._runs = {}
        self._lock = threading.Lock()

    def keep(self, run):
        with self._lock:
            now = time.monotonic()
            self._runs = {key: value for key, value in self._runs.items() if value.busy or value.expires > now}
            if run.id not in self._runs and len(self._runs) >= 100:
                raise HTTPException(503, "Too many plans are awaiting review. Please try again shortly.")
            self._runs[run.id] = run

    def claim(self, run_id, interrupt_ids):
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                raise HTTPException(404, "This review is no longer available. Send your change again.")
            if not run.busy and run.expires <= time.monotonic():
                self._runs.pop(run_id)
                raise HTTPException(410, "This review expired. Send your change again.")
            if run.busy:
                raise HTTPException(409, "This review is already being processed.")
            if set(interrupt_ids) != {item["id"] for item in run.pending} or len(interrupt_ids) != len(run.pending):
                raise HTTPException(409, "This review has changed. Review the latest proposal.")
            run.busy = True
            return run

    def discard(self, run_id):
        with self._lock:
            self._runs.pop(run_id, None)


runs = PausedRuns()
