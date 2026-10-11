"""Request-local road-trip tools and hard route checks using the existing OSM/OSRM providers."""

import math
from datetime import timedelta
from urllib.parse import urlencode

from itinerary import ItinerarySnapshot, Location, PlanItem, RoadTripSummary
from schemas import RoadTripPreferences
from tools import places
from tools.driving import _points_along, _split_path, road_routes

SOURCES = ["https://www.openstreetmap.org/copyright", "https://project-osrm.org/"]


class RoadTripPlanner:
    def __init__(self, preferences: RoadTripPreferences, current: ItinerarySnapshot | None, max_miles: int | None):
        self.preferences, self.current, self.max_miles = preferences, current, max_miles or 450
        same_drive = current and current.roadTrip and current.roadTrip.origin == preferences.origin and current.roadTrip.destination == preferences.destination
        self.route_option = current.roadTrip.routeOption if same_drive else 0
        self.alternative_option = 0 if self.route_option else 1
        self._routes: dict[tuple, list[dict]] = {}
        self._endpoints = None

    def endpoints(self):
        if self._endpoints is None:
            start = places.geocode(self.preferences.origin)
            end = places.geocode(self.preferences.destination)
            if start is None or end is None:
                raise ValueError("The starting city or destination could not be located. Check the place names.")
            self._endpoints = (start, end)
        return self._endpoints

    def routes(self, points, alternatives=False):
        key = (tuple(points), alternatives)
        if key not in self._routes:
            self._routes[key] = road_routes(points, alternatives=alternatives)
        return self._routes[key]

    def direct(self):
        start, end = self.endpoints()
        routes = self.routes([(start.lat, start.lng), (end.lat, end.lng)])
        if not routes:
            raise ValueError("No drivable route was found between these places.")
        return routes[0]

    def route(self, stops, option=None):
        start, end = self.endpoints()
        points = [(start.lat, start.lng), *stops, (end.lat, end.lng)]
        option = self.route_option if option is None else option
        routes = self.routes(points, alternatives=option > 0)
        if option >= len(routes):
            raise ValueError("The routing provider did not return a different route through these stops. Keep the current route or change a waypoint.")
        return routes[option]

    def plan_drive(self, via: list[str] | None = None, alternative: bool = False) -> dict:
        """Preview a one-way route, optionally through named waypoints or a provider alternative."""
        try:
            if len(via or []) > 10:
                raise ValueError("This drive supports at most ten intermediate locations. Reduce the proposed stops.")
            stops = []
            for name in via or []:
                point = places.geocode(name)
                if point is None:
                    return {"status": "no_results", "message": f"Could not locate {name}."}
                stops.append((point.lat, point.lng))
            option = self.alternative_option if alternative else self.route_option
            result = self.route(stops, option)
            self.route_option = option
            direct = self.direct()
            extra = max(0, result["minutes"] - direct["minutes"])
            return {"status": "ok", "source": "OpenStreetMap and OSRM", "source_urls": SOURCES,
                    "distance_miles": round(result["miles"], 1), "drive_minutes": round(result["minutes"], 1),
                    "detour_minutes": round(extra, 1), "within_detour_budget": extra <= self.preferences.detour_minutes,
                    "fuel_cost_usd": round(result["miles"] / self.preferences.mpg * self.preferences.gas_price, 2),
                    "driving_days_each_way": max(1, math.ceil(result["miles"] / self.max_miles), math.ceil(result["minutes"] / 360)),
                    "route_option": option, "round_trip": False,
                    "summary": "One-way route. The backend recalculates the complete route through every proposed stop before approval.",
                    "assumptions": self.assumptions()}
        except (places.PlacesUnavailable, ValueError) as error:
            return {"status": "unavailable", "message": str(error)}

    def assumptions(self):
        return [f"Fuel estimated at {self.preferences.mpg:g} MPG and ${self.preferences.gas_price:.2f}/gallon for one car, one way.",
                "Driving times exclude traffic and time spent visiting stops. Tolls, parking and rental costs are excluded."]

    def find_route_towns(self, exclude: list[str] | None = None) -> dict:
        """Discover verified towns at five points along the route; no exhaustive-search claim."""
        try:
            route = self.route([])
            excluded = {name.casefold().strip() for name in (exclude or [])}
            existing_sources = {url for item in self.current.items for url in item.sourceUrls} if self.current else set()
            seen, towns = set(), []
            for lat, lng in _points_along(route["coordinates"], [0.15, 0.325, 0.5, 0.675, 0.85]):
                name = places.town_at(lat, lng)
                if not name or name.casefold() in seen:
                    continue
                seen.add(name.casefold())
                if any(value and value in name.casefold() for value in excluded):
                    continue
                point = places.geocode(name)
                if not point or point.kind not in {"town", "village", "hamlet"} or not point.source_url or point.source_url in existing_sources:
                    continue
                if self.current and any(item.location and item.location.lat is not None
                    and places._distance_m(point.lat, point.lng, item.location.lat, item.location.lng) < 500
                    for item in self.current.items if item.category != "Driving"):
                    continue
                candidate = self.route([(point.lat, point.lng)], option=0)
                extra = max(0, candidate["minutes"] - self.direct()["minutes"])
                if extra > self.preferences.detour_minutes:
                    continue
                towns.append({**point.model_dump(), "detour_minutes": round(extra, 1),
                              "source_urls": [point.source_url]})
            return {"status": "ok" if towns else "no_results", "towns": towns,
                    "message": "Sampled five positions along the route. Detours are for each town alone; combined stops must be checked together. Town/village labels are map classifications, not verified population counts."}
        except (places.PlacesUnavailable, ValueError) as error:
            return {"status": "unavailable", "towns": [], "message": str(error)}

    def validate(self, snapshot: ItinerarySnapshot) -> ItinerarySnapshot:
        """Measure the whole selected route and replace model-written driving costs and geometry."""
        start, end = self.endpoints()
        stops, seen = [], {(round(start.lat, 6), round(start.lng, 6)), (round(end.lat, 6), round(end.lng, 6))}
        visits = [item for item in snapshot.items if item.category != "Driving"]
        for item in sorted(visits, key=lambda i: (i.date, i.time or "23:59")):
            location = item.location
            if location is None or location.lat is None or not item.sourceUrls:
                raise ValueError(f"Look up the exact location and source of {item.title} before adding it to a road trip.")
            key = (round(location.lat, 6), round(location.lng, 6))
            if key not in seen:
                stops.append((location.lat, location.lng))
                seen.add(key)
        if len(stops) > 10:
            raise ValueError("This drive supports at most ten distinct intermediate locations. Reduce the proposed stops.")
        result, direct = self.route(stops), self.direct()
        extra = max(0, result["minutes"] - direct["minutes"])
        if extra > self.preferences.detour_minutes:
            raise ValueError(f"The complete route adds {extra:.1f} driving minutes, exceeding the {self.preferences.detour_minutes}-minute detour budget. Remove or replace stops and check again.")
        days = max(1, math.ceil(result["miles"] / self.max_miles), math.ceil(result["minutes"] / 360))
        if days > (snapshot.endDate - snapshot.startDate).days + 1:
            raise ValueError(f"This route needs at least {days} driving days for the daily mileage/time limits. Extend the itinerary dates.")
        fuel = round(result["miles"] / self.preferences.mpg * self.preferences.gas_price, 2)
        summary = RoadTripSummary(origin=self.preferences.origin, destination=self.preferences.destination,
            distanceMiles=round(result["miles"], 1), drivingMinutes=round(result["minutes"], 1),
            directMinutes=round(direct["minutes"], 1), detourMinutes=round(extra, 1), detourBudgetMinutes=self.preferences.detour_minutes,
            fuelCostUsd=fuel, extraFuelCostUsd=round(max(0, result["miles"] - direct["miles"]) / self.preferences.mpg * self.preferences.gas_price, 2),
            mpg=self.preferences.mpg, gasPrice=self.preferences.gas_price, routeOption=self.route_option)
        paths = _split_path(result["coordinates"], days)
        fuel_per_day, leftover_cents = divmod(round(fuel * 100), days)
        directions = "https://www.google.com/maps/dir/?" + urlencode({"api": 1, "origin": self.preferences.origin,
            "destination": self.preferences.destination, "travelmode": "driving",
            **({"waypoints": "|".join(f"{lat},{lng}" for lat, lng in stops)} if stops else {})})
        driving = [PlanItem(id=f"road-drive-{index + 1}", date=snapshot.startDate + timedelta(days=index),
            title=f"Drive {self.preferences.origin} → {self.preferences.destination}" + (f" · day {index + 1}" if days > 1 else ""),
            category="Driving", costUsd=(fuel_per_day + (index < leftover_cents)) / 100,
            description=f"About {result['miles'] / days:.1f} miles and {result['minutes'] / days:.0f} driving minutes. Fuel estimate for one car.",
            location=Location(name=self.preferences.destination if index == days - 1 else f"End of driving day {index + 1}",
                              lat=path[-1][0], lng=path[-1][1]), route=path, websiteUrl=directions, sourceUrls=SOURCES)
            for index, path in enumerate(paths)]
        assumptions = [*self.assumptions(), *[a for a in snapshot.assumptions if not a.startswith("Fuel estimated at ")]]
        return ItinerarySnapshot.model_validate(snapshot.model_copy(update={"items": [*driving, *visits],
            "roadTrip": summary, "summary": f"One-way drive: {summary.distanceMiles:.1f} miles, {summary.drivingMinutes:.0f} driving minutes, {summary.detourMinutes:.1f} extra minutes. Estimated fuel ${fuel:.2f}.",
            "assumptions": list(dict.fromkeys(assumptions))[:12]}).model_dump())
