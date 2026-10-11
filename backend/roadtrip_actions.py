"""Small source-based Strands actions over the existing evidence/route/consent pipeline."""

import math
from datetime import date, timedelta
from hashlib import sha256
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from strands import tool

from itinerary import ItineraryEditError, ItinerarySnapshot, Location, PlanBudget, PlanItem, TripOverview


class StopChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_url: str = Field(min_length=1, max_length=2000)
    day: int = Field(default=1, ge=1, le=60)
    time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class StopReplacement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stop_id: str = Field(min_length=1, max_length=100)
    source_url: str = Field(min_length=1, max_length=2000)


def roadtrip_actions(body, updates, evidence, travel_tools) -> list:
    """Request-local tools; all publication still goes through update_itinerary and consent."""
    planner = updates.roadtrip_planner
    by_name = {item.tool_name: item for item in travel_tools}
    research_cache = {}

    def known(source_url):
        place = evidence.known_source(source_url)
        if place is None:
            raise ItineraryEditError("The selected place was not verified. Select an exact source_url from a place lookup or the current itinerary.")
        return place

    def visit(source_url, day, time, start, stop_id):
        place = known(source_url)
        return PlanItem(id=stop_id, date=start + timedelta(days=day - 1), time=time,
                        title=place.name.split(", ")[0][:200], category=place.category or "Activities",
                        costUsd=None, location=Location(name=place.name[:200], address=place.address,
                        lat=place.lat, lng=place.lng), websiteUrl=place.website_url,
                        sourceUrls=place.source_urls or [source_url])

    def stage(candidate):
        result = updates.check_budget(candidate)
        return {**result, "message": "The complete route and budget are checked. Call update_itinerary with no arguments to publish or request consent."}

    @tool
    def research_stops(towns: list[str] | None = None,
                       categories: list[Literal["Food", "Activities"]] | None = None,
                       exclude_current: bool = False) -> dict:
        """Research a compact verified pool in one pass, with a direct route summary.

        Args:
            towns: At most two town/city names worth researching along this drive. These names are searched, not assumed verified. Omit to sample towns along the road.
            categories: Food and/or Activities. Omit to search both together; no separate pass per interest.
            exclude_current: Exclude already selected places for a revision.
        """
        if len(towns or []) > 2:
            raise ValueError("Research at most two towns in one pass.")
        categories = list(dict.fromkeys(categories or ["Food", "Activities"]))
        key = (tuple(towns or []), tuple(categories), exclude_current)
        if key in research_cache:
            return research_cache[key]
        if research_cache and body.current_itinerary is None:
            return {**next(iter(research_cache.values())),
                    "message": "The initial research pass is complete. Select from these verified candidates or explain the data limits; do not start another research pass."}
        drive = by_name["plan_drive"](origin=planner.preferences.origin,
                                      destination=planner.preferences.destination, round_trip=False)
        if drive.get("status") != "ok":
            return {"status": "unavailable", "drive": drive, "places": [],
                    "message": "No verified drive is available. Do not create an itinerary."}
        notes = []
        if not towns:
            discovered = planner.find_route_towns(limit=2)
            for point in discovered.get("towns", []):
                evidence.add_point(point)
            towns = [point["name"] for point in discovered.get("towns", [])]
            if not towns:
                towns = [planner.preferences.destination]
                notes.append("No small towns were verified along the sampled route; researching the destination instead.")
        candidates = []
        statuses = []
        for town in list(dict.fromkeys(towns)):
            for category in categories:
                result = by_name["find_places"](near=town, category=category, limit=3,
                                                 exclude_current=exclude_current)
                statuses.append(result.get("status"))
                if result.get("status") != "ok":
                    notes.append(f"{category} near {town}: {result.get('message', 'No verified results.')}")
                for place in result.get("places", []):
                    if place.get("source_urls"):
                        candidates.append({"source_url": place["source_urls"][0], "name": place["name"],
                                           "category": place["category"], "town": town,
                                           **{key: place[key] for key in ("lat", "lng", "cuisine") if key in place}})
        result = {"status": "ok" if candidates else "unavailable" if "unavailable" in statuses else "no_results", "drive": drive,
                  "places": candidates, "notes": notes,
                  "message": "Choose two to four nearby candidates by source_url. Combined detours are checked by create_road_trip; do not invent missing places or costs."}
        research_cache[key] = result
        return result

    @tool
    def create_road_trip(stops: list[StopChoice], start_date: str = "", budget_usd: float | None = None) -> dict:
        """Build and check a NEW complete itinerary from verified place references, without retyping map facts.

        Args:
            stops: Two to four selected source_url references, with optional day (1-based) and HH:MM time.
            start_date: YYYY-MM-DD for an explicit departure. Omit/empty for flexible departure today.
            budget_usd: Explicit traveler spending limit, or omit for no limit. Never invent a limit.
        """
        if body.current_itinerary is not None:
            raise ValueError("Use edit_stops to preserve an existing itinerary.")
        updates.discard_draft()
        choices = [StopChoice.model_validate(choice) for choice in stops]
        if not 1 <= len(choices) <= 10:
            raise ValueError("Choose between one and ten verified stops; usually two to four.")
        start = date.fromisoformat(start_date) if start_date else date.today()
        visits = [visit(choice.source_url, choice.day, choice.time, start,
                        f"stop-{sha256(f'{choice.source_url}:{index}'.encode()).hexdigest()[:12]}")
                  for index, choice in enumerate(choices)]
        ordered = sorted(visits, key=lambda item: (item.date, item.time or "23:59"))
        route = planner.route([(item.location.lat, item.location.lng) for item in ordered])
        days = max(max(choice.day for choice in choices), math.ceil(route["miles"] / planner.max_miles),
                   math.ceil(route["minutes"] / 360), 1)
        candidate = ItinerarySnapshot(startDate=start, endDate=start + timedelta(days=days - 1),
            items=visits, budget=PlanBudget(plannedUsd=budget_usd),
            assumptions=([f"Flexible departure assumed to be {start.isoformat()}."] if not start_date else []),
            overview=TripOverview(destination=planner.preferences.destination,
                                  headline=f"Stops along the drive to {planner.preferences.destination}"[:120]))
        return stage(candidate)

    @tool
    def edit_stops(remove_ids: list[str] | None = None,
                   replacements: list[StopReplacement] | None = None,
                   additions: list[StopChoice] | None = None,
                   end_date: str = "") -> dict:
        """Atomically check all requested changes against the current itinerary, preserving other details.

        Args:
            remove_ids: Existing non-driving stop IDs to remove; omit to keep them.
            replacements: Existing stop_id plus a verified source_url. Keeps that ID, date and time; replaces map facts and sets unknown price to null.
            additions: Verified source_url plus optional day (1-based from the original start date) and HH:MM time. For days after the current trip ends, also supply end_date.
            end_date: YYYY-MM-DD to explicitly extend the trip for added days at the destination. Omit/empty to preserve the current dates. Never shorten the trip or exceed 60 days.
        With no edits, recheck retained stops after a successful alternative-route selection.
        Submit all changes together; a retry replaces the unpublished draft, rather than accumulating edits.
        Follow with update_itinerary with NO arguments to request consent. You may batch these calls.
        """
        if body.current_itinerary is None:
            raise ValueError("Create a new road trip before editing stops.")
        base = body.current_itinerary.model_copy(deep=True)
        updates.discard_draft()
        remove_ids = remove_ids or []
        replacements = [StopReplacement.model_validate(item) for item in replacements or []]
        additions = [StopChoice.model_validate(item) for item in additions or []]
        if end_date:
            try:
                end = date.fromisoformat(end_date)
            except ValueError:
                raise ItineraryEditError("The proposed end date must be a valid YYYY-MM-DD date.") from None
            if end < base.endDate:
                raise ItineraryEditError("This stop edit cannot shorten the trip. Keep its current end date or extend it.")
            if (end - base.startDate).days >= 60:
                raise ItineraryEditError("The trip cannot exceed 60 days. Choose an earlier end date.")
            base.endDate = end
        if any(base.startDate + timedelta(days=item.day - 1) > base.endDate for item in additions):
            raise ItineraryEditError(f"An added stop falls after the trip ends on {base.endDate.isoformat()}. Extend the trip's end date before adding later stops.")
        visits = {item.id: item for item in base.items if item.category != "Driving"}
        changed = [*remove_ids, *[item.stop_id for item in replacements]]
        if len(changed) != len(set(changed)) or any(key not in visits for key in changed):
            raise ItineraryEditError("Edit each existing non-driving stop ID at most once; unknown or driving IDs cannot be edited.")
        for key in remove_ids:
            visits.pop(key)
        for replacement in replacements:
            old = visits[replacement.stop_id]
            day = (old.date - base.startDate).days + 1
            visits[old.id] = visit(replacement.source_url, day, old.time, base.startDate, old.id)
        for index, addition in enumerate(additions):
            stem = sha256(f'{addition.source_url}:{index}'.encode()).hexdigest()[:12]
            key = f"stop-{stem}"
            while key in visits:
                key += "-new"
            visits[key] = visit(addition.source_url, addition.day, addition.time, base.startDate, key)
        candidate = ItinerarySnapshot.model_validate(base.model_copy(update={
            "items": list(visits.values()), "roadTrip": None}).model_dump())
        return stage(candidate)

    return [research_stops, create_road_trip, edit_stops]
