"""What the place tools actually returned during one chat request.

`recording_tools(evidence)` gives the agent the normal find_places / locate tools, wrapped so
every result is written down. validation.py then trusts only what is written down here.
One Evidence per request, so travelers never see each other's data.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from strands import tool

import tools as travel_tools
import tools.places as map_data
from itinerary import ItinerarySnapshot

# The model reads these docstrings to decide how to call the tools, so reuse the originals word for word.
_FIND_PLACES_DOC = travel_tools.find_places.__doc__
_LOCATE_DOC = travel_tools.locate.__doc__
# plan_drive's own docstring minus the max_miles_per_day argument, which the wrapper fills in from car mode.
_PLAN_DRIVE_DOC = "\n".join(
    line for line in (travel_tools.plan_drive.__doc__ or "").splitlines() if "max_miles_per_day" not in line
)


@dataclass
class KnownPlace:
    name: str
    lat: float
    lng: float
    website_url: str | None = None
    source_urls: list[str] = field(default_factory=list)
    address: str | None = None
    # From Nominatim for `locate` results: "city", "town"... or "attraction", "aerodrome"...
    kind: str | None = None

    @property
    def is_area(self) -> bool:
        """A town, district or region rather than one specific place."""
        return self.kind is None or self.kind in AREA_KINDS


# Nominatim address types that mean "an area", not a single place you can pin.
AREA_KINDS = {
    "city", "town", "village", "hamlet", "municipality", "county", "state", "region", "country",
    "suburb", "neighbourhood", "quarter", "borough", "city_district", "district", "administrative", "postcode",
}


@dataclass
class Evidence:
    places_by_source: dict[str, KnownPlace] = field(default_factory=dict)
    # Towns and landmarks from `locate`: coordinates but no source link.
    points: list[KnownPlace] = field(default_factory=list)
    # Links the tools made: plan_drive (route sources, Google Maps directions, per-day directions)
    # and flight_links (Google Flights and Kayak searches). Real, but not places with a pin.
    drive_links: set[str] = field(default_factory=set)
    # Landmarks and towns from `locate` that came with an OpenStreetMap link, by that link.
    # Kept apart from places_by_source: a town's link must not make town-center pins look verified.
    located_by_source: dict[str, KnownPlace] = field(default_factory=dict)
    # Areas searched with find_places ("near"). Used only to know which town the trip is in.
    areas: list[KnownPlace] = field(default_factory=list)

    def add_place(self, place: dict) -> None:
        try:
            known = KnownPlace(
                name=str(place["name"]),
                lat=float(place["lat"]),
                lng=float(place["lng"]),
                website_url=place.get("website_url"),
                source_urls=[str(url) for url in place.get("source_urls", [])],
                address=place.get("address"),
            )
        except (KeyError, TypeError, ValueError):
            return
        for url in known.source_urls:
            self.places_by_source[url] = known

    def add_point(self, point: dict) -> None:
        try:
            known = KnownPlace(name=str(point["name"]), lat=float(point["lat"]), lng=float(point["lng"]), kind=point.get("kind"))
        except (KeyError, TypeError, ValueError):
            return
        self.points.append(known)
        if point.get("source_url"):
            # "Nelson-Atkins Museum of Art, 4525, Oak Street, ..." -> the part after the name is the address.
            name, _, address = known.name.partition(", ")
            self.located_by_source[str(point["source_url"])] = KnownPlace(
                name=name, lat=known.lat, lng=known.lng, source_urls=[str(point["source_url"])], address=address or None
            )

    def towns(self) -> list[KnownPlace]:
        """Towns and areas the trip is in: located areas first, then areas searched with find_places."""
        return [p for p in self.points if p.is_area] + [a for a in self.areas if a.is_area]

    def known_source(self, url: str) -> KnownPlace | None:
        """The place behind a source link any tool returned in this request, if any."""
        return self.places_by_source.get(url) or self.located_by_source.get(url)

    def places(self) -> list[KnownPlace]:
        """Specific places from find_places (each has a source link)."""
        return list({id(place): place for place in self.places_by_source.values()}.values())

    def all_places(self) -> list[KnownPlace]:
        return [*self.places(), *self.points]


def evidence_from_snapshot(snapshot: ItinerarySnapshot | None) -> Evidence:
    """Stops in the current plan were checked when that plan was made, so a revision may keep them."""
    evidence = Evidence()
    for item in snapshot.items if snapshot else []:
        if item.sourceUrls and item.location and item.location.lat is not None and item.location.lng is not None:
            evidence.add_place({
                "name": item.location.name,
                "lat": item.location.lat,
                "lng": item.location.lng,
                "website_url": item.websiteUrl,
                "source_urls": item.sourceUrls,
                "address": item.location.address,
            })
    return evidence


def recording_tools(evidence: Evidence, max_miles_per_day: int | None = None) -> list:
    """find_places, locate and plan_drive, recording every result into `evidence`.

    `max_miles_per_day` is the traveler's car-mode limit; plan_drive splits the drive with it.
    """

    def find_places(near: str, category: str, keyword: str = "", radius_m: int = 3000, limit: int = 8) -> dict:
        result = travel_tools.find_places(near, category, keyword, radius_m, limit)
        for place in result.get("places", []):
            evidence.add_place(place)
        if result.get("status") == "ok":
            # The search already looked `near` up, so this is a cache hit: it tells pins.py the trip's town.
            try:
                area = map_data.geocode(near)
            except map_data.PlacesUnavailable:
                area = None
            if area is not None:
                evidence.areas.append(KnownPlace(name=area.name, lat=area.lat, lng=area.lng, kind=area.kind))
        return result

    def locate(place: str) -> dict:
        result = travel_tools.locate(place)
        if result.get("status") == "ok":
            evidence.add_point(result)
        return result

    def plan_drive(origin: str, destination: str, round_trip: bool = True) -> dict:
        result = travel_tools.plan_drive(origin, destination, round_trip, max_miles_per_day or 0)
        if result.get("status") == "ok":
            evidence.drive_links.update(str(url) for url in result.get("source_urls", []))
            if result.get("google_maps_url"):
                evidence.drive_links.add(str(result["google_maps_url"]))
            # Each day's directions link is real too, so driving legs may keep it.
            legs = [*result.get("drive_days", []), *result.get("drive_days_home", [])]
            evidence.drive_links.update(str(leg["google_maps_url"]) for leg in legs if leg.get("google_maps_url"))
        return result

    def find_airports(near: str) -> dict:
        result = travel_tools.find_airports(near)
        # Airports are real, pinned places: flights may use them as their location.
        for airport in result.get("airports", []):
            evidence.add_place(airport)
        return result

    def flight_links(from_airport: str, to_airport: str, depart_date: str = "", return_date: str = "", travelers: int = 1) -> dict:
        result = travel_tools.flight_links(from_airport, to_airport, depart_date, return_date, travelers)
        # Kept with the other tool-made links, so a flight may keep its ticket search link.
        evidence.drive_links.update(str(result[key]) for key in ("google_flights_url", "kayak_url") if result.get(key))
        return result

    find_places.__doc__ = _FIND_PLACES_DOC
    locate.__doc__ = _LOCATE_DOC
    plan_drive.__doc__ = _PLAN_DRIVE_DOC
    find_airports.__doc__ = travel_tools.find_airports.__doc__
    flight_links.__doc__ = travel_tools.flight_links.__doc__
    # Weather evidence describes conditions, not a place's identity or booking details.
    return [tool(find_places), tool(locate), tool(plan_drive), tool(travel_tools.get_forecast), tool(find_airports), tool(flight_links)]
