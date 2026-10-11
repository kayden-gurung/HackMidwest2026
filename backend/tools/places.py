"""Real place lookup on OpenStreetMap data. Free, no API key.

Two services are used:
- Nominatim turns a place name ("Polignano a Mare") into coordinates.
- Overpass finds restaurants, stays and things to do around those coordinates.

These are plain functions so they can be called from a route, a test or a Strands tool
(see tools/__init__.py). They know nothing about the traveler: the agent decides what to
search for from the traveler's message and preferences, then calls these.

Both services are shared public infrastructure. Nominatim allows one request per second and
requires an identifying User-Agent, so calls are spaced out and results are cached in memory.
"""

from __future__ import annotations

import math
import re
import threading
import time
from typing import Literal
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Tried in order, so a busy or unreachable server falls through to the next.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
USER_AGENT = "RoamTravelPlanner/0.1 (HackMidwest 2026 student project; github.com/kayden-gurung/HackMidwest2026)"

GEOCODE_TIMEOUT_S = 8.0
# Kept short so a slow or overloaded Overpass server fails fast instead of stalling the chat.
SEARCH_TIMEOUT_S = 10.0
NOMINATIM_MIN_INTERVAL_S = 1.1
MAX_RADIUS_M = 20_000
MAX_LIMIT = 25
# Candidates fetched before ranking; fewer means smaller, faster Overpass responses.
OVERPASS_FETCH = 80

# Matches the Budget sections in the frontend. Flights are not a place search.
PlaceCategory = Literal["Food", "Stays", "Activities"]

# OpenStreetMap tag filters for each category: (tag key, regex over its values, or None for any value).
CATEGORY_FILTERS: dict[str, list[tuple[str, str | None]]] = {
    "Food": [("amenity", "restaurant|cafe|bar|pub|fast_food|ice_cream|biergarten|food_court|marketplace")],
    "Stays": [("tourism", "hotel|guest_house|hostel|motel|apartment|chalet|camp_site")],
    "Activities": [
        ("tourism", "attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium"),
        ("historic", None),
        ("natural", "beach"),
        ("leisure", "park|nature_reserve|garden|beach_resort|water_park"),
    ],
}


class PlacesUnavailable(Exception):
    """The map data service could not be reached or answered with an error. Safe to show to the user."""


class GeoPoint(BaseModel):
    name: str
    lat: float
    lng: float
    # The matching OpenStreetMap record, when Nominatim names one.
    source_url: str | None = None
    # What Nominatim matched: "city", "town", "suburb"... for areas, or "attraction", "aerodrome"... for places.
    kind: str | None = None


class Place(BaseModel):
    """One real place. Field names match the activity fields the itinerary panel reads."""

    name: str
    category: PlaceCategory
    # What OpenStreetMap calls it, e.g. "restaurant", "guest_house", "museum".
    kind: str
    lat: float
    lng: float
    address: str | None = None
    website_url: str | None = None
    cuisine: str | None = None
    opening_hours: str | None = None
    phone: str | None = None
    # Straight-line distance from the searched location.
    distance_m: int
    # Where this record came from, so the UI can show a source link.
    source_urls: list[str]


_client: httpx.Client | None = None
_geocode_cache: dict[str, GeoPoint | None] = {}
_search_cache: dict[tuple, list[Place]] = {}
_nominatim_lock = threading.Lock()
_last_nominatim_call = 0.0


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(headers={"User-Agent": USER_AGENT, "Accept-Language": "en"}, follow_redirects=True)
    return _client


def geocode(place: str) -> GeoPoint | None:
    """Coordinates for a place name, or None when nothing matches."""
    global _last_nominatim_call
    query = " ".join(place.split())
    if not query:
        return None
    key = query.lower()
    if key in _geocode_cache:
        return _geocode_cache[key]

    with _nominatim_lock:
        wait = NOMINATIM_MIN_INTERVAL_S - (time.monotonic() - _last_nominatim_call)
        if wait > 0:
            time.sleep(wait)
        try:
            response = _http().get(NOMINATIM_URL, params={"q": query, "format": "jsonv2", "limit": 1}, timeout=GEOCODE_TIMEOUT_S)
            response.raise_for_status()
            results = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise PlacesUnavailable("The location lookup service is not responding. Try again in a moment.") from error
        finally:
            _last_nominatim_call = time.monotonic()

    point = None
    if isinstance(results, list) and results:
        top = results[0]
        try:
            osm = (top.get("osm_type"), top.get("osm_id"))
            point = GeoPoint(
                name=top.get("display_name") or query,
                lat=float(top["lat"]),
                lng=float(top["lon"]),
                source_url=f"https://www.openstreetmap.org/{osm[0]}/{osm[1]}" if osm[0] in ("node", "way", "relation") and osm[1] else None,
                kind=top.get("addresstype") or top.get("type"),
            )
        except (KeyError, TypeError, ValueError):
            point = None
    _geocode_cache[key] = point
    return point


def _keyword_regex(keyword: str | None) -> str | None:
    """A safe case-insensitive pattern for Overpass. Anything but letters, digits and spaces becomes a wildcard."""
    if not keyword:
        return None
    cleaned = re.sub(r"[^\w\s]|_", ".", " ".join(keyword.split()), flags=re.UNICODE)
    return cleaned[:60] or None


