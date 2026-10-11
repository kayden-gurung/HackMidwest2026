import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from routers import ask, health, places, trips

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Plan the demo routes in the background, so they load instantly (see warm.py).
    from warm import start_warming

    start_warming()
    yield


app = FastAPI(title="Roam API", lifespan=lifespan)

# Roam's own log lines (timings, warnings) in `docker compose logs backend`, next to uvicorn's.
_roam_log = logging.getLogger("roam")
if not _roam_log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
    _roam_log.addHandler(_handler)
    _roam_log.setLevel(logging.INFO)

# One router per feature so teammates can work independently.
app.include_router(health.router)
app.include_router(ask.router)
app.include_router(places.router)
app.include_router(trips.router)
