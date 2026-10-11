from fastapi import FastAPI

from routers import ask, explore, health, places

app = FastAPI(title="Roam API")

# One router per feature so teammates can work independently.
app.include_router(health.router)
app.include_router(ask.router)
app.include_router(places.router)
app.include_router(explore.router)
