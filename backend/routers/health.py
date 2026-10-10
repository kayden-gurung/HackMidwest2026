from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["health"])


class HealthResponse(BaseModel):
    ok: bool


@router.get("/health", response_model=HealthResponse)
def health():
    return {"ok": True}
