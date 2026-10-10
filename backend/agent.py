import os

from botocore.config import Config
from strands import Agent, tool
from strands.models import BedrockModel
from tools import get_travel_tools

DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

SYSTEM_PROMPT = os.getenv(
    "AGENT_SYSTEM_PROMPT",
    """You are Roam, a friendly travel-planning assistant. Help travelers choose
destinations, build practical day-by-day itineraries, estimate budgets in USD,
and revise plans as their preferences change. Use the conversation to remember
the destination, dates, budget, travelers, and interests. Ask a short clarifying
question when an essential detail is missing, or state reasonable assumptions
when the traveler wants suggestions. Keep replies concise and easy to scan.
Respect the total trip budget for all travelers. Label costs as estimates and
explain excluded costs. Use find_places and locate to verify specific places and
coordinates with OpenStreetMap. Attribute source links from tools. These tools
do not provide prices, availability, ratings or bookings. Opening hours are map
data that may need confirmation. Say when information needs verification. Do not
claim to have booked anything. Use update_itinerary whenever you suggest or revise
a concrete plan so the Plan, Map and Budget panels match the chat. Do not only
describe the plan in text. When plans change, preserve unaffected activities and
explain the changes. Treat the current itinerary as the latest plan; older chat
may describe superseded plans. If dates are flexible, choose explicitly stated
example dates and label them as assumptions. Keep USD estimates separate from
any requested display currency. Keep place lookups focused and avoid repeated
searches for unchanged stops.""",
)


@tool
def word_count(text: str) -> int:
    """Count the words in a piece of text."""
    return len(text.split())


def build_agent(messages: list | None = None, extra_tools: list | None = None) -> Agent:
    model = BedrockModel(
        model_id=os.getenv("BEDROCK_MODEL_ID", "").strip() or DEFAULT_MODEL_ID,
        region_name=(os.getenv("AWS_REGION", "").strip()
                     or os.getenv("AWS_DEFAULT_REGION", "").strip() or "us-west-2"),
        boto_client_config=Config(
            connect_timeout=10,
            read_timeout=60,
            retries={"mode": "standard", "total_max_attempts": 2},
        ),
    )
    # Let botocore retry transient failures once. Strands' default six attempts
    # otherwise keep requests waiting for minutes when account quotas are zero.
    return Agent(model=model, messages=messages, system_prompt=SYSTEM_PROMPT, tools=[word_count, *get_travel_tools(), *(extra_tools or [])],
                 callback_handler=None, retry_strategy=None)
