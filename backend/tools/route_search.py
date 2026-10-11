"""Searching along a road route: small towns, history and lesser-known stops between two places.

Plain functions (no AI), used two ways:
- trip_planner.py builds the first plan with them, so the first run is fast.
- The chat agent can call them when the traveler asks for a change (wired into Strands separately):
    route_options       "take a different road"
    towns_along_route   "a different town on the way", "somewhere more historic"
    find_attractions    "something else to do in <town>"
    find_restaurants    "somewhere else to eat in <town>"

Everything returned comes from OpenStreetMap (Overpass, Nominatim) or OSRM, with a source link.
Nothing here writes descriptions or opinions: `reason` only states what the map data says.
"""

from __future__ import annotations

import logging
import math
import re
import time

import httpx
from pydantic import BaseModel

from tools import places
from tools.driving import OSRM_URL, ROUTE_TIMEOUT_S, METERS_PER_MILE, _osrm_routes, estimate_drive, route_path

log = logging.getLogger("roam.route_search")

OSRM_TABLE_URL = OSRM_URL.replace("/route/", "/table/")

# The interest chips on the Trip setup screen (frontend/src/roadtrip/components/TripSetup.tsx), and the
# OpenStreetMap tags that count as each: (tag key, regex over its values, or None for any value).
INTEREST_TAGS: dict[str, list[tuple[str, str | None]]] = {
    "History": [
        ("historic", "monument|fort|castle|ruins|archaeological_site|battlefield|building|manor|mine|ship|locomotive"
                     "|aircraft|railway_car|district|city_gate|church|tomb|wreck|farm|heritage|house|mill"),
        ("tourism", "museum"),
    ],
    "Architecture": [
        ("heritage", None),
        ("historic", "building|church|manor|castle|city_gate|district|house|mill"),
        ("amenity", "courthouse"),
    ],
    "Nature": [
        ("leisure", "nature_reserve"),
        ("natural", "peak|waterfall|cave_entrance|spring|hot_spring|cliff|arch|beach|rock"),
        ("tourism", "viewpoint"),
    ],
    "Local food": [
        ("amenity", "restaurant|cafe|ice_cream|marketplace"),
        ("craft", "brewery|winery|distillery"),
    ],
    "Quirky stops": [
        ("tourism", "attraction|artwork"),
    ],
    # Shapes which towns are picked (smaller ones score higher), not which places.
    "Small towns": [],
}
DEFAULT_INTERESTS = ["History", "Nature", "Quirky stops"]

# The search: a few small Nominatim searches along the route ("museums", "attractions"... inside a
# box around each stretch of road). Nominatim answers each in about a second, where one big Overpass
# search often timed out on the busy public servers. Its usage policy allows one request a second,
# so the number of searches is capped.
# Places within this distance of the road count...
TOWN_CORRIDOR_M = 10_000
# Towns this close to the start or the end are part of those cities, not stops on the way.
ENDPOINT_GAP_M = 30_000
# The route line is thinned to one point every this many metres for distance checks.
PATH_STEP_M = 2_000
# At most this many searches per route (each about a second), and at most 3 kinds of place.
MAX_SEARCHES = 9
MAX_PHRASES = 3
MIN_STRETCHES = 3
# Results per search: Nominatim returns the most notable first.
SEARCH_LIMIT = 40
# The Nominatim search words for each interest chip, most useful first.
INTEREST_PHRASES: dict[str, list[str]] = {
    "History": ["museums", "monuments"],
    "Small towns": ["attractions", "museums"],
    "Nature": ["viewpoints", "parks"],
    "Architecture": ["monuments", "castles"],
    "Quirky stops": ["attractions"],
    "Local food": [],  # meals are chosen per day, not as stops
}
# Candidates whose detour is measured (one OSRM table request). The public demo server allows 100 points.
MAX_DETOUR_CHECKS = 25
# How far either side of a stop the detour is measured from, along the route.
DETOUR_WINDOW_M = 15_000
# Used only when the routing service cannot measure a detour; such stops are flagged detour_estimated.
FALLBACK_ROAD_FACTOR = 1.3
FALLBACK_SPEED_MPH = 45

