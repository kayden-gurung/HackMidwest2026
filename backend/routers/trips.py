"""Road-trip planning without the AI: the fast first plan, and the searches behind "change this".

The chat (routers/ask.py) handles follow-up edits. These endpoints let the Drive screen show a
real plan straight away and offer swaps (other towns, attractions, restaurants) on its own.
"""

from fastapi import APIRouter, HTTPException, Query

from tools.places import Place, PlacesUnavailable, foreground
from tools.route_search import RouteOption, RouteStop, find_attractions, find_restaurants, route_options, towns_along_route
from trip_planner import TripPlan, TripRequest, build_first_plan

router = APIRouter(prefix="/api/trips", tags=["trips"])


def _unavailable(error: PlacesUnavailable) -> HTTPException:
    return HTTPException(status_code=503, detail=str(error))


@router.post("/plan", response_model=TripPlan)
def plan(body: TripRequest):
    try:
        with foreground():  # background warming waits for this
            result = build_first_plan(body)
    except PlacesUnavailable as error:
        raise _unavailable(error) from error
    if result is None:
        raise HTTPException(status_code=404, detail=f'No driving route found from "{body.start}" to "{body.destination}".')
    return result


@router.get("/routes", response_model=list[RouteOption])
def routes(origin: str = Query(min_length=2, max_length=120), destination: str = Query(min_length=2, max_length=120)):
    try:
        with foreground():  # background warming waits for this
            return route_options(origin, destination)
    except PlacesUnavailable as error:
        raise _unavailable(error) from error


@router.get("/towns", response_model=list[RouteStop])
def towns(
    origin: str = Query(min_length=2, max_length=120),
    destination: str = Query(min_length=2, max_length=120),
    interests: list[str] = Query(default=[]),
    route_index: int = Query(default=0, ge=0, le=3),
    exclude: list[str] = Query(default=[], max_length=50),
    max_detour_minutes: int = Query(default=30, ge=0, le=240),
    limit: int = Query(default=8, ge=1, le=25),
):
    try:
        with foreground():  # background warming waits for this
            return towns_along_route(origin, destination, interests, route_index, exclude, max_detour_minutes, limit)
    except PlacesUnavailable as error:
        raise _unavailable(error) from error


@router.get("/attractions", response_model=list[Place])
def attractions(near: str = Query(min_length=2, max_length=120), interests: list[str] = Query(default=[]),
                exclude: list[str] = Query(default=[], max_length=50), limit: int = Query(default=8, ge=1, le=25)):
    try:
        with foreground():  # background warming waits for this
            return find_attractions(near, interests, exclude, limit=limit)
    except PlacesUnavailable as error:
        raise _unavailable(error) from error


@router.get("/restaurants", response_model=list[Place])
def restaurants(near: str = Query(min_length=2, max_length=120), keyword: str | None = Query(default=None, max_length=60),
                exclude: list[str] = Query(default=[], max_length=50), limit: int = Query(default=8, ge=1, le=25)):
    try:
        with foreground():  # background warming waits for this
            return find_restaurants(near, keyword, exclude, limit=limit)
    except PlacesUnavailable as error:
        raise _unavailable(error) from error
