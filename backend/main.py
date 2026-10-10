from fastapi import FastAPI
from pydantic import BaseModel
from strands import Agent

app = FastAPI()


class Ask(BaseModel):
    prompt: str


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/ask")
def ask(body: Ask):
    agent = Agent()
    return {"reply": str(agent(body.prompt))}