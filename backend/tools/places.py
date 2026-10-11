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

import hashlib
import itertools
import json
import logging
import math
import os
import re
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextlib import contextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel

log = logging.getLogger("roam.places")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Tried in order, so a busy or unreachable server falls through to the next.
# Each server limits requests per visitor separately, so one that is throttling us (a shared
# venue network often is) does not stop the search: the next is tried with the time that is left.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# Backup for place-name lookups when Nominatim refuses or does not answer: Photon, a separate
# OpenStreetMap geocoder with its own limits (https://photon.komoot.io).
PHOTON_URL = "https://photon.komoot.io/api/"
PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse"
USER_AGENT = "RoamTravelPlanner/0.1 (HackMidwest 2026 student project; github.com/kayden-gurung/HackMidwest2026)"

GEOCODE_TIMEOUT_S = 8.0
# Kept short so a slow or overloaded Overpass server fails fast instead of stalling the chat.
SEARCH_TIMEOUT_S = 10.0
NOMINATIM_MIN_INTERVAL_S = 1.1
MAX_RADIUS_M = 20_000
MAX_LIMIT = 25
# Candidates fetched before ranking; fewer means smaller, faster Overpass responses.
OVERPASS_FETCH = 80

# Matches the Budget sections in the frontend. Driving is not a place search.
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


def overpass_failed(body: str | bytes) -> bool:
    """Overpass answers 200 even when it ran out of time or memory, with a "remark" saying so and the
    elements cut short. Such an answer is incomplete: never trust it, never save it."""
    text = body.decode("utf-8", "replace") if isinstance(body, bytes) else body
    head = text[:300] + text[-600:]  # the remark sits near the start or the end
    return '"remark"' in head and ("runtime error" in head or "timed out" in head or "out of memory" in head)


def _decoded_headers(response: httpx.Response) -> list[tuple[str, str]]:
    """The answer's headers for its already-decompressed body: without Content-Encoding (or the
    compressed length), or httpx would try to decompress it a second time (DecodingError)."""
    return [(k, v) for k, v in response.headers.multi_items() if k.lower() not in ("content-encoding", "content-length", "transfer-encoding")]


class DiskCacheTransport(httpx.BaseTransport):
    """Keeps successful map-service answers on disk, so a route planned once is instant afterwards,
    even after a restart, and works on bad venue wifi. OpenStreetMap data changes slowly; delete
    the folder to refresh it.

    Only 200 answers are kept, keyed by method, URL and body. Set ROAM_HTTP_CACHE_DIR to "" to turn it off.
    """

    def __init__(self, inner: httpx.BaseTransport, directory: Path):
        self.inner = inner
        self.directory = directory

    def _path(self, request: httpx.Request) -> Path:
        key = hashlib.sha256(request.method.encode() + b" " + str(request.url).encode() + b"\n" + request.content).hexdigest()
        return self.directory / key[:2] / f"{key}.json"

    def saved(self, request: httpx.Request) -> object | None:
        """The saved JSON answer for this request, or None."""
        try:
            return json.loads(json.loads(self._path(request).read_text(encoding="utf-8"))["body"])
        except (OSError, ValueError, KeyError):
            return None

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        request.read()
        path = self._path(request)
        try:
            saved = json.loads(path.read_text(encoding="utf-8"))
            if overpass_failed(saved["body"]):
                raise ValueError("saved before this check: an incomplete answer")
            return httpx.Response(saved["status"], headers={"content-type": saved["type"], "x-roam-cache": "hit"},
                                  content=saved["body"].encode("utf-8"), request=request)
        except (OSError, ValueError, KeyError):
            pass
        response = self.inner.handle_request(request)
        if response.status_code != 200:
            return response
        body = response.read()
        if overpass_failed(body):
            return httpx.Response(200, headers=_decoded_headers(response), content=body, request=request)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps({"status": 200, "type": response.headers.get("content-type", "application/json"),
                                             "body": body.decode("utf-8")}), encoding="utf-8")
            temporary.replace(path)  # never leave a half-written file behind
        except (OSError, UnicodeDecodeError):
            pass
        return httpx.Response(200, headers=_decoded_headers(response), content=body, request=request)


# Next to the backend code, which Docker mounts from the host, so it survives rebuilds.
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / ".roam_cache" / "http"

