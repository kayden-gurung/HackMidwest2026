from fastapi import APIRouter
from pydantic import BaseModel
from strands import Agent

router = APIRouter(prefix="/api", tags=["chat"])


class AskRequest(BaseModel):
    prompt: str


class AskResponse(BaseModel):
    reply: str


@router.post("/ask", response_model=AskResponse)
def ask(body: AskRequest):
    agent = Agent()
    return {"reply": str(agent(body.prompt))}
