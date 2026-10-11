"""Puts stops on the map that the model named but did not look up.

The model often calls `locate` for the town and then skips find_places for the individual stops.
validation.py removes the stand-in town-center pins it gives them; this looks each of those stops
up by name *in that town* so it lands where it really is. A match is used only when it is inside
the town area and is not just the town center itself, so a miss leaves the stop unpinned rather
than wrong.
"""

from __future__ import annotations

import math
import os

import tools.places as places
from evidence import Evidence

# How many stops to look up per plan. Nominatim allows one request a second, so each lookup can add
# about a second to the reply. Override with ROAM_MAX_PIN_LOOKUPS in backend/.env.
DEFAULT_MAX_LOOKUPS = 15


def max_lookups() -> int:
    try:
        return max(0, min(int(os.getenv("ROAM_MAX_PIN_LOOKUPS", "")), 50))
    except ValueError:
        return DEFAULT_MAX_LOOKUPS
# A match must be within this distance of the town...
TOWN_RADIUS_M = 40_000
# ...but not on the town center itself, which is what Nominatim returns when it only matched the town.
TOWN_CENTER_M = 300


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def pin_stops(items: list, evidence: Evidence) -> None:
    """Looks up unpinned stops by name near the trip's town(s) and pins the good matches, in place."""
    towns = list(evidence.points)
    if not towns:
        return
    lookups, limit = 0, max_lookups()
    for item in items:
        location = item.location
        if location is None or location.lat is not None or item.category in ("Flights", "Driving"):
            continue
        if lookups >= limit:
            return
        # The town name in the query keeps "Union Station" from matching the one in another city.
        town = next((t for t in towns if location.address and location.address == t.name), towns[0])
        query = f"{location.name}, {town.name.split(',')[0]}"
        lookups += 1
        try:
            point = places.geocode(query)
        except places.PlacesUnavailable:
            return  # the lookup service is down: leave the rest unpinned
        if point is None:
            continue
        distance = _distance_m(point.lat, point.lng, town.lat, town.lng)
        if distance > TOWN_RADIUS_M or distance < TOWN_CENTER_M:
            continue
        item.location = location.model_copy(update={"lat": point.lat, "lng": point.lng})
        if point.source_url:
            item.sourceUrls = [point.source_url]
            evidence.add_place({"name": location.name, "lat": point.lat, "lng": point.lng, "source_urls": [point.source_url], "address": location.address})
