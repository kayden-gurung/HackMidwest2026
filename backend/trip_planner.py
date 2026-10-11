"""Builds the first road-trip plan in code, with no AI, so the first run takes seconds.

    route (OSRM) -> stops along it that fit the traveler's interests and detour budget (route_search)
    -> lunch and an overnight stay for each day (one Overpass request) -> an ItinerarySnapshot

The result is the same ItinerarySnapshot the chat edits, so the traveler's follow-up requests
("swap Hays for somewhere quieter") go to the Strands agent with this plan as current_itinerary.
Every place in it came from a map lookup and keeps its source link; times and visit lengths are
planning estimates and are labeled as such.
"""

from __future__ import annotations

from datetime import date, timedelta

from pydantic import BaseModel, Field

from itinerary import ItinerarySnapshot, Location, PlanBudget, PlanItem, TripOverview
from tools import places
from tools.driving import DriveDay, DriveEstimate, estimate_drive, route_path
from tools.route_search import INTEREST_TAGS, RouteStop, corridor_stops

DAY_START_MINUTES = 8 * 60
LUNCH_MINUTES = 45
MAX_STOPS_PER_DAY = 3
# Two chosen stops closer than this would feel like the same stop.
MIN_GAP_MILES = 25
# Search widths for the day's meals and beds.
FOOD_RADIUS_M = 2_500
MIDDAY_FOOD_RADIUS_M = 8_000
STAY_RADIUS_M = 10_000
STAY_TAGS = "hotel|motel|guest_house"
FOOD_TAGS = "restaurant|cafe"
# Extra candidates shown for swapping, beyond the chosen stops.
MORE_STOPS = 8


class TripRequest(BaseModel):
    """The Trip setup form (frontend/src/roadtrip/types.ts DriveDraft)."""

    start: str = Field(min_length=2, max_length=120)
    destination: str = Field(min_length=2, max_length=120)
    interests: list[str] = Field(default_factory=list, max_length=len(INTEREST_TAGS))
    # Total extra driving the traveler accepts for detours, for the whole way there.
    detour_budget_minutes: int = Field(default=60, ge=0, le=480)
    departure_date: date | None = None
    max_miles_per_day: int = Field(default=400, ge=50, le=1500)
    mpg: float = Field(default=28, gt=5, le=150)
    gas_price: float = Field(default=3.25, gt=0.5, le=20)
    round_trip: bool = False
    # Which road: 0 is the fastest; see route_count in the answer for how many there are.
    route_index: int = Field(default=0, ge=0, le=3)


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
# Meals and beds: one Overpass request for every day's anchors.


class _Anchor:
    def __init__(self, key: str, lat: float, lng: float, radius_m: int, tags: str, tag_key: str):
        self.key, self.lat, self.lng, self.radius_m, self.tags, self.tag_key = key, lat, lng, radius_m, tags, tag_key


