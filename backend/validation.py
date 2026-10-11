"""Hard accuracy checks on the itinerary before it reaches the Plan, Map and Budget panels.

The prompt asks the model to be accurate; this makes sure of it. Anything that should have come
from a place tool but didn't is removed or flagged, so the UI never shows an invented website,
map pin or source link as if it were real.
"""

from __future__ import annotations

import math
import re

from evidence import Evidence, KnownPlace
from itinerary import ItinerarySnapshot, Location

# A pin within this distance of a looked-up place counts as that place.
MATCH_RADIUS_M = 150
# ItinerarySnapshot allows at most 12 assumptions.
MAX_ASSUMPTIONS = 12
# In car mode, a stop whose title looks like air travel is a flight even if the model filed it under another category.
AIR_TRAVEL = re.compile(
    r"\b(flights?|airlines?|airfare|layovers?|boarding pass)\b"
    r"|\b(fly|flying|flies)\s+(to|into|from|out|home|back)\b"
    r"|\b(by|take a|catch a)\s+plane\b|\bplane\s+(ticket|to|from)\b",
    re.IGNORECASE,
)
# Airport codes like "MCI → DEN". Case-sensitive, so "Bus to Zoo" doesn't count.
AIRPORT_ROUTE = re.compile(r"\b[A-Z]{3}\s*(→|->|to)\s*[A-Z]{3}\b")


def is_air_travel(title: str, category: str) -> bool:
    return category == "Flights" or bool(AIR_TRAVEL.search(title) or AIRPORT_ROUTE.search(title))


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _nearest(evidence: Evidence, lat: float, lng: float) -> KnownPlace | None:
    best, best_d = None, MATCH_RADIUS_M
    for place in evidence.all_places():
        d = _distance_m(lat, lng, place.lat, place.lng)
        if d <= best_d:
            best, best_d = place, d
    return best


def _key(text: str | None) -> str:
    return " ".join((text or "").lower().replace(",", " ").split())


def _fix_shared_pins(items: list, evidence: Evidence) -> list[str]:
    """Several different stops on one pin that no find_places result backs up means the model
    reused a town's coordinates (from `locate`) as a stand-in. Those pins all land on the town
    center, so remove them. Returns the labels of the stops that lost their pin."""
    place_urls = evidence.places_by_source
    loose = [i for i in items if i.location and i.location.lat is not None and not any(u in place_urls for u in i.sourceUrls)]
    groups: list[list] = []
    for item in loose:
        for group in groups:
            first = group[0].location
            if _distance_m(item.location.lat, item.location.lng, first.lat, first.lng) <= MATCH_RADIUS_M:
                group.append(item)
                break
        else:
            groups.append([item])

    cleared: list[str] = []
    for group in groups:
        if len(group) < 2 or len({(_key(i.location.name), _key(i.title)) for i in group}) < 2:
            continue
        names = {_key(i.location.name) for i in group}
        towns = {_key(point.name) for point in evidence.points} | {_key(point.name.split(",")[0]) for point in evidence.points}
        for item in group:
            cleared.append(item.location.name or item.title)
            if len(names) == 1 or _key(item.location.name) in towns:
                # The "location" is just the town ("Kansas City"): there is no specific place to show.
                item.location = None
                item.websiteUrl = None
            else:
                item.location = item.location.model_copy(update={"lat": None, "lng": None})
    return cleared


def _add_town_context(items: list, evidence: Evidence) -> None:
    """A stop with only a name (no address, no pin) searches Google Maps for that name anywhere.
    When the trip has one looked-up town, add it so the search lands in the right town."""
    towns = {_key(point.name): point.name for point in evidence.points}
    if len(towns) != 1:
        return
    town = next(iter(towns.values()))[:400]
    for item in items:
        location = item.location
        if location and location.lat is None and not location.address and _key(location.name) not in _key(town):
            item.location = location.model_copy(update={"address": town})


