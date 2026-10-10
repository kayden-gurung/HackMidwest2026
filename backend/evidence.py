"""What the place tools actually returned during one chat request.

`recording_tools(evidence)` gives the agent the normal find_places / locate tools, wrapped so
every result is written down. validation.py then trusts only what is written down here.
One Evidence per request, so travelers never see each other's data.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from strands import tool

import tools as travel_tools
from itinerary import ItinerarySnapshot

# The model reads these docstrings to decide how to call the tools, so reuse the originals word for word.
_FIND_PLACES_DOC = travel_tools.find_places.__doc__
_LOCATE_DOC = travel_tools.locate.__doc__


@dataclass
class KnownPlace:
    name: str
    lat: float
    lng: float
    website_url: str | None = None
    source_urls: list[str] = field(default_factory=list)


@dataclass
class Evidence:
    places_by_source: dict[str, KnownPlace] = field(default_factory=dict)
    # Towns and landmarks from `locate`: coordinates but no source link.
    points: list[KnownPlace] = field(default_factory=list)

    def add_place(self, place: dict) -> None:
        try:
            known = KnownPlace(
                name=str(place["name"]),
                lat=float(place["lat"]),
                lng=float(place["lng"]),
                website_url=place.get("website_url"),
                source_urls=[str(url) for url in place.get("source_urls", [])],
            )
        except (KeyError, TypeError, ValueError):
            return
        for url in known.source_urls:
            self.places_by_source[url] = known

    def add_point(self, point: dict) -> None:
        try:
            self.points.append(KnownPlace(name=str(point["name"]), lat=float(point["lat"]), lng=float(point["lng"])))
        except (KeyError, TypeError, ValueError):
            return

    def all_places(self) -> list[KnownPlace]:
        unique = {id(place): place for place in self.places_by_source.values()}
        return [*unique.values(), *self.points]


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
            })
    return evidence


def recording_tools(evidence: Evidence) -> list:
    """find_places and locate, recording every result into `evidence`."""

    def find_places(near: str, category: str, keyword: str = "", radius_m: int = 3000, limit: int = 8) -> dict:
        result = travel_tools.find_places(near, category, keyword, radius_m, limit)
        for place in result.get("places", []):
            evidence.add_place(place)
        return result

    def locate(place: str) -> dict:
        result = travel_tools.locate(place)
        if result.get("status") == "ok":
            evidence.add_point(result)
        return result

    find_places.__doc__ = _FIND_PLACES_DOC
    locate.__doc__ = _LOCATE_DOC
    return [tool(find_places), tool(locate)]
