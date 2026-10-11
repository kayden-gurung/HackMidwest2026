"""Sourced schedules and explicit one-traveler budgeting allowances for drive stops."""

import re

from evidence import Evidence, KnownPlace
from itinerary import ItinerarySnapshot

# Deliberately accept only USD entry prices with no duration or conditional pricing.
USD_ENTRY = re.compile(r"(\d+(?:\.\d{1,2})?)\s+USD(?:\s*/\s*(?:person|adult|1 person))?", re.IGNORECASE)
ALLOWANCES = {
    "Food": (25, "Planning allowance: $25 for one traveler's meal; not a published menu price."),
    "Activities": (20, "Planning allowance: $20 for one traveler's visit; not a verified USD admission price."),
    "Stays": (150, "Planning allowance: $150 for one room/night; not a published room rate."),
}


def stop_cost(category: str, place: KnownPlace | None):
    if place and category == "Activities" and not (place.conditional_fee or place.conditional_charge):
        if place.fee == "no":
            return 0, "listed", "Free entry according to the source listing; extras are not included."
        match = USD_ENTRY.fullmatch((place.charge or "").strip())
        if match and float(match[1]) <= 1_000_000:
            return float(match[1]), "listed", "Listed entry price for one traveler; confirm current pricing with the venue."
    amount, note = ALLOWANCES[category]
    return amount, "planning", note


def apply_stop_details(snapshot: ItinerarySnapshot, evidence: Evidence) -> ItinerarySnapshot:
    """Fill amounts before budget validation; never interpret missing fees as free entry."""
    result = snapshot.model_copy(deep=True)
    for item in result.items:
        if item.category == "Driving":
            item.openingHours = item.costBasis = item.costNote = None
            continue
        place = next((evidence.known_source(url) for url in item.sourceUrls if evidence.known_source(url)), None)
        item.openingHours = ((place.opening_hours or "")[:2000] or None) if place else None
        accepted = evidence.accepted_items.get(item.id)
        same_place = accepted and accepted.category == item.category and set(accepted.sourceUrls).intersection(item.sourceUrls)
        if same_place and accepted.costUsd is not None:
            item.costUsd, item.costBasis, item.costNote = accepted.costUsd, accepted.costBasis, accepted.costNote
        else:
            item.costUsd, item.costBasis, item.costNote = stop_cost(item.category, place)
        if same_place and accepted.openingHours:
            item.openingHours = accepted.openingHours
    return result
