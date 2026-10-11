"""Actual Strands specialist agents exposed as typed tools to the orchestrator."""

from strands import Agent, tool
from strands.tools.executors import SequentialToolExecutor

from aws_errors import aws_error_response
from budget import analyze_budget
from itinerary import ItinerarySnapshot
from prompts.travel import CHAT_PROMPT

ORCHESTRATOR_PROMPT = """
You coordinate a team of travel specialists. For concrete plans, delegate place research to
research_places, transport to plan_transport when relevant, and the complete candidate plan to
review_trip_budget, then call check_budget on the exact complete draft before update_itinerary.
Delegate live forecast checks to research_places for dated outdoor plans and weather disruptions.
Include the traveler's constraints and relevant
current stops in each task. These tools run other Strands agents, not canned answers.
Specialists share verified lookup evidence with itinerary validation. Synthesize their findings;
only you may call update_itinerary. For a disruption, preserve unaffected stops and propose a
concrete replacement. update_itinerary may pause for human consent. Until approved, describe it as
a proposal, never as an applied change. If consent is denied, keep the original plan and ask what
the traveler prefers; do not try another update in the same turn. Weather claims require
get_forecast evidence; describe unavailable or out-of-range forecasts honestly.
Do not delegate greetings, clarifying questions, or unrelated requests. Keep delegation focused.
"""

SPECIALIST_PROMPTS = {
    "places": "You are the Places specialist. Research verified places using find_places and locate. Use get_forecast for dated outdoor plans and weather-related revisions; return only covered dates, units, source URLs and retrieval time. Return concise findings, exact source URLs, coordinates and unavailable-data notes. Do not write a full itinerary or claim to update any panels.",
    "transport": "You are the Transport specialist. Use plan_drive for distances, driving times and fuel estimates; locate may resolve stops. Respect car mode and daily driving limits. You have no live flight data. Return practical routes, assumptions and source URLs. Do not update the itinerary.",
    "budget": "You are the Budget specialist. Use calculate_budget on the full candidate itinerary to check arithmetic. Compare the total for all travelers with the budget, flag unknown or excluded costs, and suggest specific tradeoffs if over budget. Prices are estimates, never booking quotes. Do not update the itinerary.",
}


async def specialist_reply(specialist: Agent, task: str) -> str:
    try:
        return str(await specialist.invoke_async(task))
    except Exception as error:
        # SDK tool exceptions become model-visible results. Keep upstream details out of those too.
        _, detail = aws_error_response(error)
        raise RuntimeError(detail) from None


@tool
def calculate_budget(itinerary: ItinerarySnapshot) -> dict:
    """Calculate USD estimates for all travelers and flag unknown costs and budget overruns.

    Args:
        itinerary: Complete candidate plan to review, with total-party cost estimates.
    """
    plan = ItinerarySnapshot.model_validate(itinerary)
    return {**analyze_budget(plan),
            "assumptions": plan.assumptions, "cost_basis": "USD estimates for all travelers"}


def specialist_tools(model, travel_tools: list) -> tuple[list, dict[str, Agent]]:
    by_name = {item.tool_name: item for item in travel_tools}
    names = {"places": ["find_places", "locate", "get_forecast"], "transport": ["plan_drive", "locate"]}
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
        """Delegate candidate itinerary arithmetic and budget tradeoffs to the Budget specialist.

        Args:
            task: Complete candidate itinerary JSON and the traveler's total-party budget constraints.
        """
        return await specialist_reply(specialists["budget"], task)

    return [research_places, plan_transport, review_trip_budget], specialists
