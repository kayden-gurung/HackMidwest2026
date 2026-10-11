from fastapi import APIRouter, HTTPException, Path, Query

from tools.explore import ExploreResult, ExploreRoute, ThemeId, explore_theme, route_to
from tools.places import PlacesUnavailable

router = APIRouter(prefix="/api/explore", tags=["explore"])

# The Explore page's themes. Map lookups only, no AI, so they answer in a few seconds.


@router.get("/route", response_model=ExploreRoute)
def route(
    from_lat: float = Query(ge=-90, le=90),
    from_lng: float = Query(ge=-180, le=180),
    to_lat: float = Query(ge=-90, le=90),
    to_lng: float = Query(ge=-180, le=180),
):
    try:
        found = route_to(from_lat, from_lng, to_lat, to_lng)
    except PlacesUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if found is None:
        raise HTTPException(status_code=404, detail="No driving route found to this spot.")
    return found


@router.get("/{theme}", response_model=ExploreResult)
def explore(
    theme: ThemeId = Path(description="river-towns, trailheads or historic-main-streets"),
    origin: str = Query(default="Kansas City, MO", min_length=2, max_length=120, description="Where the drive starts"),
    max_hours: float = Query(default=3, ge=0.5, le=4, description="Longest drive to a spot, in hours"),
):
    try:
        result = explore_theme(theme, origin, max_hours)
    except PlacesUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if result is None:
        raise HTTPException(status_code=404, detail=f'Could not find "{origin}".')
    return result
