import json
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent import build_agent
from aws_errors import aws_error_response
from schemas import Preferences, describe_preferences

router = APIRouter(prefix="/api", tags=["chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)


class AskRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    # The traveler's settings. Optional, so `{"prompt": "..."}` alone still works.
    preferences: Preferences | None = None
    history: list[ChatMessage] = Field(default_factory=list, max_length=40)
    mode: Literal["Hands-on", "Co-pilot", "Surprise me"] | None = None


class AskResponse(BaseModel):
    reply: str


def agent_for_request(body: AskRequest):
    messages = [{"role": message.role, "content": [{"text": message.content}]} for message in body.history]
    agent = build_agent(messages=messages)
    mode = body.mode or (body.preferences.planning_style if body.preferences else None) or "Co-pilot"
    mode_instruction = {
        "Hands-on": "Present options and ask the traveler to choose before making a detailed plan.",
        "Co-pilot": "Ask for missing essential preferences before making a detailed plan.",
        "Surprise me": "Offer a creative plan using explicitly stated assumptions when preferences are missing.",
    }.get(mode, "Ask for missing essential preferences before making a detailed plan.")
    context = describe_preferences(body.preferences)
    agent.system_prompt = f"{agent.system_prompt}\n{context}\nTraveler's planning style: {mode_instruction}"
    return agent


@router.post("/ask", response_model=AskResponse)
def ask(body: AskRequest):
    try:
        return {"reply": str(agent_for_request(body)(body.prompt))}
    except Exception as error:
        status, detail = aws_error_response(error)
        raise HTTPException(status_code=status, detail=detail) from None


@router.post("/ask/stream")
async def ask_stream(body: AskRequest):
    """SSE text/tool chunks, safe error events, and a final done event."""
    async def events():
        try:
            agent = agent_for_request(body)
            async for ev in agent.stream_async(body.prompt):
                if "data" in ev:
                    yield f"data: {json.dumps({'text': ev['data']})}\n\n"
                elif "current_tool_use" in ev and ev["current_tool_use"].get("name"):
                    yield f"data: {json.dumps({'tool': ev['current_tool_use']['name']})}\n\n"
        except Exception as error:
            status, detail = aws_error_response(error)
            yield f"data: {json.dumps({'error': detail, 'status': status})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
