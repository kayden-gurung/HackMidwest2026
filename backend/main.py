import json
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent import build_agent
from aws_errors import aws_error_response

app = FastAPI()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)


class Ask(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=40)
    mode: Literal["Co-pilot", "Surprise me"] = "Co-pilot"


def agent_for_request(body: Ask):
    messages = [{"role": message.role, "content": [{"text": message.content}]} for message in body.history]
    agent = build_agent(messages=messages)
    mode_instruction = (
        "Ask for missing essential preferences before making a detailed plan."
        if body.mode == "Co-pilot" else
        "Offer a creative plan using explicitly stated assumptions when preferences are missing."
    )
    agent.system_prompt = f"{agent.system_prompt}\nTraveler's planning style: {mode_instruction}"
    return agent


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/ask")
def ask(body: Ask):
    try:
        return {"reply": str(agent_for_request(body)(body.prompt))}
    except Exception as error:
        status, detail = aws_error_response(error)
        raise HTTPException(status_code=status, detail=detail) from None


@app.post("/api/ask/stream")
async def ask_stream(body: Ask):
    """Server-sent events: {"text": ...} chunks, {"tool": name} on tool use, then {"done": true}."""
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
