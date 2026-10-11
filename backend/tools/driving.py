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
# Overnight towns are looked up one by one (about a second each), so only for drives up to this many days.
MAX_NAMED_DRIVE_DAYS = 6


def _number_from_env(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, ""))
    except ValueError:
        return default
    return value if value > 0 else default


class DriveDay(BaseModel):
    """One day of driving on the way there."""

    day: int
    start: str
    # Where this day's driving ends: the overnight town on the route, or the destination on the last day.
    end: str
    miles: int
    drive_hours: float
    google_maps_url: str
    # This day's piece of the route as [lat, lng] points, and where it ends, for drawing it on the map.
    # Kept from the AI (see evidence.recording_tools): the backend attaches them to the plan itself.
    path: list[list[float]] = []
    end_lat: float | None = None
    end_lng: float | None = None


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
    # The one-way drive split into days, with a real town to stop in at the end of each day.
    drive_days: list[DriveDay] = []
    # The drive back, already split the same way (empty for a one-way trip).
    drive_days_home: list[DriveDay] = []
    # One plain sentence with the numbers, so they are not misread: miles each way vs. round trip.
    summary: str = ""


def _home_days(days: list[DriveDay]) -> list[DriveDay]:
    """The same legs driven back, last town first."""
    return [
        DriveDay(day=index + 1, start=leg.end, end=leg.start, miles=leg.miles, drive_hours=leg.drive_hours,
                 google_maps_url=_directions_url(leg.end, leg.start) if "Overnight stop" not in leg.start + leg.end else leg.google_maps_url,
                 path=list(reversed(leg.path)),
                 end_lat=leg.path[0][0] if leg.path else None,
                 end_lng=leg.path[0][1] if leg.path else None)
        for index, leg in enumerate(reversed(days))
    ]


def _directions_url(origin: str, destination: str) -> str:
    return "https://www.google.com/maps/dir/?" + urlencode({"api": 1, "origin": origin, "destination": destination, "travelmode": "driving"})


def _points_along(coordinates: list, fractions: list[float]) -> list[tuple[float, float]]:
    """Points (lat, lng) at the given fractions of the route's length. `coordinates` are GeoJSON [lng, lat] pairs."""
    steps = [0.0]
    for (lng1, lat1), (lng2, lat2) in zip(coordinates, coordinates[1:]):
        steps.append(steps[-1] + places._distance_m(lat1, lng1, lat2, lng2))
    total = steps[-1] or 1.0
    points = []
    for fraction in fractions:
        target = fraction * total
        index = next((i for i, travelled in enumerate(steps) if travelled >= target), len(steps) - 1)
        lng, lat = coordinates[index]
        points.append((lat, lng))
    return points


# Points kept per day of driving: enough for a smooth line on the map, small enough to send around.
MAX_PATH_POINTS = 120


def _split_path(coordinates: list, days: int) -> list[list[list[float]]]:
    """The route cut into `days` even pieces by distance, as [lat, lng] points. `coordinates` are GeoJSON [lng, lat] pairs."""
    steps = [0.0]
    for (lng1, lat1), (lng2, lat2) in zip(coordinates, coordinates[1:]):
        steps.append(steps[-1] + places._distance_m(lat1, lng1, lat2, lng2))
    total = steps[-1] or 1.0
    cuts = [0] + [next((i for i, travelled in enumerate(steps) if travelled >= total * day / days), len(steps) - 1) for day in range(1, days)] + [len(coordinates) - 1]
    pieces = []
    for start, end in zip(cuts, cuts[1:]):
        piece = [[round(lat, 5), round(lng, 5)] for lng, lat in coordinates[start:end + 1]]
        stride = max(1, len(piece) // MAX_PATH_POINTS)
        # Thin evenly, but always keep the last point so the pieces join up.
        pieces.append(piece[::stride] + ([piece[-1]] if (len(piece) - 1) % stride else []))
    return pieces


def _drive_days(origin: str, destination: str, days: int, miles: float, hours: float, coordinates: list | None) -> list[DriveDay]:
    """Even daily legs. The overnight towns come from the route itself, so they are on the way."""
    fractions = [day / days for day in range(1, days)]
    towns: list[str | None] = [None] * len(fractions)
    if coordinates and len(coordinates) >= 2 and days <= MAX_NAMED_DRIVE_DAYS:
        towns = [places.town_at(lat, lng) for lat, lng in _points_along(coordinates, fractions)]
    ends = [town or f"Overnight stop after about {round(miles * (index + 1) / days)} miles" for index, town in enumerate(towns)] + [destination]
    starts = [origin, *ends[:-1]]
    paths = _split_path(coordinates, days) if coordinates and len(coordinates) >= 2 else [[] for _ in range(days)]
    return [
        DriveDay(
            day=day + 1,
            start=start,
            end=end,
            miles=round(miles / days),
            drive_hours=round(hours / days, 1),
            # A leg that ends at an unnamed point gets directions for the whole route.
            google_maps_url=_directions_url(start if not start.startswith("Overnight stop") else origin,
                                            end if not end.startswith("Overnight stop") else destination),
            path=paths[day],
            end_lat=paths[day][-1][0] if paths[day] else None,
            end_lng=paths[day][-1][1] if paths[day] else None,
        )
        for day, (start, end) in enumerate(zip(starts, ends))
    ]


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
        # The route shape: towns along the way for overnight stops, and the line drawn on the map.
        response = places._http().get(url, params={"overview": "full", "geometries": "geojson"}, timeout=ROUTE_TIMEOUT_S)
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
    days = max(1, math.ceil(hours / MAX_DRIVING_HOURS_PER_DAY), math.ceil(miles / max_miles_per_day) if max_miles_per_day else 1)
    geometry = routes[0].get("geometry")
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None

    drive_days = _drive_days(origin, destination, days, miles, hours, coordinates)
    summary = (
        f"{round(miles):,} miles each way ({round(total_miles):,} miles {'round trip' if round_trip else 'in total'}),"
        f" about {hours:.1f} hours of driving each way, split into {days} driving day{'s' if days > 1 else ''} each way"
        f" of about {round(miles / days):,} miles."
    )

    estimate = DriveEstimate(
        origin=start.name,
        destination=end.name,
        distance_miles=round(miles),
        drive_hours=round(hours, 1),
        driving_days_each_way=days,
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
        google_maps_url=_directions_url(origin, destination),
        source_urls=["https://www.openstreetmap.org/copyright", "https://project-osrm.org/"],
        drive_days=drive_days,
        drive_days_home=_home_days(drive_days) if round_trip else [],
        summary=summary,
    )
    _cache[key] = estimate
    return estimate


def clear_cache() -> None:
    _cache.clear()