_client: httpx.Client | None = None
_geocode_cache: dict[str, GeoPoint | None] = {}
_search_cache: dict[tuple, list[Place]] = {}
_nominatim_lock = threading.Lock()
_last_nominatim_call = 0.0


def _http() -> httpx.Client:
    global _client
    if _client is None:
        setting = os.getenv("ROAM_HTTP_CACHE_DIR")
        directory = DEFAULT_CACHE_DIR if setting is None else (Path(setting) if setting.strip() else None)
        transport = httpx.HTTPTransport(retries=1)
        _client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            follow_redirects=True,
            transport=DiskCacheTransport(transport, directory) if directory else transport,
        )
    return _client


def geocode(place: str) -> GeoPoint | None:
    """Coordinates for a place name, or None when nothing matches."""
    query = " ".join(place.split())
    if not query:
        return None
    key = query.lower()
    if key in _geocode_cache:
        return _geocode_cache[key]

    try:
        results = nominatim_request(NOMINATIM_URL, {"q": query, "format": "jsonv2", "limit": 1})
    except (httpx.HTTPError, ValueError) as error:
        log.warning("Nominatim lookup of %r failed: %s. Trying Photon.", query, _why(error))
        point = _photon_geocode(query)
        if point is _UNAVAILABLE:
            raise PlacesUnavailable("The location lookup service is not responding. Try again in a moment.") from error
        _geocode_cache[key] = point  # type: ignore[assignment]
        return point  # type: ignore[return-value]

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


NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
_UNAVAILABLE = object()
_PHOTON_OSM_TYPES = {"N": "node", "W": "way", "R": "relation"}


def _why(error: Exception) -> str:
    """A short reason for the logs: the HTTP status ("429 Too Many Requests") or the error type."""
    response = getattr(error, "response", None)
    if response is not None:
        return f"{response.status_code} {response.reason_phrase}"
    return type(error).__name__


def _photon_features(url: str, params: dict) -> list | None:
    try:
        response = _http().get(url, params=params, timeout=GEOCODE_TIMEOUT_S)
        response.raise_for_status()
        features = response.json().get("features")
        return features if isinstance(features, list) else []
    except (httpx.HTTPError, ValueError, AttributeError) as error:
        log.warning("Photon lookup failed too: %s", _why(error))
        return None


def _photon_geocode(query: str) -> "GeoPoint | None | object":
    """Like geocode(), from Photon. _UNAVAILABLE when Photon cannot be reached either."""
    features = _photon_features(PHOTON_URL, {"q": query, "limit": 1, "lang": "en"})
    if features is None:
        return _UNAVAILABLE
    if not features:
        return None
    try:
        props = features[0].get("properties") or {}
        lng, lat = features[0]["geometry"]["coordinates"][:2]
        osm_type = _PHOTON_OSM_TYPES.get(str(props.get("osm_type")))
        name = ", ".join(str(props[k]) for k in ("name", "state", "country") if props.get(k)) or query
        return GeoPoint(
            name=name, lat=float(lat), lng=float(lng),
            source_url=f"https://www.openstreetmap.org/{osm_type}/{props['osm_id']}" if osm_type and props.get("osm_id") else None,
            kind=props.get("type") or props.get("osm_value"),
        )
    except (KeyError, TypeError, ValueError, IndexError):
        return None


def _photon_town_at(lat: float, lng: float) -> str | None:
    features = _photon_features(PHOTON_REVERSE_URL, {"lat": f"{lat:.5f}", "lon": f"{lng:.5f}", "limit": 1, "lang": "en"})
    if not features:
        return None
    props = features[0].get("properties") or {}
    town = props.get("city") or (props.get("name") if props.get("type") in ("city", "town", "village") else None) or props.get("county")
    region = props.get("state") or props.get("country")
    return ", ".join(str(part) for part in (town, region) if part) or None
_town_cache: dict[tuple[float, float], str | None] = {}


def nominatim_request(url: str, params: dict) -> object:
    """A Nominatim request, spaced out like geocode()'s: its usage policy allows about one per second.

    httpx and JSON errors reach the caller.
    """
    global _last_nominatim_call
    # A saved answer never reaches Nominatim, so it skips the one-a-second spacing.
    client = _http()
    transport = getattr(client, "_transport", None)
    if isinstance(transport, DiskCacheTransport):
        saved = transport.saved(client.build_request("GET", url, params=params))
        if saved is not None:
            return saved
    with _nominatim_lock:
        wait = NOMINATIM_MIN_INTERVAL_S - (time.monotonic() - _last_nominatim_call)
        if wait > 0:
            time.sleep(wait)
        try:
            response = _http().get(url, params=params, timeout=GEOCODE_TIMEOUT_S)
            response.raise_for_status()
            return response.json()
        finally:
            _last_nominatim_call = time.monotonic()