def _best_places(anchors: list[_Anchor]) -> tuple[dict[str, dict], bool]:
    """The best named place for each anchor, by key. Second value: False when the search failed."""
    if not anchors:
        return {}, True
    statements = "".join(
        f'nwr["{a.tag_key}"~"^({a.tags})$"]["name"](around:{a.radius_m},{a.lat:.5f},{a.lng:.5f});' for a in anchors
    )
    try:
        elements = places.overpass(f"[out:json][timeout:25];({statements});out center 800;", timeout_s=30)
    except places.PlacesUnavailable:
        return {}, False

    best: dict[str, tuple[tuple, dict]] = {}
    for element in elements:
        tags = element.get("tags") or {}
        spot = element if "lat" in element else element.get("center") or {}
        if not tags.get("name") or "lat" not in spot:
            continue
        lat, lng = float(spot["lat"]), float(spot["lon"])
        for anchor in anchors:
            value = tags.get(anchor.tag_key, "")
            if value not in anchor.tags.split("|"):
                continue
            distance = places._distance_m(anchor.lat, anchor.lng, lat, lng)
            if distance > anchor.radius_m:
                continue
            documented = ("wikidata" in tags) * 2 + bool(tags.get("website") or tags.get("contact:website")) + ("opening_hours" in tags)
            # Local places before chains for meals; any documented hotel is fine for a bed.
            local = 0 if anchor.tag_key == "tourism" else -bool(tags.get("brand"))
            rank = (local, documented, -distance)
            if anchor.key not in best or rank > best[anchor.key][0]:
                best[anchor.key] = (rank, {"tags": tags, "lat": lat, "lng": lng, "source": f"https://www.openstreetmap.org/{element.get('type', 'node')}/{element.get('id')}"})
    return {key: found for key, (_, found) in best.items()}, True


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
    estimate = estimate_drive(request.start, request.destination, request.round_trip, request.max_miles_per_day,
                              request.route_index, request.mpg, request.gas_price)
    coordinates = route_path(request.start, request.destination, request.route_index)
    if estimate is None or coordinates is None:
        return None

    notes: list[str] = []
    days = estimate.driving_days_each_way
    try:
        # Measure more candidates than needed: the budget and spacing rules skip some.
        candidates = corridor_stops(coordinates, request.interests, None, max_detour_minutes=max(request.detour_budget_minutes, 5),
                                    mpg=request.mpg, gas_price=request.gas_price, route_miles=estimate.distance_miles)
    except places.PlacesUnavailable:
        candidates = []
        notes.append("Live place search was unavailable, so this plan has only the driving. Try again in a moment to add stops.")
    stops = choose_stops(candidates, request.detour_budget_minutes, estimate.distance_miles, days)
    more = [c for c in candidates if c not in stops][:MORE_STOPS]
    if candidates and not stops:
        notes.append(f"No stop fit a {request.detour_budget_minutes}-minute detour budget. A bigger budget would allow some.")
    if any(s.detour_estimated for s in stops):
        notes.append("Some detour times are estimated from distance because the routing service did not answer.")

    itinerary, meal_notes = _itinerary(request, estimate, stops)
    notes += meal_notes
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
    )


