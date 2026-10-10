from fastapi import FastAPI

from routers import ask, health, places

app = FastAPI(title="Roam API")

# One router per feature (routers/<feature>.py) so teammates don't all edit this file.
app.include_router(health.router)
app.include_router(ask.router)
app.include_router(places.router)
