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

import math
import re

import httpx
from pydantic import BaseModel

from tools import places
from tools.driving import OSRM_URL, ROUTE_TIMEOUT_S, METERS_PER_MILE, _osrm_routes, estimate_drive, route_path

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

# Search widths. A town 15 km off the highway is usually a 20-25 minute detour there and back.
TOWN_CORRIDOR_M = 15_000
# Stand-alone landmarks (a fort or a waterfall outside any town) must be closer, and well documented.
LANDMARK_CORRIDOR_M = 8_000
# Places within this distance of a town count as being in it.
TOWN_RADIUS_M = 3_000
# Towns this close to the start or the end are part of those cities, not stops on the way.
ENDPOINT_GAP_M = 30_000
# The route line sent to Overpass keeps one point every this many metres...
PATH_STEP_M = 5_000
# ...and is searched in pieces of this many points (about 400 km), so one slow piece does not sink the rest.
CHUNK_POINTS = 80
OVERPASS_TIMEOUT_S = 45.0
MAX_ELEMENTS_PER_CHUNK = 3000
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


def _nearest(points: list[tuple[float, float]], lat: float, lng: float) -> tuple[int, float]:
    """Index of the route point nearest (lat, lng), and the distance to it."""
    best = min(range(len(points)), key=lambda i: _distance_m(lat, lng, *points[i]))
    return best, _distance_m(lat, lng, *points[best])


def _index_at(cumulative: list[float], target_m: float) -> int:
    return next((i for i, travelled in enumerate(cumulative) if travelled >= target_m), len(cumulative) - 1)


# ---------------------------------------------------------------------------------------------
# Map data


def _tag_filter(key: str, values: str | None) -> str:
    return f'["{key}"~"^({values})$"]' if values else f'["{key}"]'


def _interest_filters(interests: list[str]) -> list[str]:
    filters = []
    for interest in interests:
        for key, values in INTEREST_TAGS.get(interest, []):
            # Chains are not "local food": skip anything with a brand.
            filters.append(_tag_filter(key, values) + ('[!"brand"]' if interest == "Local food" else ""))
    return filters


def _corridor_query(points: list[tuple[float, float]], interests: list[str]) -> str:
    line = ",".join(f"{lat:.5f},{lng:.5f}" for lat, lng in points)
    filters = _interest_filters(interests)
    in_towns = "".join(f"nwr{f}[\"name\"](around.towns:{TOWN_RADIUS_M});" for f in filters)
    # Outside towns, only well-documented places: a mapped fort or waterfall, not every roadside plaque.
    landmarks = "".join(f"nwr{f}[\"name\"][\"wikidata\"](around:{LANDMARK_CORRIDOR_M},{line});"
                        for f in filters if "amenity" not in f and "craft" not in f)
    return (
        f"[out:json][timeout:{int(OVERPASS_TIMEOUT_S) - 5}];"
        f'node["place"~"^(town|village)$"]["name"](around:{TOWN_CORRIDOR_M},{line})->.towns;'
        ".towns out body;"
        f"({in_towns}{landmarks})->.pois;"
        # "out center", not "out tags center": tags-only output has no node coordinates.
        f".pois out center {MAX_ELEMENTS_PER_CHUNK};"
    )


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


def kind_label(tags: dict) -> str:
    """A plain label from the record's main tag, e.g. "historic fort", "museum", "brewery"."""
    for key in ("tourism", "historic", "natural", "leisure", "amenity", "craft"):
        value = tags.get(key)
        if value:
            label = "historic site" if value == "yes" else value.replace("_", " ")
            return f"historic {label}" if key == "historic" and value != "yes" else label
    return "heritage site" if "heritage" in tags else "place"


def _notability(tags: dict) -> float:
    """OpenStreetMap has no ratings. Well-documented places are a rough stand-in for notable ones."""
    return (
        1
        + 2 * ("wikidata" in tags or "wikipedia" in tags)
        + bool(places._web_url(tags.get("website") or tags.get("contact:website")))
        + 0.5 * ("heritage" in tags)
        + 0.5 * ("opening_hours" in tags)
    )


def _population(tags: dict) -> int | None:
    try:
        return int(str(tags.get("population", "")).replace(",", "").split(".")[0])
    except ValueError:
        return None


def _is_small(tags: dict) -> bool:
    population = _population(tags)
    return tags.get("place") == "village" or (population is not None and population < 10_000)


def _source(element: dict) -> str:
    return f"https://www.openstreetmap.org/{element.get('type', 'node')}/{element.get('id')}"


def _name(tags: dict) -> str | None:
    return tags.get("name:en") or tags.get("name")


def _visit_minutes(tags: dict) -> int:
    for key in ("tourism", "historic", "natural", "leisure", "amenity", "craft"):
        if tags.get(key) in VISIT_MINUTES:
            return VISIT_MINUTES[tags[key]]
    return DEFAULT_VISIT_MINUTES


# ---------------------------------------------------------------------------------------------
# Candidates


class _Candidate:
    def __init__(self, stop: RouteStop, route_index: int):
        self.stop = stop
        self.route_index = route_index  # nearest point on the simplified route


