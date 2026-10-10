"""Validated, request-local itinerary updates from the Strands agent."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from strands import tool


class PlanModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Location(PlanModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=400)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def paired_coordinates(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Supply both lat and lng, or neither.")
        return self


class PlanItem(PlanModel):
    id: str = Field(min_length=1, max_length=100, description="Stable ID: preserve it when revising an existing stop.")
    date: date
    time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1200)
    category: Literal["Flights", "Stays", "Food", "Activities"]
    costUsd: float | None = Field(default=None, ge=0, le=1000000,
                                 description="Estimated total USD for all travelers. Null means unknown; 0 means free.")
    location: Location | None = None
    websiteUrl: str | None = Field(default=None, max_length=2000)
    sourceUrls: list[str] = Field(default_factory=list, max_length=10)


class PlanBudget(PlanModel):
    plannedUsd: float | None = Field(default=None, ge=0, le=10000000,
                                    description="Traveler's total trip budget in USD, or null if not set.")


class ItinerarySnapshot(PlanModel):
    startDate: date
    endDate: date
    items: list[PlanItem] = Field(max_length=100)
    budget: PlanBudget
    summary: str = Field(default="", max_length=1000)
    assumptions: list[str] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def coherent_plan(self):
        if not 0 <= (self.endDate - self.startDate).days < 60:
            raise ValueError("The plan must cover between 1 and 60 days.")
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("Each itinerary item needs a unique ID.")
        if any(not self.startDate <= item.date <= self.endDate for item in self.items):
            raise ValueError("All stops must fall within the trip dates.")
        return self


class ItineraryUpdates:
    """A separate instance per request; no global plan or cross-traveler state."""

    def __init__(self):
        self.latest: ItinerarySnapshot | None = None

    def confirmation(self) -> str:
        """Some model turns finish the tool action without a final text block."""
        plan = self.latest
        if plan is None:
            return ""
        total = sum(item.costUsd or 0 for item in plan.items)
        unknown = sum(item.costUsd is None for item in plan.items)
        dates = plan.startDate.isoformat() if plan.startDate == plan.endDate else f"{plan.startDate.isoformat()} to {plan.endDate.isoformat()}"
        budget = "" if plan.budget.plannedUsd is None else f" against your ${plan.budget.plannedUsd:,.2f} budget"
        missing = f" {unknown} costs are still unknown and excluded from the total." if unknown else ""
        return f"Updated your plan for {dates}: {len(plan.items)} stops, with an estimated total of ${total:,.2f}{budget}.{missing}"

    @tool
    def update_itinerary(self, itinerary: ItinerarySnapshot) -> dict:
        """Update the traveler's Plan, Map and Budget panels with a complete itinerary.

        Call whenever you propose or revise a concrete trip plan, even a short draft.
        Send the FULL replacement snapshot, retaining unaffected stops and stable IDs.
        Use only coordinates and source URLs returned by locate/find_places or supplied
        by the traveler. Omit coordinates if lookup fails; the stop still appears.
        Costs are estimates for ALL travelers, never booking quotes. Use null for unknown
        costs, 0 only for free stops. Include transport, lodging and meals when relevant;
        explain omitted costs in assumptions. State assumed dates explicitly if flexible.
        Do not call for greetings or unrelated questions. An empty items list clears stops.

        Args:
            itinerary: Complete revised plan matching the schema, not just changed stops.
        """
        # Strands validates tool input, then passes nested models as dictionaries.
        validated = ItinerarySnapshot.model_validate(itinerary)
        self.latest = validated
        return {"status": "updated", "stops": len(validated.items),
                "estimated_total_usd": sum(item.costUsd or 0 for item in validated.items),
                "unknown_costs": sum(item.costUsd is None for item in validated.items)}