def _itinerary(request: TripRequest, estimate: DriveEstimate, stops: list[RouteStop]) -> tuple[ItinerarySnapshot, list[str]]:
    legs = estimate.drive_days
    days = len(legs)
    start_date = request.departure_date or date.today()
    miles_per_day = estimate.distance_miles / days
    minutes_per_day = estimate.drive_hours * 60 / days
    fuel_per_leg = estimate.fuel_cost_usd / (days * (2 if request.round_trip else 1))
    destination = places.geocode(request.destination)
    stops_by_day: dict[int, list[RouteStop]] = {}
    for stop in stops:
        stops_by_day.setdefault(_day_of(stop, estimate.distance_miles, days), []).append(stop)

    # Lunch: near the stop closest to midday that day, else near the middle of the day's drive.
    lunch_stop: dict[int, RouteStop] = {}
    anchors: list[_Anchor] = []
    for day, leg in enumerate(legs):
        day_stops = stops_by_day.get(day, [])
        if day_stops:
            midday = day * miles_per_day + miles_per_day / 2
            lunch_stop[day] = min(day_stops, key=lambda s: abs(s.miles_from_start - midday))
            anchors.append(_Anchor(f"lunch-{day}", lunch_stop[day].lat, lunch_stop[day].lng, FOOD_RADIUS_M, FOOD_TAGS, "amenity"))
        elif leg.path and minutes_per_day >= 180:
            lat, lng = leg.path[len(leg.path) // 2]
            anchors.append(_Anchor(f"lunch-{day}", lat, lng, MIDDAY_FOOD_RADIUS_M, FOOD_TAGS, "amenity"))
        if day < days - 1 and leg.end_lat is not None:
            anchors.append(_Anchor(f"stay-{day}", leg.end_lat, leg.end_lng, STAY_RADIUS_M, STAY_TAGS, "tourism"))  # type: ignore[arg-type]
    if destination is not None:
        anchors.append(_Anchor("stay-destination", destination.lat, destination.lng, STAY_RADIUS_M, STAY_TAGS, "tourism"))
    found, search_ok = _best_places(anchors)
    notes = [] if search_ok else ["Live place search was unavailable, so lunch and overnight stays are left open."]

    items: list[PlanItem] = []
    for day, leg in enumerate(legs):
        when = start_date + timedelta(days=day)
        items.append(_drive_item(f"drive-{day + 1}", when, leg, fuel_per_leg))
        clock = DAY_START_MINUTES
        driven_minutes = 0.0
        lunch_done = False
        for stop in stops_by_day.get(day, []):
            to_here = (stop.miles_from_start - day * miles_per_day) / miles_per_day * minutes_per_day
            clock += max(0.0, to_here - driven_minutes)
            driven_minutes = max(driven_minutes, to_here)
            clock += stop.detour_minutes / 2  # half the detour is getting there
            items.append(_stop_item(stop, when, _clock(clock)))
            clock += stop.visit_minutes + stop.detour_minutes / 2
            if lunch_stop.get(day) is stop and f"lunch-{day}" in found:
                items.append(_place_item(f"lunch-{day + 1}", when, _clock(clock), f"Lunch: {found[f'lunch-{day}']['tags']['name']}",
                                         "Food", found[f"lunch-{day}"], f"Near {stop.name}. From OpenStreetMap: check it is open before you go."))
                clock += LUNCH_MINUTES
                lunch_done = True
        if not lunch_done and f"lunch-{day}" in found:
            # Halfway through the day's driving.
            clock += max(0.0, minutes_per_day / 2 - driven_minutes)
            driven_minutes = max(driven_minutes, minutes_per_day / 2)
            items.append(_place_item(f"lunch-{day + 1}", when, _clock(clock), f"Lunch: {found[f'lunch-{day}']['tags']['name']}",
                                     "Food", found[f"lunch-{day}"],
                                     "On the way, about halfway through the day's drive. From OpenStreetMap: check it is open before you go."))
            clock += LUNCH_MINUTES
        clock += max(0.0, minutes_per_day - driven_minutes)
        stay_key = f"stay-{day}" if day < days - 1 else "stay-destination"
        if stay_key in found:
            items.append(_place_item(f"stay-{day + 1}", when, _clock(clock), f"Overnight: {found[stay_key]['tags']['name']}",
                                     "Stays", found[stay_key], f"Near {_short(leg.end)}. Book ahead: Roam has no prices or availability."))

    if request.round_trip:
        for home_day, leg in enumerate(estimate.drive_days_home):
            day = days + home_day
            when = start_date + timedelta(days=day)
            items.append(_drive_item(f"drive-home-{home_day + 1}", when, leg, fuel_per_leg))
            # Home day j ends where the way out's day (days - 2 - j) ended: reuse that night's stay.
            outbound = days - 2 - home_day
            if outbound >= 0 and f"stay-{outbound}" in found:
                arrive = DAY_START_MINUTES + minutes_per_day
                items.append(_place_item(f"stay-home-{home_day + 1}", when, _clock(arrive), f"Overnight: {found[f'stay-{outbound}']['tags']['name']}",
                                         "Stays", found[f"stay-{outbound}"], f"Near {_short(leg.end)}. Book ahead: Roam has no prices or availability."))

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
    snapshot = ItinerarySnapshot(
        startDate=start_date,
        endDate=start_date + timedelta(days=total_days - 1),
        items=items[:100],
        budget=PlanBudget(plannedUsd=None),
        summary=f"{estimate.summary} {len(stops)} stop{'s' if len(stops) != 1 else ''} on the way, picked for {interests}."[:1000],
        assumptions=assumptions[:12],
        overview=TripOverview(destination=_short(estimate.destination)[:200],
                              headline=f"{_short(request.start)} to {_short(request.destination)}, the interesting way"[:120]),
    )
    return snapshot, notes


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
