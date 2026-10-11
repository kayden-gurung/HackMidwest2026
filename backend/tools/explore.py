"""Explore themes: real places worth the stop within a few hours' drive of a city.

No AI involved. Each theme is a set of OpenStreetMap searches (Nominatim, inside a box around the
city); results are filtered to real attractions, ranked by how well documented they are, and
measured by road with one OSRM table request.
"""
import math
import re
from typing import Literal

import httpx
from pydantic import BaseModel

from tools import places
from tools.driving import METERS_PER_MILE, OSRM_URL, road_routes

ThemeId = Literal["river-towns", "trailheads", "historic-main-streets"]

# Phrases tested against Nominatim around Kansas City: each finds small-town spots, not just the big city.
THEMES: dict[str, dict] = {
    "river-towns": {
        "title": "River towns",
        "tags": "Small towns · History",
        "phrases": ("riverfront park", "riverfront", "riverwalk", "river landing", "river access"),
    },
    "trailheads": {
        "title": "Quiet trailheads",
        "tags": "Nature · Scenic stops",
        "phrases": ("state park", "trailhead", "conservation area"),
    },
    "historic-main-streets": {
        "title": "Historic main streets",
        "tags": "Architecture · Local food",
        "phrases": ("state historic site", "downtown historic district", "historic district", "historic downtown"),
    },
}

# What counts as a place to stop: (OSM key, values or None for any). Roads, houses, shops and parking don't.
STOP_KINDS: dict[str, set[str] | None] = {
    "leisure": {"park", "nature_reserve", "slipway", "garden", "marina", "common"},
    "boundary": {"protected_area", "national_park"},
    "tourism": {"museum", "attraction", "viewpoint", "picnic_site", "artwork"},
    "historic": None,
    "highway": {"trailhead"},
    "natural": {"beach", "peak", "spring", "cave_entrance"},
    "amenity": {"courthouse"},
}

KIND_LABELS = {
    "nature_reserve": "Nature reserve", "protected_area": "Protected area", "national_park": "National park",
    "slipway": "River access", "trailhead": "Trailhead", "viewpoint": "Viewpoint", "picnic_site": "Picnic site",
    "cave_entrance": "Cave", "district": "Historic district", "courthouse": "Courthouse",
}

# Facilities inside a place (its campground, parking lot) aren't a separate stop.
FACILITY_NAME = re.compile(r"\b(campground|camping|parking|lot|restrooms?|boat ramp)\b", re.IGNORECASE)
# Labels that name no place in particular.
GENERIC_NAMES = {"trailhead", "historic site", "riverfront", "park", "river access", "state park", "conservation area"}

# A quick search box: about 3 hours of driving in any direction from the city.
SEARCH_RADIUS_M = 250_000
# Places this close to the start are part of the city you're leaving, not a stop on the road.
MIN_MILES_FROM_START = 10
MAX_SPOTS = 12
# The longest drive the Explore page offers.
MAX_HOURS = 4
MAX_PER_TOWN = 2

# (theme, origin) -> the start and every measured spot, so changing the time limit needs no new lookups.
_cache: dict[tuple, tuple[places.GeoPoint, list["ExploreSpot"]]] = {}


class ExploreOrigin(BaseModel):
    name: str
    lat: float
    lng: float


class ExploreSpot(BaseModel):
    id: str
    name: str
    # Human label for what it is, e.g. "State park", "Riverfront park", "Historic district".
    kind: str
    # Town and state, e.g. "Boonville, MO". Falls back to the county.
    town: str | None = None
    lat: float
    lng: float
    drive_miles: float
    drive_minutes: float
    website_url: str | None = None
    wikipedia_url: str | None = None
    source_url: str


class ExploreResult(BaseModel):
    theme: ThemeId
    title: str
    tags: str
    origin: ExploreOrigin
    max_hours: float
    spots: list[ExploreSpot]


class ExploreRoute(BaseModel):
    miles: float
    minutes: float
    # [lat, lng] points along the road, start to spot.
    path: list[list[float]]


def _kind_label(key: str, value: str, name: str) -> str:
    lowered = name.lower()
    for phrase, label in (("state historic site", "State historic site"), ("state park", "State park"),
                          ("conservation area", "Conservation area"), ("historic district", "Historic district"),
                          ("riverfront", "Riverfront"), ("trailhead", "Trailhead"), ("river access", "River access")):
        if phrase in lowered:
            return label
    if key == "historic":
        return KIND_LABELS.get(value, "Historic site")
    return KIND_LABELS.get(value, value.replace("_", " ").capitalize())


def _town(address: dict) -> str | None:
    town = address.get("city") or address.get("town") or address.get("village") or address.get("hamlet") or address.get("county")
    state = str(address.get("ISO3166-2-lvl4") or "")
    code = state.split("-")[-1] if state.startswith("US-") else address.get("state")
    return f"{town}, {code}" if town and code else town


def _wikipedia_url(tags: dict) -> str | None:
    value = tags.get("wikipedia")
    if not isinstance(value, str) or ":" not in value:
        return None
    lang, title = value.split(":", 1)
    if not re.fullmatch(r"[a-z-]{2,12}", lang):
        return None
    return f"https://{lang}.wikipedia.org/wiki/{title.strip().replace(' ', '_')}"