def _counts_phrase(kinds: list[str]) -> str:
    counts: dict[str, int] = {}
    for kind in kinds:
        counts[kind] = counts.get(kind, 0) + 1
    parts = [f"{n} {kind}{'s' if n > 1 and not kind.endswith('s') else ''}" for kind, n in sorted(counts.items(), key=lambda kv: -kv[1])[:3]]
    return ", ".join(parts)


def _is_excluded_element(element: dict, excluded: set[str]) -> bool:
    name = (_name(element.get("tags") or {}) or "").lower()
    return bool(excluded) and (name in excluded or _source(element).lower() in excluded)


def _candidates(elements: list[dict], interests: list[str], points: list[tuple[float, float]], cumulative: list[float],
                exclude: list[str] | None) -> list[_Candidate]:
    towns = [e for e in elements if e.get("type") == "node" and (e.get("tags") or {}).get("place") in ("town", "village")]
    town_ids = {id(t) for t in towns}
    pois = [e for e in elements if id(e) not in town_ids and _name(e.get("tags") or {}) and _position(e)]
    start, end = points[0], points[-1]
    total = cumulative[-1]

    def near_ends(lat: float, lng: float) -> bool:
        return _distance_m(lat, lng, *start) < ENDPOINT_GAP_M or _distance_m(lat, lng, *end) < ENDPOINT_GAP_M

    # Each place belongs to its nearest town within TOWN_RADIUS_M, or stands alone.
    by_town: dict[int, list[dict]] = {}
    alone: list[dict] = []
    town_positions = [(t, _position(t)) for t in towns if _position(t)]
    # Towns in a grid of about 5 km cells, so each place is only compared with the towns around it.
    grid: dict[tuple[int, int], list] = {}
    for town, (lat, lng) in town_positions:  # type: ignore[misc]
        grid.setdefault((round(lat * 20), round(lng * 20)), []).append((town, (lat, lng)))
    for poi in pois:
        lat, lng = _position(poi)  # type: ignore[misc]
        cell = (round(lat * 20), round(lng * 20))
        around = [tp for dy in (-1, 0, 1) for dx in (-1, 0, 1) for tp in grid.get((cell[0] + dy, cell[1] + dx), [])]
        nearest = min(around, key=lambda tp: _distance_m(lat, lng, *tp[1]), default=None)
        if nearest and _distance_m(lat, lng, *nearest[1]) <= TOWN_RADIUS_M:
            by_town.setdefault(id(nearest[0]), []).append(poi)
        elif "wikidata" in (poi.get("tags") or {}):
            alone.append(poi)

    excluded = {" ".join(x.split()).lower() for x in exclude or [] if x}
    small_wanted = "Small towns" in interests
    found: list[_Candidate] = []

    def make(poi: dict | None, town: dict | None, score: float, others: list[dict]) -> None:
        spot = poi or town
        tags = (spot or {}).get("tags") or {}
        lat, lng = _position(spot)  # type: ignore[arg-type,misc]
        if near_ends(lat, lng):
            return
        town_name = _name(town.get("tags") or {}) if town else None
        name = _name(tags) if poi else f"{town_name} town center"
        source = _source(spot)  # type: ignore[arg-type]
        if name and (name.lower() in excluded or source.lower() in excluded or (town_name or "").lower() in excluded):
            return
        matched = matched_interests(tags, interests) if poi else []
        if town and small_wanted and _is_small(town.get("tags") or {}):
            matched.append("Small towns")
        kind = kind_label(tags) if poi else "town"
        nearby = _counts_phrase([kind_label(o.get("tags") or {}) for o in others])
        where = f" in {town_name}" if town_name else ""
        reason = f"{kind[:1].upper()}{kind[1:]}{where}." + (f" Also nearby: {nearby}." if nearby else "")
        index, _ = _nearest(points, lat, lng)
        town_tags = (town or {}).get("tags") or {}
        less_explored = _is_small(town_tags) if town else not ("wikipedia" in tags)
        found.append(_Candidate(RouteStop(
            id=f"{(spot or {}).get('type', 'node')}-{(spot or {}).get('id')}",
            name=name or "Unnamed place",
            town=town_name,
            interests=list(dict.fromkeys(matched)),
            category=" · ".join(dict.fromkeys(matched)) or kind.capitalize(),
            kind=kind,
            reason=reason,
            lat=lat, lng=lng,
            address=places._address(tags),
            website_url=places._web_url(tags.get("website") or tags.get("contact:website")),
            source_urls=[source],
            miles_from_start=round(cumulative[index] / METERS_PER_MILE),
            detour_minutes=0, detour_miles=0.0, gas_cost_usd=0.0,
            visit_minutes=_visit_minutes(tags) if poi else VISIT_MINUTES["town"],
            less_explored=less_explored,
            score=round(score, 2),
        ), index))

    for town, _ in town_positions:
        town_tags = town.get("tags") or {}
        town_name = (_name(town_tags) or "").lower()
        if town_name in excluded:
            continue
        # Only places that count for one of the traveler's interests, minus ones already in the plan.
        own = sorted((p for p in by_town.get(id(town), []) if matched_interests(p.get("tags") or {}, interests)
                      and not _is_excluded_element(p, excluded)),
                     key=lambda p: -_notability(p.get("tags") or {}))
        # Restaurants only lead a stop when food is all the traveler asked for.
        leads = [p for p in own if set(matched_interests(p.get("tags") or {}, interests)) - {"Local food"}] or own
        score = sum(_notability(p.get("tags") or {}) for p in own[:5])
        if small_wanted and _is_small(town_tags):
            score += 3
        score += 1 if ("wikipedia" in town_tags or "wikidata" in town_tags) else 0
        if leads:
            make(leads[0], town, score, [p for p in own if p is not leads[0]])
        elif small_wanted and ("wikipedia" in town_tags or "wikidata" in town_tags) and _is_small(town_tags):
            # A documented small town with nothing else mapped: the stop is the town itself.
            make(None, town, score, [])
    for poi in alone:
        if not matched_interests(poi.get("tags") or {}, interests) or _is_excluded_element(poi, excluded):
            continue
        make(poi, None, _notability(poi.get("tags") or {}) + 1, [])
    return found if total > 0 else []


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
    befores, afters = [], []
    for c in candidates:
        here = cumulative[c.route_index]
        befores.append(points[_index_at(cumulative, max(0.0, here - DETOUR_WINDOW_M))])
        afters.append(points[_index_at(cumulative, min(cumulative[-1], here + DETOUR_WINDOW_M))])
    stops = [(c.stop.lat, c.stop.lng) for c in candidates]
    n = len(candidates)
    coords = befores + stops + afters
    url = f"{OSRM_TABLE_URL}/" + ";".join(f"{lng:.5f},{lat:.5f}" for lat, lng in coords)
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

    for k, c in enumerate(candidates):
        # Rows: befores (0..n-1) then stops (n..2n-1). Columns: stops (0..n-1) then afters (n..2n-1).
        try:
            seconds = durations[k][k] + durations[n + k][n + k] - durations[k][n + k]  # type: ignore[index]
            meters = distances[k][k] + distances[n + k][n + k] - distances[k][n + k]  # type: ignore[index]
            estimated = False
        except (TypeError, IndexError, KeyError):
            _, off_route = _nearest(points, c.stop.lat, c.stop.lng)
            meters = 2 * off_route * FALLBACK_ROAD_FACTOR
            seconds = meters / METERS_PER_MILE / FALLBACK_SPEED_MPH * 3600
            estimated = True
        miles = max(0.0, meters / METERS_PER_MILE)
        c.stop.detour_minutes = max(0, round(seconds / 60))
        c.stop.detour_miles = round(miles, 1)
        c.stop.gas_cost_usd = round(miles / mpg * gas_price, 2)
        c.stop.detour_estimated = estimated


