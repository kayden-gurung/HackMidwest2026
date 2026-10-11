"""Small changes to a road-trip plan, made in code so the chat does not rewrite the whole plan.

Without these, changing one stop means the model looks places up through a specialist agent and
then writes every stop, meal and bed out again (check_budget). With them the model makes two short
calls and plain code does the rest:

    find_options   real places that could go into the plan: towns on the route, or attractions,
                   restaurants and stays near a stop or in a town
    edit_stops     take stops out and put chosen options in. Only those items change; the whole
                   route is then checked like any other draft (accuracy check, detour budget)

The checked draft is handed to ItineraryUpdates.stage, so update_itinerary (no arguments) shows the
traveler the usual approval card. Nothing reaches the plan without that approval.

Only for road trips with a current plan (see routers/ask.py). Everything added comes from a map
lookup made in this request and keeps its source link; costs are the same labeled estimates the
first plan uses (trip_planner.py).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date

from pydantic import ValidationError
from strands import tool

from evidence import Evidence
from itinerary import ItinerarySnapshot, ItineraryUpdates, Location, PlanItem
from roadtrip import RoadTripPlanner
from tools import places, route_search
from trip_planner import INTERESTS_NOTE, LUNCH_MINUTES, _stop_item, meal_estimate, stay_estimate

log = logging.getLogger("roam.quick_edits")

MAX_OPTIONS = 6
# A replacement this close to the stop it replaces takes that stop's place in the day.
SAME_PLACE_M = 30_000
# A meal this close to a stop was chosen for that stop, so it moves when the stop moves away.
MEAL_NEAR_STOP_M = 5_000
# An option this close to something already in the plan is the same town: not "a different town".
SAME_TOWN_M = 8_000
COSTS_NOTE = "Meal, admission and room costs are typical U.S. amounts for one traveler and one room, not looked-up prices."

# The words the model may use for each kind of option, and how each is searched.
KINDS = {
    "town": "town", "towns": "town", "stop": "town", "stops": "town",
    "attraction": "attraction", "attractions": "attraction", "activity": "attraction", "activities": "attraction",
    "restaurant": "restaurant", "restaurants": "restaurant", "food": "restaurant", "lunch": "restaurant", "meal": "restaurant",
    "stay": "stay", "stays": "stay", "hotel": "stay", "hotels": "stay", "lodging": "stay",
}
# kind -> (place category, search radius in metres, item id prefix, title prefix)
NEARBY = {
    "attraction": ("Activities", 5_000, "stop", "Stop: "),
    "restaurant": ("Food", 3_000, "food", "Lunch: "),
    "stay": ("Stays", 10_000, "stay", "Overnight: "),
}


@dataclass
class Option:
    """One place that could go into the plan, ready to become an item."""

    id: str
    kind: str
    item: PlanItem  # its date and time are placeholders until edit_stops finds its place in the trip
    town: str | None = None
    detour_minutes: int | None = None
    visit_minutes: int = 30

    def for_model(self) -> dict:
        location = self.item.location
        return {key: value for key, value in {
            "option_id": self.id, "name": location.name if location else self.item.title, "kind": self.kind,
            "town": self.town, "detour_minutes_alone": self.detour_minutes, "estimated_cost_usd": self.item.costUsd,
            "website": self.item.websiteUrl, "what_the_map_says": self.item.description,
        }.items() if value is not None}


def _minutes(clock: str | None) -> int | None:
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", clock or "")
    return int(match.group(1)) * 60 + int(match.group(2)) if match else None


def _clock(minutes: float) -> str:
    minutes = int(min(max(minutes, 6 * 60), 22 * 60))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _spot(item: PlanItem) -> tuple[float, float] | None:
    location = item.location
    return (location.lat, location.lng) if location and location.lat is not None and location.lng is not None else None


def _item_id(prefix: str, source_urls: list[str], taken: set[str]) -> str:
    tail = "-".join(source_urls[0].rstrip("/").split("/")[-2:]) if source_urls else "place"
    candidate, n = f"{prefix}-{tail}", 2
    while candidate in taken:
        candidate, n = f"{prefix}-{tail}-{n}", n + 1
    return candidate


def interests_of(plan: ItinerarySnapshot, saved: list[str] | None) -> list[str]:
    """The interests the plan was made for: the request's, else the line the first plan wrote down."""
    known = [i for i in saved or [] if i in route_search.INTEREST_TAGS]
    if known:
        return known
    for line in plan.assumptions:
        if line.startswith(INTERESTS_NOTE):
            listed = [part.strip().rstrip(".") for part in line[len(INTERESTS_NOTE):].split(",")]
            return [i for i in listed if i in route_search.INTEREST_TAGS]
    return []


