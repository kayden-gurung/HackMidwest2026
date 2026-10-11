"""Plans the demo routes ahead of time, so they load instantly in the app.

Every map answer is saved on disk (tools/places.py DiskCacheTransport), so once a route has been
planned it comes back in about a second, even after a restart and on bad venue wifi.

Runs by itself in the background when the backend starts. To run it by hand and watch it:
    docker compose exec backend python warm.py

Routes come from ROAM_WARM_ROUTES in backend/.env, as "Start > Destination; Start > Destination".
Set it to an empty value to turn warming off.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time

from tools import places
from trip_planner import TripRequest, build_first_plan

log = logging.getLogger("roam.warm")

# The routes the app features: the Trip setup default and the Dashboard trips.
DEFAULT_ROUTES = "Kansas City, MO > Denver, CO; Kansas City, MO > St. Louis, MO; Kansas City, MO > Omaha, NE; Kansas City, MO > Wichita, KS"
# The Trip setup screen's defaults (frontend/src/roadtrip/RoamApp.tsx initialDrive). The search along
# the route is the same for any interests; these make the rest of the default plan instant too.
DEFAULT_SETTINGS = {
    "interests": ["History", "Small towns", "Local food", "Nature"],
    "detour_budget_minutes": 60,
    "max_miles_per_day": 450,
    "mpg": 28,
    "gas_price": 3.25,
}


def demo_routes() -> list[tuple[str, str]]:
    setting = os.getenv("ROAM_WARM_ROUTES", DEFAULT_ROUTES)
    routes = []
    for pair in setting.split(";"):
        start, _, destination = pair.partition(">")
        if start.strip() and destination.strip():
            routes.append((start.strip(), destination.strip()))
    return routes


# Routes that could not be warmed (the map services were down or refusing) are tried again later.
RETRY_ROUNDS = 5
RETRY_WAIT_S = 120


def _warm_one(start: str, destination: str) -> bool:
    """True when the route is done (planned, or has no road); False to try again later."""
    # A traveler's request comes first: wait until it is done.
    while places.traveler_waiting():
        time.sleep(1)
    began = time.monotonic()
    try:
        plan = build_first_plan(TripRequest(start=start, destination=destination, **DEFAULT_SETTINGS))
    except places.PlacesUnavailable as error:
        log.warning("warm %s -> %s: map services unavailable (%s)", start, destination, error)
        return False
    except Exception:  # never let warming take the backend down
        log.exception("warm %s -> %s failed", start, destination)
        return True
    if plan is None:
        log.warning("warm %s -> %s: no route found", start, destination)
        return True
    if not plan.stops and plan.notes:
        # The route worked but the place search did not: try again later for the stops.
        log.warning("warm %s -> %s: route ready, stops not yet (%s)", start, destination, "; ".join(plan.notes))
        return False
    log.info("warm %s -> %s: ready in %.1f s, %d stops", start, destination, time.monotonic() - began, len(plan.stops))
    return True


def warm(routes: list[tuple[str, str]] | None = None, rounds: int = RETRY_ROUNDS, wait_s: float = RETRY_WAIT_S) -> None:
    pending = list(routes if routes is not None else demo_routes())
    for round_number in range(rounds):
        pending = [route for route in pending if not _warm_one(*route)]
        if not pending or round_number == rounds - 1:
            break
        log.info("warm: %d route(s) will be tried again in %d s", len(pending), wait_s)
        time.sleep(wait_s)
    if pending:
        log.warning("warm: gave up on %s for now; they will be planned live when asked for",
                    ", ".join(f"{a} -> {b}" for a, b in pending))


def start_warming() -> None:
    """Warm the demo routes in a background thread, unless turned off or under the tests."""
    if "pytest" in sys.modules or not demo_routes():
        return
    # The name marks its map searches as background work (tools/places.py _overpass_slot).
    threading.Thread(target=warm, name=places.BACKGROUND_THREAD_PREFIX, daemon=True).start()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s: %(message)s")
    warm()
