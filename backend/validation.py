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
# The start of every note this file writes (see the end of validate_snapshot).
OWN_NOTE_PREFIXES = (
    "Roam plans drives only, so flights were removed",
    "Not found in map data",
    "Removed map pins",
    "Several stops shared one generic map pin",
    "This plan is estimated at",
    "Trip type ",
)
# ItinerarySnapshot allows at most 12 assumptions.
MAX_ASSUMPTIONS = 12
# Roam plans drives only: a stop whose title looks like air travel is removed, whatever its category.
AIR_TRAVEL = re.compile(
    r"\b(flights?|airlines?|airfare|layovers?|boarding pass)\b"
    r"|\b(fly|flying|flies)\s+(to|into|from|out|home|back)\b"
    r"|\b(by|take a|catch a)\s+plane\b|\bplane\s+(ticket|to|from)\b",
    re.IGNORECASE,
)
# Airport codes like "MCI → DEN". Case-sensitive, so "Bus to Zoo" doesn't count.
AIRPORT_ROUTE = re.compile(r"\b[A-Z]{3}\s*(→|->|to)\s*[A-Z]{3}\b")


def is_air_travel(title: str, category: str) -> bool:
    return bool(AIR_TRAVEL.search(title) or AIRPORT_ROUTE.search(title))


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
        names = {_key(i.location.name) for i in group}
        towns = {_key(t.name) for t in evidence.towns()} | {_key(t.name.split(",")[0]) for t in evidence.towns()}
        # Several stops at one real place ("Museum tour", "Museum cafe") are fine. Different places
        # on one pin, or stops whose "place" is just the town, mean a stand-in pin.
        if len(group) < 2 or (len(names) == 1 and not names & towns):
            continue
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
    towns = {_key(point.name): point.name for point in evidence.towns()}
    if len(towns) != 1:
        return
    town = next(iter(towns.values()))[:400]
    for item in items:
        location = item.location
        if location and location.lat is None and not location.address and _key(location.name) not in _key(town):
            item.location = location.model_copy(update={"address": town})


# Words that show a stop fits a trip type, for the types that can be checked from the plan itself.
_BEACH = re.compile(r"\b(beach|coast|coastal|shore|seaside|waterfront|ocean|sea|bay|harbou?r|pier|boardwalk|lake|island|cove|surf|snorkel)", re.IGNORECASE)
_ADVENTURE = re.compile(r"\b(hik|trail|kayak|canoe|raft|climb|bike|biking|cycl|zip|outdoor|canyon|mountain|summit|peak|falls|waterfall|park|paddle|surf|snorkel|dive|diving|ski|camp)", re.IGNORECASE)
# "Rest & reset" means at most this many activities on any day.
REST_MAX_ACTIVITIES = 2


def trip_type_notes(items: list, trip_types: list[str]) -> list[str]:
    """Where the plan doesn't match the trip types the traveler chose. Told to the model so it fixes the plan."""
    notes = []
    days = sorted({i.date for i in items})
    text = lambda i: " ".join(filter(None, [i.title, i.description, i.location.name if i.location else None]))  # noqa: E731
    if "Food first" in trip_types:
        missing = [d for d in days if not any(i.date == d and i.category == "Food" for i in items)]
        if missing:
            notes.append(f"Trip type \"Food first\": no food stop on {', '.join(f'{d:%b} {d.day}' for d in missing)}.")
    if "Rest & reset" in trip_types:
        busy = [d for d in days if sum(i.date == d and i.category == "Activities" for i in items) > REST_MAX_ACTIVITIES]
        if busy:
            notes.append(f"Trip type \"Rest & reset\": more than {REST_MAX_ACTIVITIES} activities on {', '.join(f'{d:%b} {d.day}' for d in busy)}.")
    if "Beach & coast" in trip_types and items and not any(_BEACH.search(text(i)) for i in items):
        notes.append("Trip type \"Beach & coast\": no beach or waterfront stop in the plan.")
    if "Big adventure" in trip_types and items and not any(_ADVENTURE.search(text(i)) for i in items):
        notes.append("Trip type \"Big adventure\": no outdoor or adventure activity in the plan.")
    return notes


def _attach_routes(items: list, route_links: dict[str, str], evidence: Evidence) -> None:
    """Give each driving leg its route line and a pin where that day's drive ends."""
    for item in items:
        link = route_links.get(item.id)
        if link is None:
            continue
        route = evidence.drive_routes[link]
        item.route = route.path
        item.websiteUrl = link
        item.location = Location(name=route.end_name, lat=route.end_lat, lng=route.end_lng)