def validate_snapshot(snapshot: ItinerarySnapshot, evidence: Evidence, car_mode: bool = False, pinner=None) -> tuple[ItinerarySnapshot, list[str]]:
    """Returns a cleaned copy plus notes on what was changed (shown to the model and the traveler).

    In car mode every flight is removed, whatever the model sent. `pinner` (pins.pin_stops) may
    look up stops that have a name but no pin, after the stand-in pins are removed.
    """
    items = []
    removed_flights: list[str] = []
    stripped: list[str] = []
    unverified: list[str] = []
    flight_times_removed = False

    for original in snapshot.items:
        item = original.model_copy(deep=True)
        label = item.location.name if item.location else item.title

        if car_mode and is_air_travel(item.title, item.category):
            removed_flights.append(item.title)
            continue

        if item.category == "Flights" and item.time is not None:
            # No flight data source exists, so a departure time would always be made up.
            item.time = None
            flight_times_removed = True

        claimed_sources = list(item.sourceUrls)
        # Links plan_drive returned (route sources, Google Maps directions) are real too, but have no pin.
        drive_sources = [url for url in claimed_sources if url in evidence.drive_links]
        item.sourceUrls = [url for url in claimed_sources if url in evidence.places_by_source]
        if item.sourceUrls:
            # Real place: take its facts from the tool result, whatever the model wrote.
            known = evidence.places_by_source[item.sourceUrls[0]]
            address = known.address or (item.location.address if item.location else None)
            item.location = Location(name=item.location.name if item.location else known.name, address=address, lat=known.lat, lng=known.lng)
            item.websiteUrl = known.website_url
        else:
            had_details = len(drive_sources) < len(claimed_sources) or (item.websiteUrl is not None and item.websiteUrl not in evidence.drive_links)
            item.websiteUrl = item.websiteUrl if item.websiteUrl in evidence.drive_links else None
            if item.location and item.location.lat is not None and item.location.lng is not None:
                match = _nearest(evidence, item.location.lat, item.location.lng)
                if match is None:
                    item.location = item.location.model_copy(update={"lat": None, "lng": None})
                    had_details = True
                else:
                    item.location = item.location.model_copy(update={"lat": match.lat, "lng": match.lng})
                    item.sourceUrls = list(match.source_urls)
                    item.websiteUrl = match.website_url
            if had_details and not item.sourceUrls:
                stripped.append(label)
            if not item.sourceUrls:
                item.sourceUrls = drive_sources

        names_a_business = item.category in ("Food", "Stays") and item.location is not None
        if names_a_business and not item.sourceUrls:
            unverified.append(label)

        items.append(item)

    shared_pins = _fix_shared_pins(items, evidence)
    _add_town_context(items, evidence)
    if pinner is not None:
        pinner(items, evidence)
    # Only mention stops that are still off the map.
    still_unpinned = {i.location.name for i in items if i.location and i.location.lat is None} | {i.title for i in items if i.location is None}
    shared_pins = [name for name in shared_pins if name in still_unpinned]
    unverified = [name for name in unverified if any((i.location.name if i.location else i.title) == name and not i.sourceUrls for i in items)]

    notes: list[str] = []
    if removed_flights:
        notes.append("Car mode is on, so flights were removed: " + ", ".join(f'"{t}"' for t in dict.fromkeys(removed_flights)) + ". Plan the whole trip by car.")
    if unverified:
        notes.append("Not found in map data, so check these exist before relying on them: " + ", ".join(f'"{n}"' for n in dict.fromkeys(unverified)) + ".")
    if stripped:
        notes.append("Removed map pins, websites or source links that were not from a map lookup for: " + ", ".join(f'"{n}"' for n in dict.fromkeys(stripped)) + ".")
    if shared_pins:
        notes.append("Several stops shared one generic map pin (the town center), so those pins were removed: " + ", ".join(f'"{n}"' for n in dict.fromkeys(shared_pins)) + ". Look each place up with find_places to place it on the map.")
    if any(item.category == "Flights" for item in items):
        notes.append("Flight costs are rough estimates. Roam has no live fare or schedule data, so check airlines for real prices" + (" and times." if flight_times_removed else "."))
    total = sum(item.costUsd or 0 for item in items)
    planned = snapshot.budget.plannedUsd
    if planned is not None and total > planned:
        notes.append(f"This plan is estimated at ${total:,.0f}, which is over the ${planned:,.0f} budget.")

    assumptions = list(dict.fromkeys([*notes, *snapshot.assumptions]))[:MAX_ASSUMPTIONS]
    cleaned = snapshot.model_copy(update={"items": items, "assumptions": assumptions})
    # Re-validate so the response always matches the schema the frontend expects.
    return ItinerarySnapshot.model_validate(cleaned.model_dump()), notes