def town_at(lat: float, lng: float) -> str | None:
    """The town (or county) at a point, e.g. "Salina, Kansas", or None when unknown or the lookup fails."""
    key = (round(lat, 2), round(lng, 2))
    if key in _town_cache:
        return _town_cache[key]
    try:
        result = nominatim_request(NOMINATIM_REVERSE_URL, {"lat": f"{lat:.5f}", "lon": f"{lng:.5f}", "format": "jsonv2", "zoom": 10, "addressdetails": 1})
    except (httpx.HTTPError, ValueError) as error:
        log.warning("Nominatim reverse lookup failed: %s. Trying Photon.", _why(error))
        name = _photon_town_at(lat, lng)
        if name:
            _town_cache[key] = name
        return name  # None is not cached: a later call may succeed.
    address = result.get("address", {}) if isinstance(result, dict) else {}
    town = address.get("city") or address.get("town") or address.get("village") or address.get("county")
    region = address.get("state") or address.get("country")
    name = ", ".join(part for part in (town, region) if part) or None
    _town_cache[key] = name
    return name


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
    # "out center", not "out tags center": the tags-only mode leaves out node coordinates, and most
    # restaurants and attractions are single nodes, so they would all be dropped.
    return f"[out:json][timeout:9];({''.join(statements)});out center {fetch};"


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


# Fast path: Nominatim "special phrases" (e.g. "museums") searched inside a box around the location.
# It answers in under a second, where the public Overpass server often takes 10-40 s when busy.
# Each category has default phrases and keyword phrases; a keyword that names a phrase picks it.
NOMINATIM_SEARCH_LIMIT = 40
_PHRASES: dict[str, tuple[tuple[str, ...], dict[str, str]]] = {
    "Food": (("restaurants",), {"cafe": "cafes", "coffee": "cafes", "bar": "bars", "pub": "pubs", "beer": "pubs",
                               "fast food": "fast food", "ice cream": "ice cream", "market": "marketplaces"}),
    "Stays": (("hotels",), {"hostel": "hostels", "motel": "motels", "guest house": "guest houses", "guesthouse": "guest houses",
                            "apartment": "apartments", "camp": "camp sites", "camping": "camp sites", "chalet": "chalets"}),
    "Activities": (("attractions", "museums", "parks"), {
        "museum": "museums", "gallery": "galleries", "galleries": "galleries", "art": "galleries", "park": "parks", "garden": "gardens",
        "zoo": "zoos", "aquarium": "aquariums", "beach": "beaches", "viewpoint": "viewpoints", "view": "viewpoints",
        "attraction": "attractions", "sight": "attractions", "landmark": "attractions", "monument": "monuments",
        "castle": "castles"}),
}


def _phrases_for(category: str, keyword: str | None) -> tuple[tuple[str, ...], str | None]:
    """The Nominatim phrases to search, and the keyword left over to filter the results by (if any)."""
    defaults, by_keyword = _PHRASES[category]
    lowered = (keyword or "").lower()
    for word, phrase in by_keyword.items():
        # Whole words only (plurals allowed), so "barbecue" does not pick "bars".
        if re.search(rf"\b{re.escape(word)}(?:s|es)?\b", lowered):
            return (phrase,), None
    return defaults, keyword


def _matches_category(tags: dict, category: str) -> bool:
    return any(key in tags and (values is None or re.fullmatch(values, str(tags[key]))) for key, values in CATEGORY_FILTERS[category])


