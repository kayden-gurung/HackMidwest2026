"""Rough planning prices for stops, meals and stays, so no item is left as "Cost TBD".

The map data (OpenStreetMap) has no prices, so these are typical US figures by kind of place.
They are planning estimates, never quotes: every plan that uses them says so in its assumptions.
"""

import math
import re

# Per person.
MEAL_USD = {"restaurant": 18, "cafe": 12, "fast_food": 10, "bar": 15, "pub": 15, "biergarten": 15,
            "ice_cream": 6, "food_court": 12, "marketplace": 12}
DEFAULT_MEAL_USD = 15

# Per room (or pitch) per night; a hostel is per bed.
STAY_USD = {"hotel": 130, "motel": 80, "guest_house": 110, "apartment": 140, "chalet": 160, "camp_site": 30}
HOSTEL_BED_USD = 35
DEFAULT_STAY_USD = 120

# Per person. Zero means usually free to visit.
ACTIVITY_USD = {"museum": 15, "gallery": 10, "zoo": 22, "aquarium": 28, "theme_park": 60, "water_park": 35,
                "beach_resort": 20, "attraction": 12, "castle": 12, "fort": 10, "manor": 12, "ship": 12,
                "viewpoint": 0, "park": 0, "nature_reserve": 0, "garden": 0, "beach": 0,
                "memorial": 0, "monument": 0, "wayside_cross": 0, "wayside_shrine": 0, "boundary_stone": 0,
                "milestone": 0, "ruins": 0, "archaeological_site": 0, "battlefield": 0, "cemetery": 0}
DEFAULT_ACTIVITY_USD = 10

# When the kind of place is not known (a stop the model wrote, or an older plan), the title is the hint.
# Order matters: "theme park" must be tried before "park".
TITLE_HINTS = {
    "Food": [(r"coffee|caf[eé]|bakery|donut|doughnut|tea ?room", "cafe"), (r"ice cream|gelato|frozen custard|creamery", "ice_cream"),
             (r"\bbar\b|pub\b|brewery|brewing|tavern|taproom|saloon", "bar"),
             (r"drive.?in|burger|taco|pizza|sub\b|fast food", "fast_food"), (r"market", "marketplace")],
    "Stays": [(r"hostel", "hostel"), (r"motel|motor (inn|lodge)", "motel"), (r"camp|rv park|koa\b", "camp_site"),
              (r"b&b|bed (and|&) breakfast|guest ?house|\binn\b|lodge", "guest_house"), (r"cabin|chalet", "chalet"),
              (r"hotel|suites|resort", "hotel")],
    "Activities": [(r"theme park|amusement", "theme_park"), (r"water ?park", "water_park"), (r"aquarium", "aquarium"),
                   (r"\bzoo\b|safari", "zoo"), (r"museum|hall of fame", "museum"), (r"gallery", "gallery"),
                   (r"memorial|monument|marker|statue|mural|cemetery|battlefield|bridge|courthouse", "memorial"),
                   (r"overlook|viewpoint|scenic|lookout|vista", "viewpoint"),
                   (r"park|trail|garden|arboretum|preserve|refuge|conservation|lake|falls|beach|forest", "park")],
}

ESTIMATE_NOTE = "Stop, meal and stay prices are rough estimates"


def travelers_count(text: str | None) -> int:
    """"2 adults, 1 child" -> 3. One traveler when nothing usable is given."""
    numbers = [int(number) for number in re.findall(r"\d+", text or "")]
    return min(max(sum(numbers), 1), 12)


def _kind_from_title(category: str, title: str) -> str | None:
    lowered = title.lower()
    return next((kind for pattern, kind in TITLE_HINTS.get(category, []) if re.search(pattern, lowered)), None)


def estimate_cost(category: str, kind: str | None = None, title: str = "", travelers: int = 1) -> float | None:
    """A rough total in USD for all travelers. None for driving: fuel is measured from the route."""
    travelers = max(travelers, 1)
    kind = (kind or "").lower().replace(" ", "_")
    if category == "Food":
        per_person = MEAL_USD.get(kind) or MEAL_USD.get(_kind_from_title(category, title) or "", DEFAULT_MEAL_USD)
        return float(per_person * travelers)
    if category == "Stays":
        if kind not in STAY_USD and kind != "hostel":
            kind = _kind_from_title(category, title) or ""
        if kind == "hostel":
            return float(HOSTEL_BED_USD * travelers)
        # Two travelers to a room.
        return float(STAY_USD.get(kind, DEFAULT_STAY_USD) * math.ceil(travelers / 2))
    if category == "Activities":
        if kind not in ACTIVITY_USD:
            kind = _kind_from_title(category, title) or ""
        return float(ACTIVITY_USD.get(kind, DEFAULT_ACTIVITY_USD) * travelers)
    return None


def with_estimates(plan, travelers: int = 1):
    """The plan with every missing stop, meal and stay price filled in. Prices already set are kept."""
    missing = [item for item in plan.items if item.costUsd is None and item.category != "Driving"]
    if not missing:
        return plan
    items = [item.model_copy(update={"costUsd": estimate_cost(item.category, None, item.title, travelers)})
             if item.costUsd is None and item.category != "Driving" else item for item in plan.items]
    return plan.model_copy(update={"items": items, "assumptions": estimate_assumptions(plan.assumptions, travelers)})


def estimate_assumptions(assumptions: list[str], travelers: int = 1) -> list[str]:
    """Say once that the prices are estimates. The list is capped at 12 lines by the plan schema."""
    if any(line.startswith(ESTIMATE_NOTE) for line in assumptions) or len(assumptions) >= 12:
        return list(assumptions)
    party = "1 traveler" if travelers == 1 else f"{travelers} travelers"
    return [*assumptions, f"{ESTIMATE_NOTE} for {party}, not quotes. Check prices before you go."]
