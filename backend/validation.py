"""Hard accuracy checks on the itinerary before it reaches the Plan, Map and Budget panels.

The prompt asks the model to be accurate; this makes sure of it. Anything that should have come
from a place tool but didn't is removed or flagged, so the UI never shows an invented website,
map pin or source link as if it were real.
"""

from __future__ import annotations

import math

from evidence import Evidence, KnownPlace
from itinerary import ItinerarySnapshot, Location

# A pin within this distance of a looked-up place counts as that place.
MATCH_RADIUS_M = 150
# ItinerarySnapshot allows at most 12 assumptions.
MAX_ASSUMPTIONS = 12


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


def validate_snapshot(snapshot: ItinerarySnapshot, evidence: Evidence) -> tuple[ItinerarySnapshot, list[str]]:
    """Returns a cleaned copy plus notes on what was changed (shown to the model and the traveler)."""
    items = []
    stripped: list[str] = []
    unverified: list[str] = []
    flight_times_removed = False

    for original in snapshot.items:
        item = original.model_copy(deep=True)
        label = item.location.name if item.location else item.title

        if item.category == "Flights" and item.time is not None:
            # No flight data source exists, so a departure time would always be made up.
            item.time = None
            flight_times_removed = True

        claimed_sources = list(item.sourceUrls)
        item.sourceUrls = [url for url in claimed_sources if url in evidence.places_by_source]
        if item.sourceUrls:
            # Real place: take its facts from the tool result, whatever the model wrote.
            known = evidence.places_by_source[item.sourceUrls[0]]
            address = item.location.address if item.location else None
            item.location = Location(name=item.location.name if item.location else known.name, address=address, lat=known.lat, lng=known.lng)
            item.websiteUrl = known.website_url
        else:
            had_details = bool(claimed_sources or item.websiteUrl)
            item.websiteUrl = None
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

        names_a_business = item.category in ("Food", "Stays") and item.location is not None
        if names_a_business and not item.sourceUrls:
            unverified.append(label)

        items.append(item)

    notes: list[str] = []
    if unverified:
        notes.append("Not found in map data, so check these exist before relying on them: " + ", ".join(f'"{n}"' for n in dict.fromkeys(unverified)) + ".")
    if stripped:
        notes.append("Removed map pins, websites or source links that were not from a map lookup for: " + ", ".join(f'"{n}"' for n in dict.fromkeys(stripped)) + ".")
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
