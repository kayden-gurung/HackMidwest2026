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


def warm(routes: list[tuple[str, str]] | None = None) -> None:
    for start, destination in routes if routes is not None else demo_routes():
        began = time.monotonic()
        try:
            plan = build_first_plan(TripRequest(start=start, destination=destination, **DEFAULT_SETTINGS))
        except places.PlacesUnavailable as error:
            log.warning("warm %s -> %s: map services unavailable (%s)", start, destination, error)
            continue
        except Exception:  # never let warming take the backend down
            log.exception("warm %s -> %s failed", start, destination)
            continue
        if plan is None:
            log.warning("warm %s -> %s: no route found", start, destination)
        else:
            log.info("warm %s -> %s: ready in %.1f s, %d stops%s", start, destination, time.monotonic() - began,
                     len(plan.stops), f" ({'; '.join(plan.notes)})" if plan.notes else "")


def start_warming() -> None:
    """Warm the demo routes in a background thread, unless turned off or under the tests."""
    if "pytest" in sys.modules or not demo_routes():
        return
    threading.Thread(target=warm, name="roam-warm", daemon=True).start()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s: %(message)s")
    warm()