class QuickEdits:
    """One per chat request, like ItineraryUpdates. `tools()` are the two Strands tools."""

    def __init__(self, planner: RoadTripPlanner, updates: ItineraryUpdates, evidence: Evidence,
                 current: ItinerarySnapshot, interests: list[str] | None = None):
        self.planner, self.updates, self.evidence = planner, updates, evidence
        # The plan as edited so far in this request. Each accepted edit_stops call builds on the last.
        self.working = current.model_copy(deep=True)
        self.interests = interests_of(current, interests)
        self.options: dict[str, Option] = {}
        self._route_index: tuple[route_search._RouteIndex, float] | None = None

    # -----------------------------------------------------------------------------------------
    # Where things are along the drive

    def _along(self, lat: float, lng: float) -> float | None:
        """Metres from the start of the route to the point on it nearest this place."""
        if self._route_index is None:
            route = self.planner.route([])
            points = route_search._simplify(route["coordinates"])
            cumulative = route_search._cumulative(points)
            self._route_index = (route_search._RouteIndex(points, cumulative, 60_000), cumulative[-1])
        located = self._route_index[0].locate(lat, lng)
        return located[1] if located else None

    def _visits(self, items: list[PlanItem] | None = None) -> list[PlanItem]:
        return [item for item in (self.working.items if items is None else items) if item.category != "Driving"]

    def _slot(self, items: list[PlanItem], lat: float, lng: float) -> tuple[date, str]:
        """The day and rough time for a new place: between the plan's places before and after it on the road."""
        along = self._along(lat, lng)
        placed = []
        for item in self._visits(items):
            spot = _spot(item)
            where = self._along(*spot) if spot else None
            if where is not None and _minutes(item.time) is not None:
                placed.append((where, item))
        if along is None or not placed:
            return self.working.startDate, "10:00"
        placed.sort(key=lambda pair: pair[0])
        before = [item for where, item in placed if where <= along]
        after = [item for where, item in placed if where > along]
        previous, following = (before[-1] if before else None), (after[0] if after else None)
        if previous and following and previous.date == following.date:
            return previous.date, _clock((_minutes(previous.time) + _minutes(following.time)) / 2)
        if previous:
            return previous.date, _clock(_minutes(previous.time) + 60)
        return following.date, _clock(_minutes(following.time) - 60)

    # -----------------------------------------------------------------------------------------
    # Options

    def _remember(self, option: Option) -> None:
        self.options[option.id] = option
        location = option.item.location
        # Written down as evidence, so the accuracy check keeps its pin, website and source link.
        self.evidence.add_place({"name": location.name, "lat": location.lat, "lng": location.lng, "address": location.address,
                                 "website_url": option.item.websiteUrl, "source_urls": option.item.sourceUrls})

    def _taken(self) -> tuple[set[str], set[str]]:
        visits = self._visits()
        names = {(item.location.name if item.location else item.title).lower() for item in visits}
        return names, {url for item in visits for url in item.sourceUrls}

    def _town_options(self, interests: list[str]) -> list[Option]:
        names, sources = self._taken()
        towns = {match.group(1).lower() for item in self._visits() if (match := re.search(r"\(([^()]+)\)\s*$", item.title))}
        preferences = self.planner.preferences
        stops = route_search.towns_along_route(
            preferences.origin, preferences.destination, interests or self.interests or None, self.planner.route_option,
            exclude=[*names, *sources, *towns], max_detour_minutes=max(preferences.detour_minutes, 5), limit=MAX_OPTIONS * 2)
        here = [spot for item in self._visits() if (spot := _spot(item))]
        options = []
        for stop in sorted(stops, key=lambda s: -s.score):  # best documented first
            if any(places._distance_m(stop.lat, stop.lng, *spot) < SAME_TOWN_M for spot in here):
                continue
            item = _stop_item(stop, self.working.startDate, "10:00")
            options.append(Option(id=f"o{len(self.options) + len(options) + 1}", kind=stop.kind, item=item, town=stop.town,
                                  detour_minutes=stop.detour_minutes, visit_minutes=stop.visit_minutes))
        return options[:MAX_OPTIONS]

    def _nearby_options(self, kind: str, lat: float, lng: float, where: str, keyword: str) -> list[Option]:
        category, radius_m, _, title_prefix = NEARBY[kind]
        _, sources = self._taken()
        # The same name in another town is another place ("Main Street Diner"); the same name next door is this one mapped twice.
        here = [(item.location.name.lower(), _spot(item)) for item in self._visits() if _spot(item)]
        found = places.search_around(lat, lng, category, keyword or None, radius_m, MAX_OPTIONS * 2)  # type: ignore[arg-type]
        if kind == "restaurant":
            found = sorted(found, key=lambda place: bool(place.brand))  # local places before chains, as in the first plan
        options = []
        for place in found:
            if sources.intersection(place.source_urls) or any(
                    name == place.name.lower() and places._distance_m(place.lat, place.lng, *spot) < 500 for name, spot in here):
                continue
            label = place.kind.replace("_", " ")
            if kind == "restaurant":
                cost, cost_note = meal_estimate({"amenity": place.kind})
                description = f"{label.capitalize()} near {where}. From OpenStreetMap: check it is open before you go. {cost_note}"
            elif kind == "stay":
                cost, cost_note = stay_estimate({"tourism": place.kind, "name": place.name})
                description = f"{label.capitalize()} near {where}. Book ahead: Roam has no availability. {cost_note}"
            else:
                cost, cost_note = route_search.admission_estimate({"tourism": place.kind, "historic": place.kind})
                description = f"{label.capitalize()} near {where}. {cost_note}"
            item = PlanItem(
                id="pending", date=self.working.startDate, time="10:00", category=category,  # type: ignore[arg-type]
                title=f"{title_prefix}{place.name}"[:200], description=description[:1200], costUsd=cost,
                location=Location(name=place.name[:200], address=place.address, lat=place.lat, lng=place.lng),
                websiteUrl=place.website_url, sourceUrls=place.source_urls)
            options.append(Option(id=f"o{len(self.options) + len(options) + 1}", kind=label, item=item,
                                  visit_minutes=LUNCH_MINUTES if kind == "restaurant" else 30))
        return options[:MAX_OPTIONS]

    def find_options(self, kind: str, stop_id: str = "", city: str = "", keyword: str = "", interests: list[str] | None = None) -> dict:
        wanted = KINDS.get((kind or "").strip().lower())
        if wanted is None:
            return {"status": "error", "message": 'kind must be "town", "attraction", "restaurant" or "stay".', "options": []}
        try:
            if wanted == "town":
                options = self._town_options([i for i in interests or [] if i in route_search.INTEREST_TAGS])
            else:
                anchor = next((item for item in self._visits() if item.id == stop_id), None)
                if anchor is not None and _spot(anchor):
                    (lat, lng), where = _spot(anchor), anchor.location.name
                elif city.strip():
                    point = places.geocode(city)
                    if point is None:
                        return {"status": "no_results", "message": f'Could not locate "{city}".', "options": []}
                    lat, lng, where = point.lat, point.lng, city.strip()
                else:
                    return {"status": "error", "options": [], "message": "Give stop_id (an item id from the current itinerary) or city, to say where to look."}
                options = self._nearby_options(wanted, lat, lng, where, keyword.strip())
        except (places.PlacesUnavailable, ValueError) as error:
            log.warning("find_options(%s) failed: %s", wanted, error)
            return {"status": "unavailable", "options": [],
                    "message": f"{error} Do not retry now: keep the current plan and tell the traveler live place data was unavailable."}
        if not options:
            return {"status": "no_results", "options": [],
                    "message": "No different places of this kind were found. Keep the current stops, or try another kind, keyword or town."}
        for option in options:
            self._remember(option)
        result = {"status": "ok", "source": "OpenStreetMap", "options": [option.for_model() for option in options],
                  "message": "Choose with edit_stops(add_option_ids=[...]). Costs are typical amounts, not looked-up prices."}
        road = self.working.roadTrip
        if road is not None and wanted == "town":
            result["detour_minutes_used_now"] = round(road.detourMinutes)
            result["detour_budget_minutes"] = road.detourBudgetMinutes
            result["message"] += " Each detour is for that place alone; edit_stops measures the whole route."
        return result

    # -----------------------------------------------------------------------------------------
    # Edits

    def _move_meal(self, items: list[PlanItem], old: PlanItem, new: PlanItem, visit_minutes: int) -> list[str]:
        """A meal chosen for the stop that is leaving is replaced by one near the new stop. Returns notes."""
        old_spot, new_spot = _spot(old), _spot(new)
        notes = []
        for meal in [i for i in items if i.category == "Food" and _spot(i) and old_spot
                     and places._distance_m(*_spot(i), *old_spot) <= MEAL_NEAR_STOP_M]:
            try:
                near = self._nearby_options("restaurant", *new_spot, new.location.name, "")
            except (places.PlacesUnavailable, ValueError):
                near = []
            if not near:
                notes.append(f"{meal.title} is still near {old.location.name}, which is no longer a stop. Ask the traveler whether to change it.")
                continue
            option = near[0]
            self._remember(option)
            taken = {i.id for i in items}
            replacement = option.item.model_copy(update={
                "id": _item_id("food", option.item.sourceUrls, taken), "date": new.date,
                "time": _clock((_minutes(new.time) or 12 * 60) + visit_minutes)})
            items[items.index(meal)] = replacement
            notes.append(f"{meal.title} was near {old.location.name}, so it is replaced by {replacement.title} near {new.location.name}.")
        return notes

    def edit_stops(self, remove_ids: list[str] | None = None, add_option_ids: list[str] | None = None) -> dict:
        remove_ids, add_option_ids = list(dict.fromkeys(remove_ids or [])), list(dict.fromkeys(add_option_ids or []))
        if not remove_ids and not add_option_ids:
            return {"status": "error", "message": "Nothing to change: give remove_ids, add_option_ids or both."}
        by_id = {item.id: item for item in self._visits()}
        unknown = [item_id for item_id in remove_ids if item_id not in by_id]
        if unknown:
            return {"status": "error", "message": f"No stop, meal or stay with id {', '.join(unknown)}. Driving legs cannot be removed.",
                    "valid_ids": {item_id: item.title for item_id, item in by_id.items()}}
        missing = [option_id for option_id in add_option_ids if option_id not in self.options]
        if missing:
            return {"status": "error", "message": f"Unknown option {', '.join(missing)}. Use an option_id from find_options in this turn."}

        removed = [by_id[item_id] for item_id in remove_ids]
        items = [item for item in self.working.items if item.id not in remove_ids]
        added, notes = [], []
        try:
            for position, option_id in enumerate(add_option_ids):
                option = self.options[option_id]
                spot = _spot(option.item)
                # A one-for-one swap nearby keeps the old stop's place in the day.
                old = removed[position] if len(removed) == len(add_option_ids) else None
                swap_in_place = bool(old and _spot(old) and places._distance_m(*spot, *_spot(old)) <= SAME_PLACE_M)
                when, clock = (old.date, old.time or "10:00") if swap_in_place else self._slot(items, *spot)
                prefix = NEARBY[next((k for k, v in NEARBY.items() if v[0] == option.item.category), "attraction")][2]
                new = option.item.model_copy(update={"id": _item_id(prefix, option.item.sourceUrls, {i.id for i in items}),
                                                     "date": when, "time": clock})
                items.append(new)
                added.append(new)
                if old and not swap_in_place and old.category == "Activities" and new.category == "Activities":
                    notes += self._move_meal(items, old, new, option.visit_minutes)
            for old in removed if len(removed) != len(add_option_ids) else []:
                if old.category == "Activities" and _spot(old):
                    notes += [f"{meal.title} is still near {old.location.name}, which is no longer a stop. Ask the traveler whether to change it."
                              for meal in items if meal.category == "Food" and _spot(meal)
                              and places._distance_m(*_spot(meal), *_spot(old)) <= MEAL_NEAR_STOP_M]
            assumptions = list(self.working.assumptions)
            if added and COSTS_NOTE not in assumptions and len(assumptions) < 12:
                assumptions.append(COSTS_NOTE)
            draft = ItinerarySnapshot.model_validate(
                self.working.model_copy(update={"items": items, "assumptions": assumptions}).model_dump())
            checked, accuracy_notes = self.updates.stage(draft)
        except (ValueError, ValidationError, places.PlacesUnavailable) as error:
            # Too much extra driving, more than ten stops, or the route check could not run: nothing changes.
            log.warning("edit_stops rejected: %s", error)
            return {"status": "rejected", "message": f"{error} The plan is unchanged. Choose a different option or remove a stop first."}
        self.working = draft
        result = {"status": "checked", "removed": [item.title for item in removed], "added": [item.title for item in added],
                  "next_step": "Call update_itinerary with no arguments to show this change to the traveler for approval. "
                               "Do not call check_budget and do not write the itinerary out."}
        if notes or accuracy_notes:
            result["notes"] = [*notes, *accuracy_notes]
        if checked.roadTrip is not None:
            road = checked.roadTrip
            result["road_trip"] = {"distance_miles": road.distanceMiles, "driving_minutes": road.drivingMinutes,
                                   "detour_minutes": road.detourMinutes, "detour_budget_minutes": road.detourBudgetMinutes,
                                   "fuel_cost_usd": road.fuelCostUsd}
        return result

    # -----------------------------------------------------------------------------------------

    def tools(self) -> list:
        edits = self

        @tool
        def find_options(kind: str, stop_id: str = "", city: str = "", keyword: str = "", interests: list[str] | None = None) -> dict:
            """Find real places that could go into the current road-trip plan. Fast: use this for any change to stops, meals or stays.

            Returns options with an option_id each. Put chosen ones into the plan with edit_stops.
            Places already in the plan are left out. Results come from OpenStreetMap: no ratings,
            reviews or live opening hours, and costs are typical amounts, never looked-up prices.

            Args:
                kind: "town" for different towns and stops along the route; or "attraction", "restaurant" or "stay" for places near one spot.
                stop_id: For attraction, restaurant or stay: the id of the itinerary item to look near (usually the one being replaced).
                city: Instead of stop_id: a town name to look in, e.g. "Hays, Kansas".
                keyword: Optional word to narrow attraction, restaurant or stay results, e.g. "museum", "bbq", "motel".
                interests: Only for kind "town", and only when the traveler asks for a different kind of place than the plan was made for
                    (slower): any of "History", "Architecture", "Nature", "Quirky stops", "Small towns".
            """
            return edits.find_options(kind, stop_id, city, keyword, interests)

        @tool
        def edit_stops(remove_ids: list[str] | None = None, add_option_ids: list[str] | None = None) -> dict:
            """Change the current road-trip plan without writing it out: remove items, add options from find_options, or both (a swap).

            Only the named items change; every other stop keeps its id. The backend places new
            items in the right day, measures the whole route and checks the detour budget. When the
            result is "checked", call update_itinerary with no arguments so the traveler can
            approve it. When it is "rejected", the plan is unchanged: read the message, then try a
            different option.

            Args:
                remove_ids: Ids of stops, meals or stays in the current itinerary to take out.
                add_option_ids: option_id values from find_options in this turn to put in. With the same number of
                    remove_ids, each one replaces the item at the same position.
            """
            return edits.edit_stops(remove_ids, add_option_ids)

        return [find_options, edit_stops]


QUICK_EDIT_PROMPT = """
QUICK CHANGES TO THE CURRENT PLAN. To swap, add or remove stops, towns, attractions, restaurants or
stays in the current itinerary, use find_options and edit_stops yourself. They are much faster than
anything else you can do, so for these requests:
1. Call find_options (kind "town" for different towns or stops on the route; "attraction",
   "restaurant" or "stay" with stop_id or city for places in one town). Skip this to only remove.
2. Call edit_stops with the ids to remove and the option_ids to add. Pick the options that best fit
   what the traveler asked for; when they did not say, the first options are the best documented.
3. When edit_stops answers "checked", call update_itinerary with NO arguments.
For these requests do NOT delegate to research_places or plan_transport, do NOT call check_budget and
do NOT write the itinerary out: edit_stops already made and checked the draft. Then tell the
traveler in two or three sentences what changed, using only what the tools returned.
Use the specialists and check_budget only for what these tools cannot do: a different road between
the same cities, a new start, destination or dates, or a rebuilt plan.
"""