# Rough time to spend at each kind of stop, for planning. Shown as an estimate, never as a fact.
VISIT_MINUTES = {
    "museum": 60, "fort": 45, "castle": 45, "battlefield": 45, "archaeological_site": 40, "ruins": 30,
    "district": 45, "nature_reserve": 45, "waterfall": 30, "peak": 30, "cave_entrance": 45, "hot_spring": 60,
    "viewpoint": 15, "artwork": 10, "attraction": 30, "restaurant": 50, "cafe": 30, "ice_cream": 20,
    "brewery": 45, "winery": 45, "distillery": 45, "marketplace": 40, "town": 45,
}
DEFAULT_VISIT_MINUTES = 30
FOOD_TAGS = ("amenity", "restaurant|cafe|ice_cream|marketplace")


class RouteOption(BaseModel):
    index: int
    miles: int
    hours: float
    # A town near the middle of the route, to tell the options apart ("via Wichita").
    via: str | None = None


class RouteStop(BaseModel):
    """One possible stop on the way, in the shape the Drive screen's stop cards use."""

    id: str
    # What to show: the place, e.g. "Fort Hays State Historic Site".
    name: str
    # The town it is in, when it is in one.
    town: str | None = None
    # The interests it matched, e.g. ["History", "Small towns"].
    interests: list[str]
    # "History · Small towns", for the card's subtitle.
    category: str
    # What OpenStreetMap calls it, e.g. "historic fort", "museum".
    kind: str
    # Only what the map data says, e.g. "Historic fort in Hays, Kansas. Nearby: 2 museums."
    reason: str
    lat: float
    lng: float
    address: str | None = None
    website_url: str | None = None
    source_urls: list[str]
    # How far along the route it is, from the start.
    miles_from_start: int
    # Extra driving to visit it and get back on the route, and the fuel for that.
    detour_minutes: int
    detour_miles: float
    gas_cost_usd: float
    # True when the routing service could not measure the detour and it was estimated from distance.
    detour_estimated: bool = False
    visit_minutes: int
    # A village or small town, or a place with no Wikipedia/Wikidata entry: likely off the usual lists.
    less_explored: bool
    score: float


# ---------------------------------------------------------------------------------------------
# Geometry


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return places._distance_m(lat1, lng1, lat2, lng2)


def _simplify(coordinates: list, step_m: float = PATH_STEP_M) -> list[tuple[float, float]]:
    """GeoJSON [lng, lat] points thinned to about one every `step_m`, as (lat, lng). Keeps both ends."""
    points = [(float(lat), float(lng)) for lng, lat in coordinates]
    kept = [points[0]]
    for point in points[1:-1]:
        if _distance_m(*kept[-1], *point) >= step_m:
            kept.append(point)
    kept.append(points[-1])
    return kept


def _cumulative(points: list[tuple[float, float]]) -> list[float]:
    steps = [0.0]
    for a, b in zip(points, points[1:]):
        steps.append(steps[-1] + _distance_m(*a, *b))
    return steps


def _index_at(cumulative: list[float], target_m: float) -> int:
    return next((i for i, travelled in enumerate(cumulative) if travelled >= target_m), len(cumulative) - 1)


