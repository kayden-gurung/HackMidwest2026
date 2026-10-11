"""Data tools for the Roam agent.

The lookup code lives in plain modules (tools/places.py). This file exposes it to Strands:
`get_travel_tools()` returns the list to pass to `Agent(tools=...)`, as agreed in TEAM_PLAN.md.

Tool functions return plain dicts and never raise, so the agent always gets something it can
reason about: either results with sources, or a clear "unavailable" message.
"""

from __future__ import annotations

from tools.driving import estimate_drive
from tools.places import PlacesUnavailable, geocode, search_places


def find_places(near: str, category: str, keyword: str = "", radius_m: int = 3000, limit: int = 8) -> dict:
    """Find real restaurants, places to stay, or things to do around a location, with coordinates and source links.

    Use this before recommending any specific place, so recommendations are real and can be shown on the map.
    Results come from OpenStreetMap. They include no prices, ratings or availability: never invent those.

    Args:
        near: The town, neighbourhood or landmark to search around, e.g. "Polignano a Mare, Italy".
        category: Exactly one of "Food", "Stays" or "Activities".
        keyword: Optional word to narrow the results by name or cuisine, e.g. "seafood", "museum", "beach".
        radius_m: Search radius in metres. Use about 1500 for walking distance and up to 20000 for a region.
        limit: How many places to return, at most 25.
    """
    if category not in ("Food", "Stays", "Activities"):
        return {"status": "error", "message": 'category must be "Food", "Stays" or "Activities".', "places": []}
    try:
        places = search_places(near, category, keyword or None, radius_m, limit)  # type: ignore[arg-type]
    except PlacesUnavailable as error:
        return {"status": "unavailable", "message": str(error), "places": []}
    if not places:
        return {"status": "no_results", "message": f'No {category} places found near "{near}". Try a larger radius or a different keyword.', "places": []}
    return {"status": "ok", "source": "OpenStreetMap", "places": [place.model_dump(exclude_none=True) for place in places]}


def locate(place: str) -> dict:
    """Look up the coordinates of a town, address or landmark.

    Args:
        place: The place to look up, e.g. "Alberobello, Italy" or "Bari Airport".
    """
    try:
        point = geocode(place)
    except PlacesUnavailable as error:
        return {"status": "unavailable", "message": str(error)}
    if point is None:
        return {"status": "no_results", "message": f'Could not find "{place}".'}
    return {"status": "ok", "source": "OpenStreetMap", **point.model_dump()}


def plan_drive(origin: str, destination: str, round_trip: bool = True, max_miles_per_day: int = 0) -> dict:
    """Get the real road distance, driving time and estimated fuel cost between two places.

    Use this for any road trip, and whenever the traveler's budget looks too small for flights:
    compare the fuel cost here with what flights for the whole party would cost, and plan the
    cheaper option that still fits the trip. Fuel cost is for one car, not per person.
    The fuel figure is an estimate: always show the listed assumptions with it.

    Args:
        origin: Where the drive starts, e.g. "Kansas City, MO".
        destination: Where the drive ends, e.g. "Denver, CO".
        round_trip: True to cost the drive there and back, False for one way.
        max_miles_per_day: The traveler's limit on miles of driving per day, or 0 for none.
    """
    try:
        estimate = estimate_drive(origin, destination, round_trip, max_miles_per_day or None)
    except PlacesUnavailable as error:
        return {"status": "unavailable", "message": str(error)}
    if estimate is None:
        return {"status": "no_route", "message": f'No driving route found from "{origin}" to "{destination}". One of the places may be unknown, or there is no road between them.'}
    return {"status": "ok", "source": "OpenStreetMap and OSRM", **estimate.model_dump()}


def get_travel_tools() -> list:
    """The tools to hand to the Strands agent: `Agent(tools=get_travel_tools())`."""
    # Imported here so the lookup code and its tests work without Strands installed.
    from strands import tool

    return [tool(find_places), tool(locate), tool(plan_drive)]