def corridor_stops(coordinates: list, interests: list[str] | None = None, exclude: list[str] | None = None,
                   max_detour_minutes: int = 30, limit: int = MAX_DETOUR_CHECKS, mpg: float = 27, gas_price: float = 3.40,
                   route_miles: float | None = None) -> list[RouteStop]:
    """Stops along a route (GeoJSON [lng, lat] points), best first, each with its measured detour.

    `route_miles` is the route's road distance from OSRM; miles_from_start is scaled to it, so stop
    mileages agree with the trip's total (the thinned line is a little shorter than the road).

    Raises PlacesUnavailable only when no part of the route could be searched.
    """
    interests = [i for i in (interests or []) if i in INTEREST_TAGS] or DEFAULT_INTERESTS
    if not any(INTEREST_TAGS[i] for i in interests):
        interests = [*interests, *DEFAULT_INTERESTS]  # "Small towns" alone still needs something to look for
    points = _simplify(coordinates)
    cumulative = _cumulative(points)

    elements: list[dict] = []
    failures = 0
    chunks = [points[i:i + CHUNK_POINTS + 1] for i in range(0, max(1, len(points) - 1), CHUNK_POINTS)]
    for chunk in chunks:
        try:
            elements += places.overpass(_corridor_query(chunk, interests), timeout_s=OVERPASS_TIMEOUT_S)
        except places.PlacesUnavailable:
            failures += 1
    if failures == len(chunks):
        raise places.PlacesUnavailable("The place search service is not responding. Try again in a moment.")
    unique = list({(e.get("type"), e.get("id")): e for e in elements}.values())

    if route_miles and cumulative[-1] > 0:
        scale = route_miles * METERS_PER_MILE / cumulative[-1]
        cumulative_miles = [c * scale for c in cumulative]
    else:
        cumulative_miles = cumulative
    found = _candidates(unique, interests, points, cumulative_miles, exclude)
    candidates = _spread(found, cumulative_miles[-1] / METERS_PER_MILE, min(limit, MAX_DETOUR_CHECKS))
    _measure_detours(candidates, points, cumulative, mpg, gas_price)
    stops = [c.stop for c in candidates if c.stop.detour_minutes <= max_detour_minutes]
    return sorted(stops, key=lambda s: -s.score)


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
