import os

from fastapi import APIRouter
from pydantic import BaseModel, Field
from strands import Agent
from strands.models import BedrockModel

from schemas import Preferences, describe_preferences

router = APIRouter(prefix="/api", tags=["chat"])


def make_model() -> BedrockModel:
    """The Bedrock model from backend/.env (BEDROCK_MODEL_ID, AWS_REGION), or Strands' default if unset."""
    model_id = os.getenv("BEDROCK_MODEL_ID")
    region = os.getenv("AWS_REGION")
    kwargs = {}
    if model_id:
        kwargs["model_id"] = model_id
    if region:
        kwargs["region_name"] = region
    return BedrockModel(**kwargs)


class AskRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    # The traveler's settings. Optional, so `{"prompt": "..."}` alone still works.
    preferences: Preferences | None = None


class AskResponse(BaseModel):
    reply: str


@router.post("/ask", response_model=AskResponse)
def ask(body: AskRequest):
    # PLACEHOLDER until the planner agent (backend/agents/) exists: the preferences are put in
    # front of the message so the model can see them. The agent owner should move them into the
    # system prompt and add `tools=get_travel_tools()` from the tools package.
    context = describe_preferences(body.preferences)
    prompt = f"{context}\n\nTraveler's message:\n{body.prompt}" if context else body.prompt
    agent = Agent(model=make_model())
    return {"reply": str(agent(prompt))}