def validate_snapshot(snapshot: ItinerarySnapshot, evidence: Evidence, car_mode: bool = False, pinner=None, trip_types: list[str] | None = None, enrich=None) -> tuple[ItinerarySnapshot, list[str]]:
    """Returns a cleaned copy plus notes on what was changed (shown to the model and the traveler).

    Roam plans drives only: every flight is removed, whatever the model sent. `pinner` (pins.pin_stops) may
    look up stops that have a name but no pin, after the stand-in pins are removed.
    """
    items = []
    removed_flights: list[str] = []
    stripped: list[str] = []
    unverified: list[str] = []

    # Driving legs whose directions link came from plan_drive get that leg's route (see _attach_routes).
    route_links: dict[str, str] = {}
    for original in snapshot.items:
        item = original.model_copy(deep=True)
        label = item.location.name if item.location else item.title
        if item.category == "Driving" and item.websiteUrl in evidence.drive_routes:
            route_links[item.id] = item.websiteUrl
        # Routes only ever come from plan_drive, never from the model.
        item.route = None

        if car_mode and is_air_travel(item.title, item.category):
            removed_flights.append(item.title)
            continue

        claimed_sources = list(item.sourceUrls)
        # Links plan_drive returned (route sources, Google Maps directions) are real too, but have no pin.
        drive_sources = [url for url in claimed_sources if url in evidence.drive_links]
        item.sourceUrls = [url for url in claimed_sources if evidence.known_source(url)]
        if item.sourceUrls:
            # Real place: take its facts from the tool result, whatever the model wrote.
            known = evidence.known_source(item.sourceUrls[0])
            address = known.address or (item.location.address if item.location else None)
            item.location = Location(name=item.location.name if item.location else known.name, address=address, lat=known.lat, lng=known.lng)
            # A link a tool made for this stop (a drive's directions) beats the place's own website.
            item.websiteUrl = item.websiteUrl if item.websiteUrl in evidence.drive_links else known.website_url
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
    _attach_routes(items, route_links, evidence)
    for item in items:
        # Schedules must come from the exact sourced place, including places pinned above.
        known = next((evidence.known_source(url) for url in item.sourceUrls if evidence.known_source(url)), None)
        item.openingHours = ((known.opening_hours or "")[:2000] or None) if known and item.category != "Driving" else None
        # Models may estimate a generic trip, but cannot label that estimate a published price.
        accepted = evidence.accepted_items.get(item.id)
        item.costBasis = item.costNote = None
        if accepted and accepted.category == item.category and accepted.costUsd == item.costUsd and set(accepted.sourceUrls).intersection(item.sourceUrls):
            item.costBasis, item.costNote = accepted.costBasis, accepted.costNote
    if enrich:
        items = enrich(snapshot.model_copy(update={"items": items}), evidence).items
    # Only mention stops that are still off the map.
    still_unpinned = {i.location.name for i in items if i.location and i.location.lat is None} | {i.title for i in items if i.location is None}
    shared_pins = [name for name in shared_pins if name in still_unpinned]
    unverified = [name for name in unverified if any((i.location.name if i.location else i.title) == name and not i.sourceUrls for i in items)]

    notes: list[str] = []
    if removed_flights:
        notes.append("Roam plans drives only, so flights were removed: " + ", ".join(f'"{t}"' for t in dict.fromkeys(removed_flights)) + ". Plan the whole trip by car.")
    if unverified:
        notes.append("Not found in map data, so check these exist before relying on them: " + ", ".join(f'"{n}"' for n in dict.fromkeys(unverified)) + ".")
    if stripped:
        notes.append("Removed map pins, websites or source links that were not from a map lookup for: " + ", ".join(f'"{n}"' for n in dict.fromkeys(stripped)) + ".")
    if shared_pins:
        notes.append("Several stops shared one generic map pin (the town center), so those pins were removed: " + ", ".join(f'"{n}"' for n in dict.fromkeys(shared_pins)) + ". Look each place up with find_places to place it on the map.")
    notes.extend(trip_type_notes(items, trip_types or []))
    total = sum(item.costUsd or 0 for item in items)
    planned = snapshot.budget.plannedUsd
    if planned is not None and total > planned:
        notes.append(f"This plan is estimated at ${total:,.0f}, which is over the ${planned:,.0f} budget.")

    # Our notes from an earlier version of the plan come back with every revision; drop them and
    # add this version's, so a fixed problem stops being mentioned and nothing is listed twice.
    model_notes = [a for a in snapshot.assumptions if not a.startswith(OWN_NOTE_PREFIXES)]
    assumptions = list(dict.fromkeys([*notes, *model_notes]))[:MAX_ASSUMPTIONS]
    cleaned = snapshot.model_copy(update={"items": items, "assumptions": assumptions})
    # Re-validate so the response always matches the schema the frontend expects.
    return ItinerarySnapshot.model_validate(cleaned.model_dump()), notes
