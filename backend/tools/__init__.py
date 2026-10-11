"""Data tools for the Roam agent.

The lookup code lives in plain modules (tools/places.py). This file exposes it to Strands:
`get_travel_tools()` returns the list to pass to `Agent(tools=...)`, as agreed in TEAM_PLAN.md.

Tool functions return plain dicts and never raise, so the agent always gets something it can
reason about: either results with sources, or a clear "unavailable" message.
"""

from __future__ import annotations

from tools.driving import estimate_drive
from datetime import date

from tools import airports
from tools.places import PlacesUnavailable, geocode, search_places
from tools.weather import fetch_forecast


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
    drive_days splits the drive into days, each ending in a real town on the route: use those
    towns for overnight stops, and each day's google_maps_url as that driving leg's link.

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


def find_airports(near: str) -> dict:
    """Find real passenger airports near a town or city, with airport codes, map pins and source links.

    Use this for both ends of a trip by plane: near the traveler's home and near the destination.
    International airports come first, then nearer ones. Copy the airport's name, code, coordinates
    and source link exactly into the itinerary.

    Args:
        near: The town or city, e.g. "Kansas City, MO" or "Polignano a Mare, Italy".
    """
    try:
        found = airports.find_airports(near)
    except PlacesUnavailable as error:
        return {"status": "unavailable", "message": f"{error} Do not retry now: name the main airport from general knowledge, labeled unverified.", "airports": []}
    if found is None:
        return {"status": "no_results", "message": f'Could not find "{near}".', "airports": []}
    if not found:
        return {"status": "no_results", "message": f'No passenger airports found near "{near}".', "airports": []}
    return {"status": "ok", "source": "OpenStreetMap", "airports": [airport.model_dump(exclude_none=True) for airport in found]}


def flight_links(from_airport: str, to_airport: str, depart_date: str = "", return_date: str = "", travelers: int = 1) -> dict:
    """Links to search and book real flight tickets on Google Flights and Kayak for a route.

    There is no live fare data: give these links so the traveler can see real prices and times.
    Put the Google Flights link as the flight's websiteUrl in the itinerary.

    Args:
        from_airport: Three-letter code of the departure airport, e.g. "JFK".
        to_airport: Three-letter code of the arrival airport, e.g. "BRI".
        depart_date: Outbound date as YYYY-MM-DD, or "" if not known.
        return_date: Return date as YYYY-MM-DD, or "" for one way.
        travelers: Number of travelers flying (1-9).
    """
    try:
        depart = date.fromisoformat(depart_date) if depart_date else None
        return_on = date.fromisoformat(return_date) if return_date else None
        links = airports.flight_search_links(from_airport, to_airport, depart, return_on, travelers)
    except ValueError as error:
        return {"status": "error", "message": f"{error} Dates must be YYYY-MM-DD."}
    return {"status": "ok", **links, "note": "Prices and schedules are on these sites; Roam has no live fare data."}


def get_forecast(near: str, start_date: str = "", end_date: str = "") -> dict:
    """Get live daily weather for a destination before planning outdoor activities or weather-related revisions.

    Forecasts cover at most the next 16 days, in destination local time. Never invent weather
    outside the returned coverage. Cite source_urls and retrieved_at; null values are unknown.
    Temperatures are Celsius, precipitation is mm, and wind is km/h (also returned in units).

    Args:
        near: Destination town or landmark, e.g. "Kansas City, MO" or "Puglia, Italy".
        start_date: First requested day, YYYY-MM-DD. Omit both dates for the next seven days.
        end_date: Last requested day, YYYY-MM-DD, inclusive. Omit for a one-day forecast.
    """
    return fetch_forecast(near, start_date, end_date)


def get_travel_tools() -> list:
    """The tools to hand to the Strands agent: `Agent(tools=get_travel_tools())`."""
    # Imported here so the lookup code and its tests work without Strands installed.
    from strands import tool

    return [tool(find_places), tool(locate), tool(plan_drive), tool(get_forecast), tool(find_airports), tool(flight_links)]
