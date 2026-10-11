"""Airports near a place, and links to search real flight tickets.

Roam has no flight data source, so nothing here gives fares, airlines or schedules. Airports come
from OpenStreetMap (via Nominatim); the links open Google Flights and Kayak searches already
filled in with the airports, dates and number of travelers.
"""

from __future__ import annotations

import math
import re
from datetime import date
from urllib.parse import quote, urlencode

import httpx
from pydantic import BaseModel

from tools import places

# Searched in this order: big airports from further away, then any airport nearby. One search
# alone misses airports, because each answer holds at most 40 airfields and small ones crowd it.
AIRPORT_SEARCHES = (("international airport", 150_000), ("airport", 60_000))
MAX_AIRPORTS = 5
_IATA = re.compile(r"^[A-Z]{3}$")
_MILITARY = re.compile(r"\b(air force|air base|space force|naval|army|military)\b", re.IGNORECASE)


class Airport(BaseModel):
    name: str
    iata: str
    lat: float
    lng: float
    distance_km: int
    international: bool
    website_url: str | None = None
    source_urls: list[str]


_cache: dict[str, list[Airport] | None] = {}


def _box(lat: float, lng: float, radius_m: int) -> str:
    lat_span = radius_m / 111_320
    lng_span = lat_span / max(math.cos(math.radians(lat)), 0.01)
    return f"{lng - lng_span},{lat + lat_span},{lng + lng_span},{lat - lat_span}"


def _airport(result: dict, origin: places.GeoPoint) -> Airport | None:
    names = result.get("namedetails") or {}
    tags = result.get("extratags") or {}
    iata = str(names.get("iata") or "").strip().upper()
    name = names.get("name:en") or result.get("name") or names.get("name")
    if result.get("category") != "aeroway" or result.get("type") != "aerodrome" or not _IATA.match(iata) or not name:
        return None
    # Air force bases have airport codes but no passenger flights.
    if tags.get("military") or tags.get("aerodrome:type") == "military" or _MILITARY.search(name):
        return None
    try:
        lat, lng = float(result["lat"]), float(result["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    osm_type, osm_id = result.get("osm_type"), result.get("osm_id")
    return Airport(
        name=name,
        iata=iata,
        lat=lat,
        lng=lng,
        distance_km=round(places._distance_m(origin.lat, origin.lng, lat, lng) / 1000),
        international="international" in f"{tags.get('aerodrome', '')} {tags.get('aerodrome:type', '')} {name}".lower(),
        website_url=places._web_url(tags.get("website")),
        source_urls=[f"https://www.openstreetmap.org/{osm_type}/{osm_id}"] if osm_type in ("node", "way", "relation") and osm_id else [],
    )


def find_airports(near: str) -> list[Airport] | None:
    """Passenger airports near a place, international ones first, then nearest. None when the place is unknown.

    Raises PlacesUnavailable when the lookup service cannot be reached.
    """
    key = " ".join(near.split()).lower()
    if key in _cache:
        return _cache[key]
    origin = places.geocode(near)
    if origin is None:
        return None

    found: dict[str, tuple[float, Airport]] = {}
    for query, radius_m in AIRPORT_SEARCHES:
        try:
            results = places.nominatim_request(places.NOMINATIM_URL, {
                "q": query, "format": "jsonv2", "limit": 40, "extratags": 1, "namedetails": 1,
                "viewbox": _box(origin.lat, origin.lng, radius_m), "bounded": 1,
            })
        except (httpx.HTTPError, ValueError) as error:
            raise places.PlacesUnavailable("The airport lookup service is not responding. Try again in a moment.") from error
        for result in results if isinstance(results, list) else []:
            airport = _airport(result, origin)
            if airport and airport.iata not in found:
                found[airport.iata] = (float(result.get("importance") or 0), airport)

    ranked = sorted(found.values(), key=lambda pair: (not pair[1].international, -pair[0], pair[1].distance_km))
    airports = [airport for _, airport in ranked[:MAX_AIRPORTS]]
    _cache[key] = airports
    return airports


def flight_search_links(from_iata: str, to_iata: str, depart: date | None = None, return_on: date | None = None, travelers: int = 1) -> dict[str, str]:
    """Google Flights and Kayak searches for a route, filled in with dates and travelers when known."""
    origin, destination = from_iata.strip().upper(), to_iata.strip().upper()
    if not (_IATA.match(origin) and _IATA.match(destination)):
        raise ValueError("Airport codes must be three letters, e.g. JFK.")
    travelers = max(1, min(int(travelers), 9))

    words = f"Flights from {origin} to {destination}"
    if depart:
        words += f" on {depart.isoformat()}"
    if depart and return_on:
        words += f" through {return_on.isoformat()}"
    words += f" for {travelers} {'adult' if travelers == 1 else 'adults'}"
    google = "https://www.google.com/travel/flights?" + urlencode({"q": words, "hl": "en"})

    kayak = f"https://www.kayak.com/flights/{quote(origin)}-{quote(destination)}"
    if depart:
        kayak += f"/{depart.isoformat()}" + (f"/{return_on.isoformat()}" if return_on else "") + f"/{travelers}adults"
    return {"google_flights_url": google, "kayak_url": kayak}


def clear_cache() -> None:
    _cache.clear()
