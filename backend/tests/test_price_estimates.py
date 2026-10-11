"""Rough prices by kind of place, for all travelers. Estimates, never quotes."""

import pytest

from evidence import Evidence
from itinerary import ItinerarySnapshot
from price_estimates import estimate_cost, travelers_count, with_estimates


@pytest.mark.parametrize("text,count", [(None, 1), ("", 1), ("2", 2), ("2 adults, 1 child", 3), ("Just me", 1), ("40", 12)])
def test_travelers_are_counted_from_the_saved_setting(text, count):
    assert travelers_count(text) == count


@pytest.mark.parametrize("category,kind,title,travelers,cost", [
    ("Food", "restaurant", "Anything", 2, 36), ("Food", None, "Main Street Coffee", 1, 12), ("Food", None, "Somewhere", 1, 15),
    ("Stays", "motel", "Anything", 2, 80), ("Stays", "hotel", "Anything", 3, 260), ("Stays", "hostel", "Anything", 3, 105),
    ("Stays", None, "Sunset Motel", 1, 80), ("Stays", None, "Somewhere", 1, 120),
    ("Activities", "museum", "Anything", 2, 30), ("Activities", "viewpoint", "Anything", 4, 0),
    ("Activities", None, "Worlds of Fun Theme Park", 1, 60), ("Activities", None, "Riverfront Park", 2, 0),
    ("Activities", "historic site", "Old Mill", 2, 20), ("Activities", "town", "Town 1", 1, 10),
])
def test_estimates_by_kind_then_title_then_category(category, kind, title, travelers, cost):
    assert estimate_cost(category, kind, title, travelers) == cost


def test_driving_is_never_estimated_here():
    assert estimate_cost("Driving", None, "Drive to St. Louis") is None


def test_only_missing_prices_are_filled_and_the_plan_says_they_are_estimates():
    plan = ItinerarySnapshot.model_validate({"startDate": "2026-10-17", "endDate": "2026-10-17", "budget": {"plannedUsd": None},
        "items": [{"id": "a", "date": "2026-10-17", "title": "City Museum", "category": "Activities", "costUsd": None},
                  {"id": "b", "date": "2026-10-17", "title": "Dinner", "category": "Food", "costUsd": 44},
                  {"id": "c", "date": "2026-10-17", "title": "Drive", "category": "Driving", "costUsd": None}]})
    filled = with_estimates(plan, 2)
    assert [item.costUsd for item in filled.items] == [30, 44, None]
    assert filled.assumptions == ["Stop, meal and stay prices are rough estimates for 2 travelers, not quotes. Check prices before you go."]
    assert with_estimates(filled, 2) == filled
    assert plan.items[0].costUsd is None


def test_a_searched_place_keeps_its_kind_for_pricing_without_becoming_a_pinned_point():
    evidence = Evidence()
    evidence.add_place({"name": "Route 66 Motel", "category": "Stays", "kind": "motel", "lat": 0, "lng": 1,
                        "source_urls": ["https://www.openstreetmap.org/node/motel"]})
    known = evidence.known_source("https://www.openstreetmap.org/node/motel")
    assert known.place_kind == "motel" and known.kind is None
