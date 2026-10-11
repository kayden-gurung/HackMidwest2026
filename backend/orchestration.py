"""Actual Strands specialist agents exposed as typed tools to the orchestrator."""

from strands import Agent, tool
from strands.tools.executors import SequentialToolExecutor

from aws_errors import aws_error_response
from budget import analyze_budget
from itinerary import ItinerarySnapshot
from prompts.travel import CHAT_PROMPT

ORCHESTRATOR_PROMPT = """
You coordinate a team of travel specialists. For concrete plans, delegate place research to
research_places and driving routes to plan_transport
when relevant. Your instructions may name lookup tools such as find_places or plan_drive:
the specialists hold those tools, so delegate instead and copy
the names, coordinates, links, miles and legs they return exactly.
Delegate live forecast checks to research_places for dated outdoor plans and weather disruptions.
Include the traveler's constraints and relevant current stops in each task, in a few sentences.
These tools run other Strands agents, not canned answers.
WRITE THE PLAN ONCE. Writing a full itinerary is the slowest thing you do, so:
1. Call check_budget with the complete draft. This is the only time you write the itinerary out.
2. For a new plan, or whenever check_budget shows the plan over budget or with unknown costs,
   call review_trip_budget with a one- or two-sentence task. The Budget specialist reads the
   checked draft itself: never paste the itinerary into a task.
3. Call update_itinerary with NO arguments. It publishes the checked draft.
Only if you change the draft do you write it again, with a new check_budget call.
Specialists share verified lookup evidence with itinerary validation. Synthesize their findings;
only you may call update_itinerary. For a disruption, preserve unaffected stops and propose a
concrete replacement. update_itinerary may pause for human consent. Until approved, describe it as
a proposal, never as an applied change. A proposal still requires the update_itinerary call: the
traveler approves or declines it from the review card, so do not ask for permission in text
instead of calling it. If consent is denied, keep the original plan and ask what the traveler
prefers; do not try another update in the same turn. Weather claims require
get_forecast evidence; describe unavailable or out-of-range forecasts honestly.
Do not delegate greetings, clarifying questions, or unrelated requests. Keep delegation focused.
"""

SPECIALIST_PROMPTS = {
    "places": "You are the Places specialist. Research verified places using find_places and locate. Use get_forecast for dated outdoor plans and weather-related revisions; return only covered dates, units, source URLs and retrieval time. Return concise findings, exact source URLs, coordinates and unavailable-data notes. Do not write a full itinerary or claim to update any panels.",
    "transport": "You are the Transport specialist. By road: use plan_drive for distances, driving times and fuel estimates; locate may resolve stops. Respect car mode and daily driving limits. Return plan_drive's summary, fuel cost and assumptions, and every leg of drive_days and drive_days_home exactly as returned: start, end, miles, hours and that leg's google_maps_url. Roam plans drives only: never suggest flights. Copy every link character for character. Do not update the itinerary.",
    "budget": "You are the Budget specialist. Call calculate_budget with no arguments: it reads the draft the orchestrator just checked, so you never need the itinerary pasted to you. Compare the total for all travelers with the budget, flag unknown or excluded costs, and suggest specific tradeoffs if over budget. Keep it to a few sentences. Prices are estimates, never booking quotes. Do not update the itinerary.",
}

NO_CHECKED_DRAFT = "No draft has been checked yet. Call check_budget with the complete draft first, then ask for a review."


async def specialist_reply(specialist: Agent, task: str) -> str:
    try:
        return str(await specialist.invoke_async(task))
    except Exception as error:
        # SDK tool exceptions become model-visible results. Keep upstream details out of those too.
        _, detail = aws_error_response(error)
        raise RuntimeError(detail) from None


def budget_report(plan: ItinerarySnapshot) -> dict:
    return {**analyze_budget(plan), "assumptions": plan.assumptions, "cost_basis": "USD estimates for all travelers",
            "stops": [{"id": item.id, "date": item.date.isoformat(), "title": item.title, "category": item.category, "costUsd": item.costUsd}
                      for item in plan.items]}


def specialist_tools(model, travel_tools: list, checked_draft=None) -> tuple[list, dict[str, Agent]]:
    """`checked_draft` returns the draft check_budget last accepted, so no model has to retype it."""
    by_name = {item.tool_name: item for item in travel_tools}
    names = {"places": ["find_places", "locate", "get_forecast"],
             "transport": ["plan_drive", "locate"]}

    @tool
    def calculate_budget(itinerary: ItinerarySnapshot | None = None) -> dict:
        """Calculate USD estimates for all travelers and flag unknown costs and budget overruns.

        Call with no arguments to review the draft the orchestrator last checked.

        Args:
            itinerary: Leave this out. Only for reviewing a different complete plan.
        """
        plan = ItinerarySnapshot.model_validate(itinerary) if itinerary is not None else (checked_draft() if checked_draft else None)
        if plan is None:
            return {"status": "no_checked_draft", "message": NO_CHECKED_DRAFT}
        return budget_report(plan)

    specialists = {
        role: Agent(model=model, agent_id=role, name=role.title(),
                    system_prompt=CHAT_PROMPT + "\n" + prompt,
                    tools=[calculate_budget] if role == "budget" else [by_name[name] for name in names[role] if name in by_name],
                    callback_handler=None, retry_strategy=None, tool_executor=SequentialToolExecutor())
        for role, prompt in SPECIALIST_PROMPTS.items()
    }

    @tool
    async def research_places(task: str) -> str:
        """Delegate verified places and live weather forecasts to the Places specialist.

        Args:
            task: Focused research task with destination, interests, constraints and relevant stops.
        """
        return await specialist_reply(specialists["places"], task)

    @tool
    async def plan_transport(task: str) -> str:
        """Delegate routes, driving feasibility and transport estimates to the Transport specialist.

        Args:
            task: Origin, destination, travelers, budget and transport constraints to investigate.
        """
        return await specialist_reply(specialists["transport"], task)

    @tool
    async def review_trip_budget(task: str) -> str:
        """Delegate budget tradeoffs for the draft you just checked to the Budget specialist.

        Call check_budget first: the specialist reads that checked draft itself. Never paste
        the itinerary here.

        Args:
            task: One or two sentences: the traveler's budget priorities and what to weigh.
        """
        if checked_draft is not None and checked_draft() is None:
            return NO_CHECKED_DRAFT
        return await specialist_reply(specialists["budget"], task)

    return [research_places, plan_transport, review_trip_budget], specialists