class _RouteIndex:
    """Distance from any point to the route line, and how far along the route that point is.

    Flat-earth metres around the route's middle latitude (accurate to a few percent for distances
    of a few kilometres), with the line's segments in a grid so each lookup checks only nearby ones.
    """

    CELL_M = 20_000

    def __init__(self, points: list[tuple[float, float]], cumulative: list[float], reach_m: float):
        self.points, self.cumulative = points, cumulative
        lat0 = sum(lat for lat, _ in points) / len(points)
        self.kx, self.ky = 111_320 * math.cos(math.radians(lat0)), 110_574
        self.xy = [(lng * self.kx, lat * self.ky) for lat, lng in points]
        self.grid: dict[tuple[int, int], list[int]] = {}
        for i, ((x1, y1), (x2, y2)) in enumerate(zip(self.xy, self.xy[1:])):
            for cx in range(int((min(x1, x2) - reach_m) // self.CELL_M), int((max(x1, x2) + reach_m) // self.CELL_M) + 1):
                for cy in range(int((min(y1, y2) - reach_m) // self.CELL_M), int((max(y1, y2) + reach_m) // self.CELL_M) + 1):
                    self.grid.setdefault((cx, cy), []).append(i)

    def locate(self, lat: float, lng: float) -> tuple[float, float] | None:
        """(distance to the route, metres along the route of the nearest point), or None when far from it."""
        x, y = lng * self.kx, lat * self.ky
        best = None
        for i in self.grid.get((int(x // self.CELL_M), int(y // self.CELL_M)), ()):
            (x1, y1), (x2, y2) = self.xy[i], self.xy[i + 1]
            dx, dy = x2 - x1, y2 - y1
            length2 = dx * dx + dy * dy
            t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length2))
            distance = math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
            if best is None or distance < best[0]:
                best = (distance, self.cumulative[i] + t * (self.cumulative[i + 1] - self.cumulative[i]))
        return best


def _stretches(points: list[tuple[float, float]], cumulative: list[float], count: int) -> list[str]:
    """Nominatim viewboxes ("west,north,east,south") covering the route in `count` stretches, each widened by TOWN_CORRIDOR_M."""
    boxes = []
    for k in range(count):
        first = _index_at(cumulative, cumulative[-1] * k / count)
        last = _index_at(cumulative, cumulative[-1] * (k + 1) / count)
        lats = [lat for lat, _ in points[first:last + 1]]
        lngs = [lng for _, lng in points[first:last + 1]]
        pad_lat = TOWN_CORRIDOR_M / 111_320
        pad_lng = TOWN_CORRIDOR_M / (111_320 * max(math.cos(math.radians(sum(lats) / len(lats))), 0.01))
        boxes.append(f"{min(lngs) - pad_lng:.4f},{max(lats) + pad_lat:.4f},{max(lngs) + pad_lng:.4f},{min(lats) - pad_lat:.4f}")
    return boxes


def search_phrases(interests: list[str]) -> list[str]:
    """Up to MAX_PHRASES search words for the interests: each interest's first word, then their second words."""
    lists = [INTEREST_PHRASES.get(i, []) for i in interests] or [[]]
    phrases: list[str] = []
    for depth in range(2):
        for words in lists:
            if depth < len(words) and words[depth] not in phrases:
                phrases.append(words[depth])
    return (phrases or ["attractions", "museums"])[:MAX_PHRASES]


def _element(result: dict) -> dict | None:
    """A Nominatim result as a map element, with the town it is in (from its address)."""
    element = places._nominatim_element(result)
    if element is None:
        return None
    address = result.get("address") or {}
    for kind in ("village", "hamlet", "town", "city"):
        if address.get(kind):
            element["town"] = (str(address[kind]), kind)
            break
    return element


def _position(element: dict) -> tuple[float, float] | None:
    spot = element if "lat" in element else element.get("center") or {}
    try:
        return float(spot["lat"]), float(spot["lon"])
    except (KeyError, TypeError, ValueError):
        return None


def _matches(tags: dict, key: str, values: str | None) -> bool:
    return key in tags and (values is None or bool(re.fullmatch(values, str(tags[key]))))


def matched_interests(tags: dict, interests: list[str]) -> list[str]:
    """The traveler's interests this OpenStreetMap record counts for."""
    found = []
    for interest in interests:
        if interest == "Local food" and "brand" in tags:
            continue
        if any(_matches(tags, key, values) for key, values in INTEREST_TAGS.get(interest, [])):
            found.append(interest)
    return found


def is_food(tags: dict) -> bool:
    return _matches(tags, *FOOD_TAGS) and "brand" not in tags


def kind_label(tags: dict) -> str:
    """A plain label from the record's main tag, e.g. "historic fort", "museum", "brewery"."""
    for key in ("tourism", "historic", "natural", "leisure", "amenity", "craft"):
        value = tags.get(key)
        if value:
            label = "historic site" if value == "yes" else value.replace("_", " ")
            return f"historic {label}" if key == "historic" and value != "yes" else label
    return "heritage site" if "heritage" in tags else "place"


def notability(tags: dict) -> float:
    """OpenStreetMap has no ratings. Well-documented places are a rough stand-in for notable ones."""
    return (
        1
        + 2 * ("wikidata" in tags or "wikipedia" in tags)
        + bool(places._web_url(tags.get("website") or tags.get("contact:website")))
        + 0.5 * ("heritage" in tags)
        + 0.5 * ("opening_hours" in tags)
    )


def _documented(tags: dict) -> bool:
    return any(key in tags for key in ("wikidata", "wikipedia", "heritage", "website", "contact:website"))


def _population(tags: dict) -> int | None:
    try:
        return int(str(tags.get("population", "")).replace(",", "").split(".")[0])
    except ValueError:
        return None


def _is_small(tags: dict) -> bool:
    population = _population(tags)
    return tags.get("place") == "village" or (population is not None and population < 10_000)


def source_url(element: dict) -> str:
    return f"https://www.openstreetmap.org/{element.get('type', 'node')}/{element.get('id')}"


def _name(tags: dict) -> str | None:
    return tags.get("name:en") or tags.get("name")


def _visit_minutes(tags: dict) -> int:
    for key in ("tourism", "historic", "natural", "leisure", "amenity", "craft"):
        if tags.get(key) in VISIT_MINUTES:
            return VISIT_MINUTES[tags[key]]
    return DEFAULT_VISIT_MINUTES


def _counts_phrase(kinds: list[str]) -> str:
    counts: dict[str, int] = {}
    for kind in kinds:
        counts[kind] = counts.get(kind, 0) + 1
    parts = [f"{n} {kind}{'s' if n > 1 and not kind.endswith('s') else ''}" for kind, n in sorted(counts.items(), key=lambda kv: -kv[1])[:3]]
    return ", ".join(parts)


# ---------------------------------------------------------------------------------------------
# What the route passes


class RoutePlaces:
    """Everything the searches found near the route, already measured against it."""

    def __init__(self, places_found: list[tuple[dict, float]]):
        # (element, metres along the route). Each element may carry "town": (name, "village"|"town"|...).
        self.places = places_found


def search_route(coordinates: list, interests: list[str] | None = None) -> RoutePlaces:
    """Notable places along a route (GeoJSON [lng, lat] points) for these interests.

    Raises PlacesUnavailable only when every search failed.
    """
    interests = [i for i in (interests or []) if i in INTEREST_TAGS] or DEFAULT_INTERESTS
    points = _simplify(coordinates)
    cumulative = _cumulative(points)
    start, end = points[0], points[-1]
    phrases = search_phrases(interests)
    stretches = _stretches(points, cumulative, max(MIN_STRETCHES, MAX_SEARCHES // len(phrases)))

    started = time.monotonic()
    found: dict[tuple, dict] = {}
    failures = 0
    for box in stretches:
        for phrase in phrases:
            try:
                results = places.nominatim_request(places.NOMINATIM_URL, {
                    "q": phrase, "format": "jsonv2", "limit": SEARCH_LIMIT, "extratags": 1, "addressdetails": 1,
                    "viewbox": box, "bounded": 1})
            except (httpx.HTTPError, ValueError) as error:
                failures += 1
                log.warning("route search: %r failed: %s", phrase, places._why(error))
                continue
            for result in results if isinstance(results, list) else []:
                element = _element(result)
                if element is not None:
                    found[(element["type"], element["id"])] = element
    searches = len(stretches) * len(phrases)
    if failures == searches:
        raise places.PlacesUnavailable("The place search service is not responding. Try again in a moment.")
    log.info("route search: %d places from %d searches (%s) along %d km in %.1f s%s", len(found), searches,
             ", ".join(phrases), round(cumulative[-1] / 1000), time.monotonic() - started,
             f", {failures} failed" if failures else "")

    index = _RouteIndex(points, cumulative, TOWN_CORRIDOR_M)
    kept = []
    for element in found.values():
        spot = _position(element)
        if spot is None or not _name(element.get("tags") or {}):
            continue
        if _distance_m(*spot, *start) <= ENDPOINT_GAP_M or _distance_m(*spot, *end) <= ENDPOINT_GAP_M:
            continue
        located = index.locate(*spot)
        if located is not None and located[0] <= TOWN_CORRIDOR_M:
            kept.append((element, located[1]))
    return RoutePlaces(kept)


class _Candidate:
    def __init__(self, stop: RouteStop, along_m: float):
        self.stop = stop
        self.along_m = along_m


def _is_excluded(element: dict, excluded: set[str]) -> bool:
    name = (_name(element.get("tags") or {}) or "").lower()
    return bool(excluded) and (name in excluded or source_url(element).lower() in excluded)


def _candidates(found: RoutePlaces, interests: list[str], to_miles: float, exclude: list[str] | None) -> list[_Candidate]:
    """Possible stops: each town led by its best matching place, plus well-documented places outside towns."""
    excluded = {" ".join(x.split()).lower() for x in exclude or [] if x}
    small_wanted = "Small towns" in interests
    by_town: dict[str, list[tuple[dict, float]]] = {}
    town_kind: dict[str, str] = {}
    alone: list[tuple[dict, float]] = []
    for element, along in found.places:
        tags = element.get("tags") or {}
        if not matched_interests(tags, interests) or _is_excluded(element, excluded):
            continue
        town = element.get("town")
        if town and town[0].lower() not in excluded:
            by_town.setdefault(town[0], []).append((element, along))
            town_kind[town[0]] = town[1]
        elif not town and _documented(tags):
            # Outside towns, only places with a Wikipedia/Wikidata entry, a website or heritage status.
            alone.append((element, along))

    candidates: list[_Candidate] = []

    def make(poi: dict, town_name: str | None, small: bool, along: float, score: float, others: list[dict]) -> None:
        tags = poi.get("tags") or {}
        lat, lng = _position(poi)  # type: ignore[misc]
        matched = matched_interests(tags, interests)
        if town_name and small_wanted and small:
            matched.append("Small towns")
        kind = kind_label(tags)
        nearby = _counts_phrase([kind_label(o.get("tags") or {}) for o in others])
        where = f" in {town_name}" if town_name else ""
        candidates.append(_Candidate(RouteStop(
            id=f"{poi.get('type', 'node')}-{poi.get('id')}",
            name=_name(tags) or "Unnamed place",
            town=town_name,
            interests=list(dict.fromkeys(matched)),
            category=" · ".join(dict.fromkeys(matched)) or kind.capitalize(),
            kind=kind,
            reason=f"{kind[:1].upper()}{kind[1:]}{where}." + (f" Also nearby: {nearby}." if nearby else ""),
            lat=lat, lng=lng,
            address=places._address(tags),
            website_url=places._web_url(tags.get("website") or tags.get("contact:website")),
            source_urls=[source_url(poi)],
            miles_from_start=round(along * to_miles),
            detour_minutes=0, detour_miles=0.0, gas_cost_usd=0.0,
            visit_minutes=_visit_minutes(tags),
            less_explored=small if town_name else "wikipedia" not in tags,
            score=round(score, 2),
        ), along))

    for town_name, members in by_town.items():
        members.sort(key=lambda pa: -notability(pa[0].get("tags") or {}))
        small = town_kind[town_name] in ("village", "hamlet", "town")
        score = sum(notability(p.get("tags") or {}) for p, _ in members[:5]) + (3 if small_wanted and small else 0)
        lead, lead_along = members[0]
        make(lead, town_name, small, lead_along, score, [p for p, _ in members[1:]])
    for poi, along in alone:
        make(poi, None, False, along, notability(poi.get("tags") or {}) + 1, [])
    return candidates


def _spread(candidates: list[_Candidate], total_miles: float, limit: int, buckets: int = 10) -> list[_Candidate]:
    """The best candidates, but no more than a few from any one stretch of the route."""
    per_bucket = max(1, math.ceil(limit / buckets) + 1)
    counts: dict[int, int] = {}
    chosen = []
    for candidate in sorted(candidates, key=lambda c: -c.stop.score):
        bucket = min(buckets - 1, int(candidate.stop.miles_from_start / max(total_miles, 1) * buckets))
        if counts.get(bucket, 0) < per_bucket:
            counts[bucket] = counts.get(bucket, 0) + 1
            chosen.append(candidate)
        if len(chosen) >= limit:
            break
    return chosen


def _measure_detours(candidates: list[_Candidate], points: list[tuple[float, float]], cumulative: list[float],
                     mpg: float, gas_price: float) -> None:
    """Extra driving for each stop: route point before -> stop -> route point after, minus staying on the route.

    One OSRM table request for all of them. If it fails, detours are estimated from distance and flagged.
    """
    if not candidates:
        return
    befores = [points[_index_at(cumulative, max(0.0, c.along_m - DETOUR_WINDOW_M))] for c in candidates]
    afters = [points[_index_at(cumulative, min(cumulative[-1], c.along_m + DETOUR_WINDOW_M))] for c in candidates]
    stops = [(c.stop.lat, c.stop.lng) for c in candidates]
    n = len(candidates)
    url = f"{OSRM_TABLE_URL}/" + ";".join(f"{lng:.5f},{lat:.5f}" for lat, lng in befores + stops + afters)
    params = {
        "sources": ";".join(str(i) for i in range(2 * n)),
        "destinations": ";".join(str(i) for i in range(n, 3 * n)),
        "annotations": "duration,distance",
    }
    durations = distances = None
    try:
        response = places._http().get(url, params=params, timeout=ROUTE_TIMEOUT_S)
        body = response.json()
        if response.status_code < 400 and body.get("code") == "Ok":
            durations, distances = body.get("durations"), body.get("distances")
    except (httpx.HTTPError, ValueError, AttributeError):
        pass

    index = _RouteIndex(points, cumulative, TOWN_CORRIDOR_M * 2)
    for k, c in enumerate(candidates):
        # Rows: befores (0..n-1) then stops (n..2n-1). Columns: stops (0..n-1) then afters (n..2n-1).
        try:
            seconds = durations[k][k] + durations[n + k][n + k] - durations[k][n + k]  # type: ignore[index]
            meters = distances[k][k] + distances[n + k][n + k] - distances[k][n + k]  # type: ignore[index]
            estimated = False
        except (TypeError, IndexError, KeyError):
            located = index.locate(c.stop.lat, c.stop.lng)
            off_route = located[0] if located else TOWN_CORRIDOR_M
            meters = 2 * off_route * FALLBACK_ROAD_FACTOR
            seconds = meters / METERS_PER_MILE / FALLBACK_SPEED_MPH * 3600
            estimated = True
        miles = max(0.0, meters / METERS_PER_MILE)
        c.stop.detour_minutes = max(0, round(seconds / 60))
        c.stop.detour_miles = round(miles, 1)
        c.stop.gas_cost_usd = round(miles / mpg * gas_price, 2)
        c.stop.detour_estimated = estimated


def rank_stops(coordinates: list, found: RoutePlaces, interests: list[str] | None = None, exclude: list[str] | None = None,
               max_detour_minutes: int = 30, limit: int = MAX_DETOUR_CHECKS, mpg: float = 27, gas_price: float = 3.40,
               route_miles: float | None = None) -> list[RouteStop]:
    """The best stops from a route search for these interests, best first, each with its measured detour.

    `route_miles` is the route's road distance from OSRM; miles_from_start is scaled to it, so stop
    mileages agree with the trip's total (the thinned line is a little shorter than the road).
    """
    interests = [i for i in (interests or []) if i in INTEREST_TAGS] or DEFAULT_INTERESTS
    if not any(INTEREST_TAGS[i] for i in interests):
        interests = [*interests, *DEFAULT_INTERESTS]  # "Small towns" alone still needs something to look for
    points = _simplify(coordinates)
    cumulative = _cumulative(points)
    to_miles = (route_miles / cumulative[-1]) if route_miles and cumulative[-1] > 0 else 1 / METERS_PER_MILE
    candidates = _spread(_candidates(found, interests, to_miles, exclude), cumulative[-1] * to_miles, min(limit, MAX_DETOUR_CHECKS))
    started = time.monotonic()
    _measure_detours(candidates, points, cumulative, mpg, gas_price)
    log.info("route search: measured %d detours in %.1f s", len(candidates), time.monotonic() - started)
    stops = [c.stop for c in candidates if c.stop.detour_minutes <= max_detour_minutes]
    return sorted(stops, key=lambda s: -s.score)


def corridor_stops(coordinates: list, interests: list[str] | None = None, exclude: list[str] | None = None,
                   max_detour_minutes: int = 30, limit: int = MAX_DETOUR_CHECKS, mpg: float = 27, gas_price: float = 3.40,
                   route_miles: float | None = None) -> list[RouteStop]:
    """Stops along a route (GeoJSON [lng, lat] points), best first: search_route then rank_stops.

    Raises PlacesUnavailable only when no part of the route could be searched.
    """
    return rank_stops(coordinates, search_route(coordinates, interests), interests, exclude, max_detour_minutes, limit, mpg, gas_price, route_miles)


# ---------------------------------------------------------------------------------------------
# The four searches the chat can use for changes


def route_options(origin: str, destination: str) -> list[RouteOption]:
    """The roads OSRM offers between two places, fastest first. Usually one to three.

    Raises PlacesUnavailable when the map services cannot be reached.
    """
    start, end = places.geocode(origin), places.geocode(destination)
    if start is None or end is None:
        return []
    options = []
    for index, route in enumerate(_osrm_routes(start, end) or []):
        coordinates = (route.get("geometry") or {}).get("coordinates") or []
        via = None
        if len(coordinates) > 2:
            lng, lat = coordinates[len(coordinates) // 2]
            via = places.town_at(lat, lng)
        options.append(RouteOption(index=index, miles=round(float(route["distance"]) / METERS_PER_MILE),
                                   hours=round(float(route["duration"]) / 3600, 1), via=via))
    return options


def towns_along_route(origin: str, destination: str, interests: list[str] | None = None, route_index: int = 0,
                      exclude: list[str] | None = None, max_detour_minutes: int = 30, limit: int = 8) -> list[RouteStop]:
    """Small towns and lesser-known stops on the drive, matching the traveler's interests, in route order.

    `exclude` skips stops and towns already in the plan (names or source links).
    Returns [] when either place is unknown or nothing fits. Raises PlacesUnavailable when the
    map services cannot be reached.
    """
    coordinates = route_path(origin, destination, route_index)
    estimate = estimate_drive(origin, destination, round_trip=False, route_index=route_index)
    if coordinates is None or estimate is None:
        return []
    stops = corridor_stops(coordinates, interests, exclude, max_detour_minutes, route_miles=estimate.distance_miles)[:limit]
    return sorted(stops, key=lambda s: s.miles_from_start)


def find_attractions(near: str, interests: list[str] | None = None, exclude: list[str] | None = None,
                     radius_m: int = 5000, limit: int = 8) -> list[places.Place]:
    """Things to do in a town, the ones matching the traveler's interests first. Skips `exclude`."""
    found = places.search_places(near, "Activities", None, radius_m, places.MAX_LIMIT, exclude)
    wanted = [i for i in (interests or []) if INTEREST_TAGS.get(i)]
    if wanted:
        def fits(place: places.Place) -> bool:
            kind = place.kind.replace(" ", "_")
            return any(values is None or kind in values.split("|") for i in wanted for _, values in INTEREST_TAGS[i])
        found = sorted(found, key=lambda p: not fits(p))  # stable: keeps the notability order within each group
    return found[:limit]


def find_restaurants(near: str, keyword: str | None = None, exclude: list[str] | None = None,
                     radius_m: int = 3000, limit: int = 8) -> list[places.Place]:
    """Places to eat in a town, optionally by cuisine or name ("bbq", "diner"). Skips `exclude`."""
    return places.search_places(near, "Food", keyword, radius_m, limit, exclude)
