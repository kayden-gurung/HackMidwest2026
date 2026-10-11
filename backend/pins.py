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
from evidence import Evidence, KnownPlace
from itinerary import Location

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
# ...and must not be the town itself, which is what Nominatim returns when it only matched the town.
TOWN_CENTER_M = 300


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _short(name: str) -> str:
    return name.split(",")[0].strip()


def _trip_town(items: list, evidence: Evidence) -> KnownPlace | None:
    """The town the trip is in: the looked-up area closest to the stops that already have pins."""
    towns = evidence.towns()
    if not towns:
        return None
    pinned = [i.location for i in items if i.location and i.location.lat is not None]
    if not pinned:
        return towns[0]
    lat = sum(p.lat for p in pinned) / len(pinned)
    lng = sum(p.lng for p in pinned) / len(pinned)
    return min(towns, key=lambda t: _distance_m(lat, lng, t.lat, t.lng))


# Only a whole town counts as "just the town". A district beside the center (Power & Light in
# Kansas City is 300 m from the official center point) is a real place to pin.
TOWN_LEVEL_KINDS = {"city", "town", "village", "hamlet", "municipality", "county", "state", "region", "country", "administrative"}


def _is_just_the_town(point: places.GeoPoint, town: KnownPlace) -> bool:
    near_center = _distance_m(point.lat, point.lng, town.lat, town.lng) < TOWN_CENTER_M
    return near_center and (point.kind in TOWN_LEVEL_KINDS or _short(point.name).lower() == _short(town.name).lower())


def _lookup(query: str, town: KnownPlace, radius_m: int) -> places.GeoPoint | None:
    point = places.geocode(query)
    if point is None or _is_just_the_town(point, town):
        return None
    return point if _distance_m(point.lat, point.lng, town.lat, town.lng) <= radius_m else None



def _pin(item, point: places.GeoPoint, evidence: Evidence, name: str | None = None) -> None:
    location = item.location
    label, _, address = point.name.partition(", ")
    item.location = Location(
        name=name or (location.name if location else label),
        address=(location.address if location and location.address else None) or (address[:400] or None),
        lat=point.lat,
        lng=point.lng,
    )
    if point.source_url:
        item.sourceUrls = [point.source_url]
        evidence.add_point({"name": point.name, "lat": point.lat, "lng": point.lng, "source_url": point.source_url, "kind": point.kind})


def pin_stops(items: list, evidence: Evidence) -> None:
    """Looks up unpinned stops by name in the trip's town and pins the good matches, in place."""
    town = _trip_town(items, evidence)
    if town is None:
        return
    lookups, limit, cache = 0, max_lookups(), {}
    try:
        for item in items:
            location = item.location
            if item.category == "Driving" or (location is not None and location.lat is not None):
                continue
            if lookups >= limit:
                return
            lookups += 1
            if location is None:
                continue  # a generic stop ("Lunch", "Free afternoon"): nothing to look up
            # The town name in the query keeps "Union Station" from matching the one in another city.
            point = _lookup(f"{location.name}, {_short(town.name)}", town, TOWN_RADIUS_M)
            if point is not None:
                _pin(item, point, evidence)
    except places.PlacesUnavailable:
        return  # the lookup service is down: leave the rest unpinned
