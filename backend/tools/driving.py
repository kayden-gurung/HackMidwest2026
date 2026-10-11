"""Driving distance and cost between two places, for road trips. Free, no API key.

Coordinates come from the place lookup in tools/places.py (OpenStreetMap). The route comes from
the public OSRM demo server, which answers with real road distance and typical driving time.
Fuel cost is an estimate from two stated assumptions, never a looked-up price.
"""

from __future__ import annotations

import math
import os
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel

from tools import places

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
ROUTE_TIMEOUT_S = 15.0
METERS_PER_MILE = 1609.344
# A comfortable amount of driving in one day for a leisure trip.
MAX_DRIVING_HOURS_PER_DAY = 6


def _number_from_env(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


class DriveEstimate(BaseModel):
    origin: str
    destination: str
    # One way, by road.
    distance_miles: int
    drive_hours: float
    # One-way driving split into comfortable days (at most 6 hours, and at most the traveler's miles-per-day limit).
    driving_days_each_way: int
    # The traveler's limit on driving per day, when they set one in car mode.
    max_miles_per_day: int | None = None
    round_trip: bool
    # Fuel for the whole drive (both directions when round_trip), for one car.
    fuel_cost_usd: int
    # How the fuel figure was worked out. Show these to the traveler with the estimate.
    assumptions: list[str]
    google_maps_url: str
    source_urls: list[str]


_cache: dict[tuple[str, str, bool, int | None], DriveEstimate | None] = {}


def estimate_drive(origin: str, destination: str, round_trip: bool = True, max_miles_per_day: int | None = None) -> DriveEstimate | None:
    """Road distance, driving time and estimated fuel cost between two places.

    Returns None when either place is unknown or there is no road route (an ocean in the way).
    Raises PlacesUnavailable when the map services cannot be reached.
    """
    max_miles_per_day = max_miles_per_day if max_miles_per_day and max_miles_per_day > 0 else None
    key = (" ".join(origin.split()).lower(), " ".join(destination.split()).lower(), round_trip, max_miles_per_day)
    if key in _cache:
        return _cache[key]

    start, end = places.geocode(origin), places.geocode(destination)
    if start is None or end is None:
        return None

    url = f"{OSRM_URL}/{start.lng:.6f},{start.lat:.6f};{end.lng:.6f},{end.lat:.6f}"
    try:
        response = places._http().get(url, params={"overview": "false"}, timeout=ROUTE_TIMEOUT_S)
        # OSRM answers 400 with code "NoRoute" when the two points are not connected by road.
        body = response.json()
        if response.status_code >= 500:
            response.raise_for_status()
    except (httpx.HTTPError, ValueError) as error:
        raise places.PlacesUnavailable("The driving directions service is not responding. Try again in a moment.") from error

    routes = body.get("routes") if isinstance(body, dict) else None
    if not routes or body.get("code") != "Ok":
        _cache[key] = None
        return None

    try:
        miles = float(routes[0]["distance"]) / METERS_PER_MILE
        hours = float(routes[0]["duration"]) / 3600
    except (KeyError, TypeError, ValueError):
        return None

    mpg = _number_from_env("ROAM_CAR_MPG", 27)
    gas_price = _number_from_env("ROAM_GAS_USD_PER_GALLON", 3.40)
    total_miles = miles * (2 if round_trip else 1)

    estimate = DriveEstimate(
        origin=start.name,
        destination=end.name,
        distance_miles=round(miles),
        drive_hours=round(hours, 1),
        driving_days_each_way=max(1, math.ceil(hours / MAX_DRIVING_HOURS_PER_DAY), math.ceil(miles / max_miles_per_day) if max_miles_per_day else 1),
        max_miles_per_day=max_miles_per_day,
        round_trip=round_trip,
        fuel_cost_usd=round(total_miles / mpg * gas_price),
        assumptions=[
            f"Fuel estimated at {mpg:g} miles per gallon and ${gas_price:.2f} per gallon, for one car"
            + (", there and back." if round_trip else ", one way."),
            "Driving time is without traffic, fuel or rest stops.",
            *([f"Driving days keep each day under {max_miles_per_day} miles, as the traveler asked."] if max_miles_per_day else []),
            "Tolls, parking and any car rental are not included.",
        ],
        google_maps_url="https://www.google.com/maps/dir/?"
        + urlencode({"api": 1, "origin": origin, "destination": destination, "travelmode": "driving"}),
        source_urls=["https://www.openstreetmap.org/copyright", "https://project-osrm.org/"],
    )
    _cache[key] = estimate
    return estimate


def clear_cache() -> None:
    _cache.clear()
