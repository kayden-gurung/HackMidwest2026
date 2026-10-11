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
    # From Nominatim for `locate` results: "city", "town"... or "attraction", "museum"...
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
class DriveRoute:
    """One day's drive from plan_drive: its line on the map and where it ends."""
    path: list[list[float]]
    end_name: str
    end_lat: float
    end_lng: float


@dataclass
class Evidence:
    places_by_source: dict[str, KnownPlace] = field(default_factory=dict)
    # Towns and landmarks from `locate`: coordinates but no source link.
    points: list[KnownPlace] = field(default_factory=list)
    # Links plan_drive made (route sources, Google Maps directions, per-day directions). Real, but not places with a pin.
    drive_links: set[str] = field(default_factory=set)
    # Each driving day's route, by its directions link, so Driving items can be drawn on the map.
    drive_routes: dict[str, DriveRoute] = field(default_factory=dict)
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
        if item.route and item.websiteUrl and item.location and item.location.lat is not None and item.location.lng is not None:
            evidence.drive_links.add(item.websiteUrl)
            evidence.drive_routes[item.websiteUrl] = DriveRoute(
                path=item.route, end_name=item.location.name, end_lat=item.location.lat, end_lng=item.location.lng)
            continue
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
            for leg in legs:
                if leg.get("path") and leg.get("end_lat") is not None and leg.get("google_maps_url"):
                    evidence.drive_routes[str(leg["google_maps_url"])] = DriveRoute(
                        path=leg["path"], end_name=str(leg["end"]), end_lat=float(leg["end_lat"]), end_lng=float(leg["end_lng"]))
            # The route lines are for the map, not the model: hundreds of numbers would only cost time.
            result = {**result, **{key: [{k: v for k, v in leg.items() if k not in ("path", "end_lat", "end_lng")} for leg in result.get(key, [])]
                                   for key in ("drive_days", "drive_days_home")}}
        return result



    find_places.__doc__ = _FIND_PLACES_DOC
    locate.__doc__ = _LOCATE_DOC
    plan_drive.__doc__ = _PLAN_DRIVE_DOC
    # Weather evidence describes conditions, not a place's identity or booking details.
    return [tool(find_places), tool(locate), tool(plan_drive), tool(travel_tools.get_forecast)]
