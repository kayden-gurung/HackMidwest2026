from fastapi import APIRouter, HTTPException, Query

from tools.places import GeoPoint, Place, PlaceCategory, PlacesUnavailable, geocode, search_places

router = APIRouter(prefix="/api/places", tags=["places"])

# These call the place lookup directly, with no AI involved. They exist to check the data
# and to let the frontend show real places before the agent is wired up.


@router.get("/search", response_model=list[Place])
def search(
    near: str = Query(min_length=2, max_length=120, description='Where to search, e.g. "Polignano a Mare, Italy"'),
    category: PlaceCategory = Query(description="Food, Stays or Activities"),
    keyword: str | None = Query(default=None, max_length=60, description='Narrow by name or cuisine, e.g. "seafood"'),
    radius_m: int = Query(default=3000, ge=100, le=20000),
    limit: int = Query(default=8, ge=1, le=25),
):
    try:
        return search_places(near, category, keyword, radius_m, limit)
    except PlacesUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/locate", response_model=GeoPoint)
def locate(q: str = Query(min_length=2, max_length=120, description="A town, address or landmark")):
    try:
        point = geocode(q)
    except PlacesUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if point is None:
        raise HTTPException(status_code=404, detail=f'Could not find "{q}".')
    return point
