"""Builds the first road-trip plan in code, with no AI, so the first run takes seconds.

    route (OSRM) -> stops along it that fit the traveler's interests and detour budget (route_search)
    -> lunch and an overnight stay for each day (one Overpass request) -> an ItinerarySnapshot

The result is the same ItinerarySnapshot the chat edits, so the traveler's follow-up requests
("swap Hays for somewhere quieter") go to the Strands agent with this plan as current_itinerary.
Every place in it came from a map lookup and keeps its source link; times and visit lengths are
planning estimates and are labeled as such.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from pydantic import BaseModel, Field

from itinerary import ItinerarySnapshot, Location, PlanBudget, PlanItem, TripOverview
from tools import places
from tools.driving import DriveDay, DriveEstimate, estimate_drive, route_path
from tools.route_search import INTEREST_TAGS, RoutePlaces, RouteStop, notability, rank_stops, search_route, source_url

log = logging.getLogger("roam.planner")

DAY_START_MINUTES = 8 * 60
LUNCH_MINUTES = 45
MAX_STOPS_PER_DAY = 3
# Two chosen stops closer than this would feel like the same stop.
MIN_GAP_MILES = 25
# Search widths for the day's meals and beds.
FOOD_RADIUS_M = 3_000
MIDDAY_FOOD_RADIUS_M = 15_000
STAY_RADIUS_M = 10_000
STAY_TAGS = "hotel|motel|guest_house"
FOOD_TAGS = "restaurant|cafe"
ANCHOR_TIMEOUT_S = 15.0
ANCHOR_BUDGET_S = 20.0
# A road trip wants a clean, ordinary bed: luxury hotels go last when anything else is near.
LUXURY = re.compile(r"ritz|four seasons|st\.? regis|waldorf|mandarin oriental|peninsula|fairmont|jw marriott|luxury|"
                    r"resort (&|and) spa|\bspa\b", re.IGNORECASE)
# Extra candidates shown for swapping, beyond the chosen stops.
MORE_STOPS = 8


class TripRequest(BaseModel):
    """The Trip setup form (frontend/src/roadtrip/types.ts DriveDraft)."""

    start: str = Field(min_length=2, max_length=120)
    destination: str = Field(min_length=2, max_length=120)
    interests: list[str] = Field(default_factory=list, max_length=len(INTEREST_TAGS))
    # Total extra driving the traveler accepts for detours, for the whole way there.
    # The Trip setup slider goes to 120; typed amounts up to 600 (frontend/src/roadtrip/types.ts).
    detour_budget_minutes: int = Field(default=60, ge=0, le=600)
    departure_date: date | None = None
    max_miles_per_day: int = Field(default=400, ge=50, le=1500)
    mpg: float = Field(default=28, gt=5, le=150)
    gas_price: float = Field(default=3.25, gt=0.5, le=20)
    round_trip: bool = False
    # Which road: 0 is the fastest; see route_count in the answer for how many there are.
    route_index: int = Field(default=0, ge=0, le=3)
    # False: only the route and the driving days, in a few seconds, for the screen to show while
    # the full plan (stops, meals, stays) is still being searched.
    include_places: bool = True


class RouteSummary(BaseModel):
    origin: str
    destination: str
    miles: int
    hours: float
    fuel_cost_usd: int
    summary: str
    google_maps_url: str
    route_index: int
    route_count: int
    # The whole way there as [lat, lng] points, for the map.
    path: list[list[float]]


class TripPlan(BaseModel):
    itinerary: ItinerarySnapshot
    route: RouteSummary
    # The stops in the plan, in route order.
    stops: list[RouteStop]
    # Other good stops that fit the detour budget on their own, for "swap this one" in the UI.
    more_stops: list[RouteStop]
    detour_minutes_used: int
    notes: list[str]
    # False for the quick route-only answer (include_places = false).
    complete: bool = True


# ---------------------------------------------------------------------------------------------


def choose_stops(candidates: list[RouteStop], budget_minutes: int, total_miles: float, days: int) -> list[RouteStop]:
    """The best stops that fit the detour budget together: spread out, at most a few per driving day."""
    chosen: list[RouteStop] = []
    used = 0
    per_day: dict[int, int] = {}
    # Good stops that cost little detour first. Right-on-the-route stops are almost free.
    for stop in sorted(candidates, key=lambda s: -s.score / (1 + s.detour_minutes / 15)):
        if used + stop.detour_minutes > budget_minutes:
            continue
        if any(abs(stop.miles_from_start - other.miles_from_start) < MIN_GAP_MILES for other in chosen):
            continue
        day = _day_of(stop, total_miles, days)
        if per_day.get(day, 0) >= MAX_STOPS_PER_DAY:
            continue
        chosen.append(stop)
        used += stop.detour_minutes
        per_day[day] = per_day.get(day, 0) + 1
    return sorted(chosen, key=lambda s: s.miles_from_start)


def _day_of(stop: RouteStop, total_miles: float, days: int) -> int:
    return min(days - 1, int(stop.miles_from_start / max(total_miles, 1) * days))


def _short(name: str) -> str:
    return name.split(",")[0].strip()


def _clock(minutes: float) -> str:
    minutes = int(min(max(minutes, 0), 23 * 60 + 59))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _hours_text(hours: float) -> str:
    whole, minutes = int(hours), round((hours - int(hours)) * 60)
    return f"{whole} h {minutes} min" if whole else f"{minutes} min"


# ---------------------------------------------------------------------------------------------
# Meals and beds: one Overpass request for every day's beds and midday meal, run while the route is searched.


class _Anchor:
    def __init__(self, key: str, lat: float, lng: float, radius_m: int, tags: str, tag_key: str):
        self.key, self.lat, self.lng, self.radius_m, self.tags, self.tag_key = key, lat, lng, radius_m, tags, tag_key


def _anchors(estimate: DriveEstimate, destination: places.GeoPoint | None) -> list[_Anchor]:
    """Where each day needs a bed (the overnight town, the destination) and a fallback lunch (mid-drive).
    These depend only on the route, so they can be searched before the stops are known."""
    legs = estimate.drive_days
    minutes_per_day = estimate.drive_hours * 60 / len(legs)
    anchors = []
    for day, leg in enumerate(legs):
        if leg.path and minutes_per_day >= 150:
            lat, lng = leg.path[len(leg.path) // 2]
            anchors.append(_Anchor(f"lunch-{day}", lat, lng, MIDDAY_FOOD_RADIUS_M, FOOD_TAGS, "amenity"))
        if day < len(legs) - 1 and leg.end_lat is not None:
            anchors.append(_Anchor(f"stay-{day}", leg.end_lat, leg.end_lng, STAY_RADIUS_M, STAY_TAGS, "tourism"))  # type: ignore[arg-type]
    if destination is not None:
        anchors.append(_Anchor("stay-destination", destination.lat, destination.lng, STAY_RADIUS_M, STAY_TAGS, "tourism"))
    return anchors


def _found(element: dict, lat: float, lng: float) -> dict:
    return {"tags": element.get("tags") or {}, "lat": lat, "lng": lng, "source": source_url(element)}


def _rank(tags: dict, is_bed: bool, distance: float) -> tuple:
    if is_bed:
        stars = str(tags.get("stars", ""))[:1]
        luxury = (stars.isdigit() and int(stars) >= 4) or bool(LUXURY.search(tags.get("name", "")))
        return (not luxury, notability(tags), -distance)
    # Local places before chains for meals.
    return (not tags.get("brand"), notability(tags), -distance)


def _anchor_places(anchors: list[_Anchor]) -> tuple[dict[str, dict], bool]:
    """The best named place for each anchor, by key. Second value: False when the search failed."""
    if not anchors:
        return {}, True
    statements = "".join(
        f'nwr["{a.tag_key}"~"^({a.tags})$"]["name"](around:{a.radius_m},{a.lat:.5f},{a.lng:.5f});' for a in anchors
    )
    started = time.monotonic()
    try:
        elements = places.overpass(
            f"[out:json][timeout:{int(ANCHOR_TIMEOUT_S) - 2}];({statements})->.found;"
            "node.found out qt 1500;(way.found;relation.found;);out tags center qt 1500;",
            timeout_s=ANCHOR_TIMEOUT_S, budget_s=ANCHOR_BUDGET_S,
        )
    except places.PlacesUnavailable:
        return {}, False
    log.info("meals and stays: %d map records in %.1f s", len(elements), time.monotonic() - started)

    best: dict[str, tuple[tuple, dict]] = {}
    for element in elements:
        tags = element.get("tags") or {}
        spot = element if "lat" in element else element.get("center") or {}
        if not tags.get("name") or "lat" not in spot:
            continue
        lat, lng = float(spot["lat"]), float(spot["lon"])
        for anchor in anchors:
            if tags.get(anchor.tag_key, "") not in anchor.tags.split("|"):
                continue
            distance = places._distance_m(anchor.lat, anchor.lng, lat, lng)
            if distance > anchor.radius_m:
                continue
            rank = _rank(tags, anchor.tag_key == "tourism", distance)
            if anchor.key not in best or rank > best[anchor.key][0]:
                best[anchor.key] = (rank, _found(element, lat, lng))
    return {key: found for key, (_, found) in best.items()}, True


def _food_near(food: list[dict], lat: float, lng: float) -> dict | None:
    """The best local place to eat within FOOD_RADIUS_M of a stop, from what the route search found."""
    best = None
    for element in food:
        spot = element if "lat" in element else element.get("center") or {}
        if "lat" not in spot:
            continue
        distance = places._distance_m(lat, lng, float(spot["lat"]), float(spot["lon"]))
        if distance > FOOD_RADIUS_M:
            continue
        rank = _rank(element.get("tags") or {}, False, distance)
        if best is None or rank > best[0]:
            best = (rank, _found(element, float(spot["lat"]), float(spot["lon"])))
    return best[1] if best else None


def _place_item(item_id: str, day: date, time: str | None, title: str, category: str, found: dict, description: str) -> PlanItem:
    tags = found["tags"]
    return PlanItem(
        id=item_id, date=day, time=time, title=title[:200], category=category,  # type: ignore[arg-type]
        description=description[:1200],
        location=Location(name=tags["name"][:200], address=(places._address(tags) or None), lat=found["lat"], lng=found["lng"]),
        websiteUrl=places._web_url(tags.get("website") or tags.get("contact:website")),
        sourceUrls=[found["source"]],
    )


# ---------------------------------------------------------------------------------------------


def build_first_plan(request: TripRequest) -> TripPlan | None:
    """The first plan for a drive. None when either place is unknown or no road connects them.

    Raises PlacesUnavailable only when the route itself cannot be fetched; if the place search is
    down, the plan still comes back with the driving and a note.
    """
    started = time.monotonic()
    estimate = estimate_drive(request.start, request.destination, request.round_trip, request.max_miles_per_day,
                              request.route_index, request.mpg, request.gas_price)
    coordinates = route_path(request.start, request.destination, request.route_index)
    if estimate is None or coordinates is None:
        return None
    destination = places.geocode(request.destination)
    log.info("plan %s -> %s: route and overnight towns in %.1f s", request.start, request.destination, time.monotonic() - started)

    notes: list[str] = []
    found: RoutePlaces | None = None
    picks: dict[str, dict] = {}
    if request.include_places:
        # The two map searches run at the same time: stops along the route, and beds and meals.
        with ThreadPoolExecutor(max_workers=2) as pool:
            route_search = pool.submit(search_route, coordinates)
            anchor_search = pool.submit(_anchor_places, _anchors(estimate, destination))
            try:
                found = route_search.result()
            except places.PlacesUnavailable:
                notes.append("Live place search was unavailable, so this plan has no stops yet. Try again in a moment to add them.")
            picks, anchors_ok = anchor_search.result()
        if not anchors_ok:
            notes.append("Live place search was unavailable, so lunch and overnight stays are left open.")

    days = estimate.driving_days_each_way
    candidates = rank_stops(coordinates, found, request.interests, None, max_detour_minutes=max(request.detour_budget_minutes, 5),
                            mpg=request.mpg, gas_price=request.gas_price, route_miles=estimate.distance_miles) if found else []
    stops = choose_stops(candidates, request.detour_budget_minutes, estimate.distance_miles, days)
    more = [c for c in candidates if c not in stops][:MORE_STOPS]
    if candidates and not stops:
        notes.append(f"No stop fit a {request.detour_budget_minutes}-minute detour budget. A bigger budget would allow some.")
    if any(s.detour_estimated for s in stops):
        notes.append("Some detour times are estimated from distance because the routing service did not answer.")

    itinerary = _itinerary(request, estimate, stops, picks, found.food if found else [])
    log.info("plan %s -> %s: %.1f s in total, %d stops%s", request.start, request.destination,
             time.monotonic() - started, len(stops), "" if request.include_places else " (route only)")
    return TripPlan(
        itinerary=itinerary,
        route=RouteSummary(
            origin=estimate.origin, destination=estimate.destination, miles=estimate.distance_miles,
            hours=estimate.drive_hours, fuel_cost_usd=estimate.fuel_cost_usd, summary=estimate.summary,
            google_maps_url=estimate.google_maps_url, route_index=estimate.route_index, route_count=estimate.route_count,
            path=[point for day in estimate.drive_days for point in day.path],
        ),
        stops=stops,
        more_stops=more,
        detour_minutes_used=sum(s.detour_minutes for s in stops),
        notes=notes,
        complete=request.include_places,
    )


def _itinerary(request: TripRequest, estimate: DriveEstimate, stops: list[RouteStop], picks: dict[str, dict],
               food: list[dict]) -> ItinerarySnapshot:
    legs = estimate.drive_days
    days = len(legs)
    start_date = request.departure_date or date.today()
    miles_per_day = estimate.distance_miles / days
    minutes_per_day = estimate.drive_hours * 60 / days
    fuel_per_leg = estimate.fuel_cost_usd / (days * (2 if request.round_trip else 1))
    stops_by_day: dict[int, list[RouteStop]] = {}
    for stop in stops:
        stops_by_day.setdefault(_day_of(stop, estimate.distance_miles, days), []).append(stop)

    items: list[PlanItem] = []
    for day, leg in enumerate(legs):
        when = start_date + timedelta(days=day)
        items.append(_drive_item(f"drive-{day + 1}", when, leg, fuel_per_leg))
        clock = DAY_START_MINUTES
        driven_minutes = 0.0
        lunch_done = False
        day_stops = stops_by_day.get(day, [])
        # Lunch near the stop closest to midday, when there is a local place to eat there.
        midday = day * miles_per_day + miles_per_day / 2
        lunch_stop = min(day_stops, key=lambda s: abs(s.miles_from_start - midday)) if day_stops else None
        for stop in day_stops:
            to_here = (stop.miles_from_start - day * miles_per_day) / miles_per_day * minutes_per_day
            clock += max(0.0, to_here - driven_minutes)
            driven_minutes = max(driven_minutes, to_here)
            clock += stop.detour_minutes / 2  # half the detour is getting there
            items.append(_stop_item(stop, when, _clock(clock)))
            clock += stop.visit_minutes + stop.detour_minutes / 2
            lunch = _food_near(food, stop.lat, stop.lng) if stop is lunch_stop else None
            if lunch:
                items.append(_place_item(f"lunch-{day + 1}", when, _clock(clock), f"Lunch: {lunch['tags']['name']}", "Food", lunch,
                                         f"Near {stop.name}. From OpenStreetMap: check it is open before you go."))
                clock += LUNCH_MINUTES
                lunch_done = True
        if not lunch_done and f"lunch-{day}" in picks:
            # Halfway through the day's driving.
            clock += max(0.0, minutes_per_day / 2 - driven_minutes)
            driven_minutes = max(driven_minutes, minutes_per_day / 2)
            items.append(_place_item(f"lunch-{day + 1}", when, _clock(clock), f"Lunch: {picks[f'lunch-{day}']['tags']['name']}",
                                     "Food", picks[f"lunch-{day}"],
                                     "On the way, about halfway through the day's drive. From OpenStreetMap: check it is open before you go."))
            clock += LUNCH_MINUTES
        clock += max(0.0, minutes_per_day - driven_minutes)
        stay_key = f"stay-{day}" if day < days - 1 else "stay-destination"
        if stay_key in picks:
            items.append(_place_item(f"stay-{day + 1}", when, _clock(clock), f"Overnight: {picks[stay_key]['tags']['name']}",
                                     "Stays", picks[stay_key], f"Near {_short(leg.end)}. Book ahead: Roam has no prices or availability."))

    if request.round_trip:
        for home_day, leg in enumerate(estimate.drive_days_home):
            day = days + home_day
            when = start_date + timedelta(days=day)
            items.append(_drive_item(f"drive-home-{home_day + 1}", when, leg, fuel_per_leg))
            # Home day j ends where the way out's day (days - 2 - j) ended: reuse that night's stay.
            outbound = days - 2 - home_day
            if outbound >= 0 and f"stay-{outbound}" in picks:
                arrive = DAY_START_MINUTES + minutes_per_day
                items.append(_place_item(f"stay-home-{home_day + 1}", when, _clock(arrive), f"Overnight: {picks[f'stay-{outbound}']['tags']['name']}",
                                         "Stays", picks[f"stay-{outbound}"], f"Near {_short(leg.end)}. Book ahead: Roam has no prices or availability."))

    total_days = days * (2 if request.round_trip else 1)
    interests = ", ".join(i for i in request.interests if i in INTEREST_TAGS) or "history, nature and quirky stops"
    assumptions = [
        *estimate.assumptions,
        "Each day starts at 8:00 am. Times and visit lengths are rough planning estimates.",
        "Detour times are from OSRM routing, without traffic.",
        "Stops, meals and stays come from OpenStreetMap, which has no prices, ratings or live opening hours.",
    ]
    if request.departure_date is None:
        assumptions.append("No departure date was given, so the plan starts today.")
    return ItinerarySnapshot(
        startDate=start_date,
        endDate=start_date + timedelta(days=total_days - 1),
        items=items[:100],
        budget=PlanBudget(plannedUsd=None),
        summary=f"{estimate.summary} {len(stops)} stop{'s' if len(stops) != 1 else ''} on the way, picked for {interests}."[:1000],
        assumptions=assumptions[:12],
        overview=TripOverview(destination=_short(estimate.destination)[:200],
                              headline=f"{_short(request.start)} to {_short(request.destination)}, the interesting way"[:120]),
    )


def _drive_item(item_id: str, when: date, leg: DriveDay, fuel_usd: float) -> PlanItem:
    return PlanItem(
        id=item_id, date=when, time=_clock(DAY_START_MINUTES), category="Driving",
        title=f"Drive {_short(leg.start)} → {_short(leg.end)} ({leg.miles} mi, about {_hours_text(leg.drive_hours)})"[:200],
        description=f"Fuel for this leg is about ${round(fuel_usd)} (estimate). Driving time is without stops or traffic.",
        costUsd=round(fuel_usd, 2),
        location=Location(name=_short(leg.end)[:200], lat=leg.end_lat, lng=leg.end_lng) if leg.end_lat is not None else None,
        # The directions link is the leg's source; the chat's accuracy check recognizes it (evidence_from_snapshot).
        websiteUrl=leg.google_maps_url,
        route=leg.path or None,
    )


def _stop_item(stop: RouteStop, when: date, time: str) -> PlanItem:
    category = "Food" if stop.interests == ["Local food"] else "Activities"
    detour = "Right on the route." if stop.detour_minutes <= 2 else f"About {stop.detour_minutes} min of extra driving."
    return PlanItem(
        id=f"stop-{stop.id}", date=when, time=time, category=category,  # type: ignore[arg-type]
        title=(f"Stop: {stop.name}" + (f" ({stop.town})" if stop.town and stop.town not in stop.name else ""))[:200],
        description=f"{stop.reason} {detour} Plan about {stop.visit_minutes} min here (estimate)."[:1200],
        location=Location(name=stop.name[:200], address=stop.address, lat=stop.lat, lng=stop.lng),
        websiteUrl=stop.website_url,
        sourceUrls=stop.source_urls,
    )
