import os

from botocore.config import Config
from strands import Agent
from strands.models import BedrockModel
from prompts.travel import CHAT_PROMPT
from tools import get_travel_tools

DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

# The chat instructions live in prompts/travel.py. AGENT_SYSTEM_PROMPT in backend/.env overrides them for experiments.
SYSTEM_PROMPT = os.getenv("AGENT_SYSTEM_PROMPT", "").strip() or CHAT_PROMPT

# Lower temperature = more consistent, more literal answers. Override with MODEL_TEMPERATURE in backend/.env.
DEFAULT_TEMPERATURE = 0.3


def _temperature() -> float:
    try:
        return min(max(float(os.getenv("MODEL_TEMPERATURE", "")), 0.0), 1.0)
    except ValueError:
        return DEFAULT_TEMPERATURE


def build_model() -> BedrockModel:
    return BedrockModel(
        model_id=os.getenv("BEDROCK_MODEL_ID", "").strip() or DEFAULT_MODEL_ID,
        region_name=(os.getenv("AWS_REGION", "").strip()
                     or os.getenv("AWS_DEFAULT_REGION", "").strip() or "us-west-2"),
        boto_client_config=Config(
            connect_timeout=10,
            read_timeout=60,
            retries={"mode": "standard", "total_max_attempts": 2},
        ),
        temperature=_temperature(),
    )


def build_agent(messages: list | None = None, extra_tools: list | None = None, travel_tools: list | None = None,
                hooks: list | None = None) -> Agent:
    """`travel_tools` replaces the default place tools, e.g. with recording versions (see evidence.py)."""
    model = build_model()
    # Let botocore retry transient failures once. Strands' default six attempts
    # otherwise keep requests waiting for minutes when account quotas are zero.
    return Agent(model=model, messages=messages, system_prompt=SYSTEM_PROMPT, tools=[*(get_travel_tools() if travel_tools is None else travel_tools), *(extra_tools or [])],
                 callback_handler=None, retry_strategy=None, hooks=hooks)