def _candidates(theme: str, origin: places.GeoPoint) -> list[tuple[int, dict]]:
    """(notability, spot fields) for every stop-worthy result of the theme's searches."""
    lat_span = SEARCH_RADIUS_M / 111_320
    lng_span = lat_span / max(math.cos(math.radians(origin.lat)), 0.01)
    viewbox = f"{origin.lng - lng_span},{origin.lat + lat_span},{origin.lng + lng_span},{origin.lat - lat_span}"
    found, seen_names = [], set()
    for phrase in THEMES[theme]["phrases"]:
        try:
            results = places.nominatim_request(places.NOMINATIM_URL, {
                "q": phrase, "format": "jsonv2", "limit": 40, "extratags": 1, "addressdetails": 1,
                "viewbox": viewbox, "bounded": 1,
            })
        except (httpx.HTTPError, ValueError):
            continue
        for result in results if isinstance(results, list) else []:
            key, value, name = result.get("category"), result.get("type"), (result.get("name") or "").strip()
            allowed = STOP_KINDS.get(key or "", set())
            if not name or allowed is not None and value not in allowed:
                continue
            # Generic labels ("Trailhead", "Historic Site") don't say where you'd be going.
            if name.lower() in GENERIC_NAMES or FACILITY_NAME.search(name):
                continue
            try:
                lat, lng = float(result["lat"]), float(result["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            if places._distance_m(origin.lat, origin.lng, lat, lng) < MIN_MILES_FROM_START * METERS_PER_MILE:
                continue
            if name.lower() in seen_names:
                continue
            seen_names.add(name.lower())
            tags = {k: v for k, v in (result.get("extratags") or {}).items() if isinstance(v, str)}
            osm_type, osm_id = result.get("osm_type"), result.get("osm_id")
            if osm_type not in ("node", "way", "relation") or not osm_id:
                continue
            notability = places._notability({"tags": tags})
            found.append((notability, {
                "id": f"{osm_type}-{osm_id}",
                "name": name,
                "kind": _kind_label(key, value, name),
                "town": _town(result.get("address") or {}),
                "lat": lat,
                "lng": lng,
                "website_url": places._web_url(tags.get("website") or tags.get("contact:website")),
                "wikipedia_url": _wikipedia_url(tags),
                "source_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
            }))
    return found


def _road_times(origin: places.GeoPoint, spots: list[dict]) -> list[tuple[float, float] | None]:
    """(miles, minutes) by road from the origin to each spot, in one OSRM table request."""
    coordinates = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in [(origin.lat, origin.lng)] + [(s["lat"], s["lng"]) for s in spots])
    try:
        response = places._http().get(f"{OSRM_URL.replace('/route/', '/table/')}/{coordinates}",
                                      params={"sources": "0", "annotations": "duration,distance"}, timeout=15.0)
        response.raise_for_status()
        body = response.json()
        durations, distances = body["durations"][0][1:], body["distances"][0][1:]
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
        raise places.PlacesUnavailable("Driving times are unavailable right now. Try again in a moment.") from error
    return [
        (distance / METERS_PER_MILE, duration / 60) if isinstance(distance, (int, float)) and isinstance(duration, (int, float)) else None
        for distance, duration in zip(distances, durations)
    ]


def explore_theme(theme: str, origin_name: str, max_hours: float = 3.0) -> ExploreResult | None:
    """The theme's best spots within max_hours of driving from the origin, nearest first.

    Returns None when the origin is unknown. Raises PlacesUnavailable when the map services fail.
    """
    if theme not in THEMES:
        raise ValueError(f"theme must be one of {', '.join(THEMES)}")
    key = (theme, " ".join(origin_name.split()).lower())
    if key not in _cache:
        origin = places.geocode(origin_name)
        if origin is None:
            return None
        _cache[key] = (origin, _measured_spots(theme, origin))
    origin, measured = _cache[key]
    spots = [spot for spot in measured if spot.drive_minutes <= max_hours * 60]
    return ExploreResult(
        theme=theme, title=THEMES[theme]["title"], tags=THEMES[theme]["tags"], max_hours=max_hours,
        origin=ExploreOrigin(name=origin_name, lat=origin.lat, lng=origin.lng), spots=spots[:MAX_SPOTS],
    )


def _measured_spots(theme: str, origin: places.GeoPoint) -> list[ExploreSpot]:
    """The theme's best-documented spots within the longest drive the page offers, nearest first."""
    # Best documented first, a couple per town so one city can't fill the list.
    ranked = sorted(_candidates(theme, origin), key=lambda pair: -pair[0])
    picked, per_town = [], {}
    for _, spot in ranked:
        town = spot["town"] or spot["name"]
        if per_town.get(town, 0) >= MAX_PER_TOWN:
            continue
        per_town[town] = per_town.get(town, 0) + 1
        picked.append(spot)
        if len(picked) >= MAX_SPOTS * 2:
            break

    spots = []
    for spot, measured in zip(picked, _road_times(origin, picked) if picked else []):
        if measured is None or measured[1] > MAX_HOURS * 60:
            continue
        spots.append(ExploreSpot(**spot, drive_miles=round(measured[0], 1), drive_minutes=round(measured[1])))
    spots.sort(key=lambda spot: spot.drive_minutes)
    return spots


MAX_ROUTE_POINTS = 400


def route_to(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> ExploreRoute | None:
    """The road from the start to one spot, thinned to at most 400 points for the map."""
    routes = road_routes([(from_lat, from_lng), (to_lat, to_lng)])
    if not routes:
        return None
    path = routes[0]["coordinates"]
    step = max(1, math.ceil(len(path) / MAX_ROUTE_POINTS))
    thinned = path[::step] + ([path[-1]] if (len(path) - 1) % step else [])
    return ExploreRoute(miles=round(routes[0]["miles"], 1), minutes=round(routes[0]["minutes"]),
                        path=[[round(lat, 5), round(lng, 5)] for lng, lat in thinned])


def clear_cache() -> None:
    _cache.clear()