def _nominatim_element(result: dict) -> dict | None:
    """A Nominatim result in the shape of an Overpass element, so ranking and conversion are shared."""
    try:
        lat, lon = float(result["lat"]), float(result["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    tags = {key: value for key, value in (result.get("extratags") or {}).items() if isinstance(value, str)}
    if result.get("category") and result.get("type"):
        tags[result["category"]] = result["type"]
    if result.get("name"):
        tags.setdefault("name", result["name"])
    address = result.get("address") or {}
    for tag, field in (("addr:street", "road"), ("addr:housenumber", "house_number"), ("addr:postcode", "postcode")):
        if address.get(field):
            tags.setdefault(tag, address[field])
    city = address.get("city") or address.get("town") or address.get("village")
    if city:
        tags.setdefault("addr:city", city)
    return {"type": result.get("osm_type", "node"), "id": result.get("osm_id"), "lat": lat, "lon": lon, "tags": tags}


def _nominatim_elements(category: str, origin: GeoPoint, radius_m: int, keyword: str | None) -> list[dict]:
    """Places of one category inside the search box, as elements. httpx and JSON errors reach the caller."""
    phrases, leftover = _phrases_for(category, keyword)
    lat_span = radius_m / 111_320
    lng_span = lat_span / max(math.cos(math.radians(origin.lat)), 0.01)
    viewbox = f"{origin.lng - lng_span},{origin.lat + lat_span},{origin.lng + lng_span},{origin.lat - lat_span}"
    pattern = _keyword_regex(leftover)
    # A phrase search returns at most 40 places, which may include none of the keyword's. Searching
    # the keyword itself first finds places named after it ("Jack Stack Barbecue").
    if leftover:
        phrases = (leftover, *phrases)
    elements, seen = [], set()
    for phrase in phrases:
        results = nominatim_request(NOMINATIM_URL, {"q": phrase, "format": "jsonv2", "limit": NOMINATIM_SEARCH_LIMIT, "extratags": 1,
                                  "addressdetails": 1, "viewbox": viewbox, "bounded": 1})
        for result in results if isinstance(results, list) else []:
            element = _nominatim_element(result)
            if element is None or (element["type"], element["id"]) in seen or not _matches_category(element["tags"], category):
                continue
            tags = element["tags"]
            # A keyword that is not a phrase ("seafood", "bbq") filters by name or cuisine.
            if pattern and not re.search(pattern, f"{tags.get('name', '')} {tags.get('cuisine', '')}", re.IGNORECASE):
                continue
            seen.add((element["type"], element["id"]))
            elements.append(element)
    return elements


# Overpass allows about two requests at a time per visitor and per server; more get "429 Too Many
# Requests". Each server gets its own two slots here. Background work (warm.py, threads named
# "roam-warm...") uses at most one per server, and never starts while a traveler is searching.
BACKGROUND_THREAD_PREFIX = "roam-warm"
_host_slots = {urlsplit(url).hostname: threading.BoundedSemaphore(2) for url in OVERPASS_URLS}
_host_background = {urlsplit(url).hostname: threading.BoundedSemaphore(1) for url in OVERPASS_URLS}
# Requests start on different servers in turn, so two searches at once do not queue on one server.
_rotation = itertools.count()
# A slow server is common on the public instances; a second one is asked only after this long, so a
# quick answer costs one request and the shared servers are not asked twice for nothing.
HEDGE_AFTER_S = 8.0
_foreground_lock = threading.Lock()
_foreground_requests = 0


@contextmanager
def foreground():
    """Marks a traveler's request: background warming pauses its map searches until it is done."""
    global _foreground_requests
    with _foreground_lock:
        _foreground_requests += 1
    try:
        yield
    finally:
        with _foreground_lock:
            _foreground_requests -= 1


def traveler_waiting() -> bool:
    return _foreground_requests > 0


def _in_background() -> bool:
    return threading.current_thread().name.startswith(BACKGROUND_THREAD_PREFIX)


class _ServerBusy(Exception):
    """All of this server's slots are in use by our own other requests: try another server."""


def _ask_server(url: str, query: str, timeout_s: float, background: bool) -> list[dict]:
    host = urlsplit(url).hostname
    background_slot = _host_background.get(host) if background else None
    if background_slot is not None and (traveler_waiting() or not background_slot.acquire(blocking=False)):
        raise _ServerBusy()
    slot = _host_slots.get(host)
    if slot is not None and not slot.acquire(blocking=False):
        if background_slot is not None:
            background_slot.release()
        raise _ServerBusy()
    try:
        response = _http().post(url, data={"data": query}, timeout=timeout_s)
        response.raise_for_status()
        if overpass_failed(response.content):
            raise ValueError("the server ran out of time on this query")
        elements = response.json().get("elements", [])
        return elements if isinstance(elements, list) else []
    finally:
        if slot is not None:
            slot.release()
        if background_slot is not None:
            background_slot.release()


def overpass(query: str, timeout_s: float = SEARCH_TIMEOUT_S, budget_s: float | None = None) -> list[dict]:
    """Runs an Overpass query and returns the first complete answer. Raises PlacesUnavailable when none comes.

    The query goes to the next server in turn (so concurrent searches spread out). If that one has not
    answered after HEDGE_AFTER_S, a second server is asked too, and the first complete answer wins.
    Whenever a server fails, the next is asked, until `budget_s` runs out. An answer that says the
    server ran out of time counts as a failure.
    """
    background = _in_background()
    while background and traveler_waiting():
        time.sleep(0.5)
    started = time.monotonic()
    deadline = started + (budget_s if budget_s is not None else timeout_s * len(OVERPASS_URLS))
    first = next(_rotation) % len(OVERPASS_URLS)
    order = OVERPASS_URLS[first:] + OVERPASS_URLS[:first]
    pool = ThreadPoolExecutor(max_workers=len(order), thread_name_prefix=f"{threading.current_thread().name}-overpass")
    running: dict = {}  # future -> server URL
    untried = list(order)

    def ask_another() -> None:
        while untried:
            remaining = deadline - time.monotonic()
            url = untried.pop(0)
            if remaining >= 3:
                running[pool.submit(_ask_server, url, query, min(timeout_s, remaining), background)] = url
                return

    try:
        ask_another()
        # Hedge: if the first server is merely slow, also ask a second one after HEDGE_AFTER_S.
        hedge_at = started + HEDGE_AFTER_S
        while running:
            now = time.monotonic()
            until = min(deadline, hedge_at) if untried else deadline
            done, _ = wait(list(running), timeout=max(0.0, until - now), return_when=FIRST_COMPLETED)
            if not done:
                if time.monotonic() >= deadline:
                    break
                hedge_at = float("inf")
                ask_another()
                continue
            for future in done:
                url = running.pop(future)
                try:
                    return future.result()
                except _ServerBusy:
                    pass
                except (httpx.HTTPError, ValueError, AttributeError) as error:
                    reason = str(error) if isinstance(error, ValueError) else _why(error)
                    log.warning("Overpass %s failed after %.1f s: %s", urlsplit(url).hostname, time.monotonic() - started, reason)
                ask_another()
        log.warning("Overpass: no complete answer after %.1f s", time.monotonic() - started)
    finally:
        # Requests still running finish in the background and free their slots.
        pool.shutdown(wait=False)
    raise PlacesUnavailable("The place search service is not responding. Try again in a moment.")


def is_excluded(place: Place, exclude: list[str] | None) -> bool:
    """True when the place is one of `exclude`: names (any case) or OpenStreetMap source links."""
    if not exclude:
        return False
    wanted = {" ".join(item.split()).lower() for item in exclude if item}
    return place.name.lower() in wanted or any(url.lower() in wanted for url in place.source_urls)


def search_places(
    near: str,
    category: PlaceCategory,
    keyword: str | None = None,
    radius_m: int = 3000,
    limit: int = 8,
    exclude: list[str] | None = None,
) -> list[Place]:
    """Named places of one category around a location, best-documented and nearest first.

    `exclude` skips places already in the plan (names or source links), so asking for "another
    restaurant" never returns the current one.
    Returns an empty list when the location is unknown or nothing matches.
    Raises PlacesUnavailable when the map services cannot be reached.
    """
    if exclude:
        # Search for extra places so `limit` are left after skipping the excluded ones.
        found = search_places(near, category, keyword, radius_m, min(MAX_LIMIT, limit + len(exclude)))
        return [place for place in found if not is_excluded(place, exclude)][:limit]
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

    # Fast path first. Overpass (slow when busy) is only the backup for when Nominatim fails or finds nothing.
    try:
        elements = _nominatim_elements(category, origin, radius_m, keyword) or None
    except (httpx.HTTPError, ValueError):
        elements = None

    # Ask for far more than needed: Overpass returns matches in no useful order, so the ranking
    # below needs a wide pool to pick the well-documented, nearby ones from.
    query = _overpass_query(category, origin.lat, origin.lng, radius_m, keyword, fetch=OVERPASS_FETCH)
    for url in OVERPASS_URLS if elements is None else ():
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
    _town_cache.clear()