def _overpass_query(category: str, lat: float, lng: float, radius_m: int, keyword: str | None, fetch: int) -> str:
    around = f"(around:{radius_m},{lat:.6f},{lng:.6f})"
    pattern = _keyword_regex(keyword)
    # With a keyword, match it against the name or the cuisine tag.
    extra_filters = [f'["name"~"{pattern}",i]', f'["name"]["cuisine"~"{pattern}",i]'] if pattern else ['["name"]']
    statements = []
    for key, values in CATEGORY_FILTERS[category]:
        tag_filter = f'["{key}"~"^({values})$"]' if values else f'["{key}"]'
        statements += [f"nwr{tag_filter}{extra}{around};" for extra in extra_filters]
    return f"[out:json][timeout:9];({''.join(statements)});out tags center {fetch};"


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    earth_radius_m = 6_371_000
    d_lat, d_lng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return round(2 * earth_radius_m * math.asin(math.sqrt(a)))


def _web_url(value: str | None) -> str | None:
    """OpenStreetMap websites are typed in by volunteers: accept only http(s), adding the scheme when it is missing."""
    if not value:
        return None
    url = value.split(";")[0].strip()
    if not url or any(character.isspace() for character in url):
        return None
    if "://" not in url:
        # "javascript:..." or "mailto:..." have a scheme but are not web pages. "example.com:8080" is fine.
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:(?!\d)", url):
            return None
        url = f"https://{url}"
    if not url.lower().startswith(("https://", "http://")):
        return None
    host = urlsplit(url).hostname or ""
    return url if "." in host else None


def _address(tags: dict) -> str | None:
    street = " ".join(part for part in (tags.get("addr:street"), tags.get("addr:housenumber")) if part)
    parts = [street, tags.get("addr:postcode"), tags.get("addr:city")]
    return ", ".join(part for part in parts if part) or None


def _to_place(element: dict, category: str, origin: GeoPoint) -> Place | None:
    tags = element.get("tags") or {}
    position = element if "lat" in element else element.get("center") or {}
    name = tags.get("name:en") or tags.get("name")
    try:
        lat, lng = float(position["lat"]), float(position["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if not name:
        return None
    kind = next((tags[key] for key, _ in CATEGORY_FILTERS[category] if key in tags), "place")
    return Place(
        name=name,
        category=category,  # type: ignore[arg-type]
        kind=kind if kind != "yes" else "historic site",
        lat=lat,
        lng=lng,
        address=_address(tags),
        website_url=_web_url(tags.get("website") or tags.get("contact:website")),
        cuisine=tags.get("cuisine", "").replace(";", ", ").replace("_", " ") or None,
        opening_hours=tags.get("opening_hours"),
        phone=tags.get("phone") or tags.get("contact:phone"),
        distance_m=_distance_m(origin.lat, origin.lng, lat, lng),
        source_urls=[f"https://www.openstreetmap.org/{element.get('type', 'node')}/{element.get('id')}"],
    )


def _notability(element: dict) -> int:
    """OpenStreetMap has no ratings. Well-documented places are a rough stand-in for well-known ones."""
    tags = element.get("tags") or {}
    return (
        3 * ("wikidata" in tags or "wikipedia" in tags)
        + 2 * bool(_web_url(tags.get("website") or tags.get("contact:website")))
        + ("opening_hours" in tags)
        + ("phone" in tags or "contact:phone" in tags)
    )


def search_places(
    near: str,
    category: PlaceCategory,
    keyword: str | None = None,
    radius_m: int = 3000,
    limit: int = 8,
) -> list[Place]:
    """Named places of one category around a location, best-documented and nearest first.

    Returns an empty list when the location is unknown or nothing matches.
    Raises PlacesUnavailable when the map services cannot be reached.
    """
    if category not in CATEGORY_FILTERS:
        raise ValueError(f"category must be one of {', '.join(CATEGORY_FILTERS)}")
    radius_m = max(100, min(int(radius_m), MAX_RADIUS_M))
    limit = max(1, min(int(limit), MAX_LIMIT))
    keyword = " ".join(keyword.split()) if keyword else None

    cache_key = (" ".join(near.split()).lower(), category, (keyword or "").lower(), radius_m, limit)
    if cache_key in _search_cache:
        return _search_cache[cache_key]

    origin = geocode(near)
    if origin is None:
        return []

    # Ask for far more than needed: Overpass returns matches in no useful order, so the ranking
    # below needs a wide pool to pick the well-documented, nearby ones from.
    query = _overpass_query(category, origin.lat, origin.lng, radius_m, keyword, fetch=OVERPASS_FETCH)
    elements = None
    for url in OVERPASS_URLS:
        try:
            response = _http().post(url, data={"data": query}, timeout=SEARCH_TIMEOUT_S)
            response.raise_for_status()
            elements = response.json().get("elements", [])
            break
        except (httpx.HTTPError, ValueError, AttributeError):
            continue
    if elements is None:
        raise PlacesUnavailable("The place search service is not responding. Try again in a moment.")

    ranked: list[tuple[int, Place]] = []
    seen: set[tuple[str, int]] = set()
    for element in elements:
        place = _to_place(element, category, origin)
        # The same place is often mapped twice (a building and a point inside it).
        duplicate_key = (place.name.lower(), place.distance_m // 50) if place else None
        if place is None or duplicate_key in seen:
            continue
        seen.add(duplicate_key)
        ranked.append((_notability(element), place))
    ranked.sort(key=lambda pair: (-pair[0], pair[1].distance_m))

    places = [place for _, place in ranked[:limit]]
    _search_cache[cache_key] = places
    return places


def clear_caches() -> None:
    _geocode_cache.clear()
    _search_cache.clear()
