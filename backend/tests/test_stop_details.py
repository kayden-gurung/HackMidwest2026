"""Price provenance, source schedules and budget/consent use the same stop details."""

import pytest

from evidence import Evidence, KnownPlace, evidence_from_snapshot
from stop_details import apply_stop_details, stop_cost
from tests.test_roadtrip import plan
from tools.places import GeoPoint, _to_place
from validation import validate_snapshot


@pytest.mark.parametrize("tags, amount, basis", [
    ({"fee": "no"}, 0, "listed"),
    ({"fee": "yes", "charge": "20 USD"}, 20, "listed"),
    ({"charge": "12.50 USD/person"}, 12.5, "listed"),
    ({"charge": "30 USD/adult"}, 30, "listed"),
    ({"fee": "yes"}, 20, "planning"),
    ({"fee": "donation"}, 20, "planning"),
    ({"charge": "2 USD/hour"}, 20, "planning"),
    ({"charge": "10 EUR"}, 20, "planning"),
    ({"charge": "10-20 USD"}, 20, "planning"),
    ({"fee": "no", "conditional_fee": "yes @ (Mo-Fr)"}, 20, "planning"),
    ({"charge": "20 USD", "conditional_charge": "10 USD @ (Su)"}, 20, "planning"),
])
def test_entry_prices_require_an_unambiguous_listing(tags, amount, basis):
    place = KnownPlace("Museum", 0, 1, **tags)
    actual, actual_basis, note = stop_cost("Activities", place)
    assert (actual, actual_basis) == (amount, basis)
    assert note


def test_no_entry_fee_does_not_make_meals_or_rooms_free():
    place = KnownPlace("Cafe", 0, 1, fee="no", charge="5 USD")
    assert stop_cost("Food", place)[0:2] == (25, "planning")
    assert stop_cost("Stays", place)[0:2] == (150, "planning")


def test_place_lookup_keeps_fee_and_schedule_tags():
    place = _to_place({"type": "node", "id": 1, "lat": 0, "lon": 1, "tags": {
        "name": "Museum", "tourism": "museum", "opening_hours": "Mo-Su 16:00-20:00",
        "fee": "yes", "charge": "12 USD", "fee:conditional": "no @ (Su)"}},
        "Activities", GeoPoint(name="Town", lat=0, lng=1))
    evidence = Evidence()
    evidence.add_place(place.model_dump())
    known = evidence.known_source(place.source_urls[0])
    assert known.opening_hours == "Mo-Su 16:00-20:00"
    assert known.fee == "yes" and known.charge == "12 USD" and known.conditional_fee == "no @ (Su)"
    assert known.kind == "museum"


def test_unverified_hours_are_removed_and_pinned_place_details_win():
    draft = plan()
    draft.items[0].sourceUrls = []
    draft.items[0].openingHours = "24/7"
    draft.items[0].costUsd = 1
    draft.items[0].costBasis = "listed"
    evidence = Evidence()
    cleaned, _ = validate_snapshot(draft, evidence, enrich=apply_stop_details)
    assert cleaned.items[0].openingHours is None
    assert cleaned.items[0].costUsd == 20 and cleaned.items[0].costBasis == "planning"

    def pin(items, evidence):
        evidence.add_place({"name": "Museum", "category": "Activities", "lat": 0, "lng": 1,
            "source_urls": ["https://www.openstreetmap.org/node/1"], "opening_hours": "Mo-Fr 16:00-20:00", "fee": "no"})
        items[0].sourceUrls = ["https://www.openstreetmap.org/node/1"]
    cleaned, _ = validate_snapshot(draft, evidence, pinner=pin, enrich=apply_stop_details)
    assert cleaned.items[0].openingHours == "Mo-Fr 16:00-20:00"
    assert cleaned.items[0].costUsd == 0 and cleaned.items[0].costBasis == "listed"


def test_accepted_prices_survive_research_and_revisions_without_mutating_original():
    accepted = plan()
    accepted.items[0].costUsd = 18
    accepted.items[0].costBasis = "listed"
    accepted.items[0].costNote = "Listed entry price for one traveler."
    accepted.items[0].openingHours = "Mo-Su 16:00-20:00"
    evidence = evidence_from_snapshot(accepted)
    evidence.add_place({"name": "Town", "category": "Activities", "lat": 0, "lng": 1,
        "source_urls": accepted.items[0].sourceUrls})
    draft = accepted.model_copy(deep=True)
    draft.items[0].costUsd = 999
    updated = apply_stop_details(draft, evidence)
    assert updated.items[0] == accepted.items[0]
    cleaned, _ = validate_snapshot(draft, evidence, enrich=apply_stop_details)
    assert cleaned.items[0] == accepted.items[0]
    assert accepted.items[0].costUsd == 18 and draft.items[0].costUsd == 999


def test_budget_validation_counts_allowances_and_does_not_call_them_quotes():
    draft = plan()
    draft.budget.plannedUsd = 10
    cleaned, notes = validate_snapshot(draft, evidence_from_snapshot(draft), enrich=apply_stop_details)
    assert cleaned.items[0].costUsd == 20
    assert any("over the $10 budget" in note for note in notes)
    assert "Planning allowance" in cleaned.items[0].costNote


def test_generic_model_cannot_label_its_own_estimate_as_listed_price():
    draft = plan()
    draft.items[0].costUsd = 99
    draft.items[0].costBasis = "listed"
    draft.items[0].costNote = "Published ticket price"
    evidence = Evidence()
    evidence.add_place({"name": "Town", "category": "Activities", "lat": 0, "lng": 1,
        "source_urls": draft.items[0].sourceUrls, "opening_hours": "Mo-Fr 16:00-20:00"})
    cleaned, _ = validate_snapshot(draft, evidence)
    assert cleaned.items[0].costUsd == 99
    assert cleaned.items[0].costBasis is None and cleaned.items[0].costNote is None
    assert cleaned.items[0].openingHours == "Mo-Fr 16:00-20:00"
