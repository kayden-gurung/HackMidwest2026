"""Validated, request-local itinerary updates from the Strands agent."""

from datetime import date
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator
from strands import tool

from budget import analyze_budget


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
    category: Literal["Flights", "Driving", "Stays", "Food", "Activities"]
    costUsd: float | None = Field(default=None, ge=0, le=1000000,
                                 description="Estimated total USD for all travelers. Null means unknown; 0 means free.")
    location: Location | None = None
    websiteUrl: str | None = Field(default=None, max_length=2000)
    sourceUrls: list[str] = Field(default_factory=list, max_length=10)


class PlanBudget(PlanModel):
    plannedUsd: float | None = Field(default=None, ge=0, le=10000000,
                                    description="Traveler's total trip budget in USD, or null if not set.")


class TripOverview(PlanModel):
    destination: str = Field(min_length=1, max_length=200, description="Destination name, e.g. Kyoto, Japan.")
    headline: str | None = Field(default=None, max_length=120, description="A short, inviting headline specific to this trip.")
    pace: str | None = Field(default=None, max_length=40)
    imageUrl: str | None = Field(default=None, max_length=2000,
                               description="Optional photo URL from a tool result or the traveler. Never invent URLs; omit when unavailable.")
    imageAlt: str | None = Field(default=None, max_length=300)


class ItinerarySnapshot(PlanModel):
    startDate: date
    endDate: date
    items: list[PlanItem] = Field(max_length=100)
    budget: PlanBudget
    summary: str = Field(default="", max_length=1000)
    assumptions: list[str] = Field(default_factory=list, max_length=12)
    overview: TripOverview | None = None

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

    def __init__(self, check=None):
        self.latest: ItinerarySnapshot | None = None
        # Optional accuracy check (validation.validate_snapshot): returns a cleaned plan plus notes.
        self.check = check
        self._budget_draft: ItinerarySnapshot | None = None
        self._draft_id: str | None = None
        self.update_pending = False

    @tool
    def check_budget(self, itinerary: ItinerarySnapshot) -> dict:
        """Check a complete draft's estimated total against its total USD budget before publishing it.

        Python calculates the subtotal, remaining/over-budget amount and unknown costs. Returns
        ranked cut candidates when over budget; you decide which alternatives preserve the
        traveler's priorities. Never treat unknown costs as free or remove essential costs to
        pretend a trip is affordable. After any draft change, call check_budget again, then
        update_itinerary with the returned draft_id only. This check does not publish or edit the plan.

        Args:
            itinerary: Complete draft itinerary, including costs for all travelers and budget.
        """
        self.update_pending = True
        self._budget_draft = None
        self._draft_id = None
        draft = ItinerarySnapshot.model_validate(itinerary)
        result = analyze_budget(draft)
        self._budget_draft = draft.model_copy(deep=True)
        self._draft_id = uuid4().hex
        result["draft_id"] = self._draft_id
        return result

    def confirmation(self) -> str:
        """Some model turns finish the tool action without a final text block."""
        plan = self.latest
        if plan is None:
            return ""
        total = analyze_budget(plan)["estimated_total_usd"]
        unknown = sum(item.costUsd is None for item in plan.items)
        dates = plan.startDate.isoformat() if plan.startDate == plan.endDate else f"{plan.startDate.isoformat()} to {plan.endDate.isoformat()}"
        budget = "" if plan.budget.plannedUsd is None else f" against your ${plan.budget.plannedUsd:,.2f} budget"
        missing = f" {unknown} costs are still unknown and excluded from the total." if unknown else ""
        return f"Updated your plan for {dates}: {len(plan.items)} stops, with an estimated total of ${total:,.2f}{budget}.{missing}"

    @tool
    def update_itinerary(self, draft_id: str = "", itinerary: ItinerarySnapshot | None = None) -> dict:
        """Update the traveler's Plan, Map and Budget panels with a complete itinerary.

        Call whenever you propose or revise a concrete trip plan, even a short draft.
        You MUST call check_budget with the complete revised draft first, retaining
        unaffected stops and stable IDs. Then pass its returned draft_id only here;
        Python publishes the stored draft, so do not regenerate the itinerary a second time.
        If you change the draft, check it again and use the new draft_id.
        Give every specific stop a location so it shows on the map: coordinates and source
        URL from the find_places result for that exact place, or from locate for a named
        landmark, district or airport. A flight's location is its airport. Never reuse a
        town's coordinates as a stand-in for stops you did not look up: omit coordinates
        instead and the backend will try to place the stop. Copy source URLs exactly.
        Costs are estimates for ALL travelers, never booking quotes. Use null for unknown
        costs, 0 only for free stops. Include transport, lodging and meals when relevant;
        explain omitted costs in assumptions. State assumed dates explicitly if flexible.
        Do not call for greetings or unrelated questions. An empty items list clears stops.
        Include overview with the destination, a short inviting headline and the trip's
        pace when known. Preserve this metadata on revisions. Only include imageUrl
        when a tool or the traveler supplied a photo URL; otherwise omit it.

        Args:
            draft_id: ID returned by the most recent check_budget in this request.
            itinerary: Legacy alternative: the exact complete budget-checked snapshot.
        """
        # Strands validates tool input, then passes nested models as dictionaries.
        self.update_pending = True
        supplied = ItinerarySnapshot.model_validate(itinerary) if itinerary is not None else None
        valid_id = bool(draft_id) and draft_id == self._draft_id
        if (self._budget_draft is None or (draft_id and not valid_id)
                or (supplied is not None and supplied != self._budget_draft)
                or (not valid_id and supplied is None)):
            # ValueError becomes a Strands tool error, rather than a successful tool
            # result containing a rejection that the model can mistake for publication.
            raise ValueError("Budget check required. Call check_budget with the complete revised draft, "
                             "review its result, then call update_itinerary with its draft_id only. No plan was changed.")
        validated = self._budget_draft.model_copy(deep=True)
        notes: list[str] = []
        if self.check is not None:
            validated, notes = self.check(validated)
        self.latest = validated
        self._budget_draft = None
        self._draft_id = None
        self.update_pending = False
        budget = analyze_budget(validated)
        result = {"status": "updated", "stops": len(validated.items),
                  "estimated_total_usd": budget["estimated_total_usd"],
                  "unknown_costs": sum(item.costUsd is None for item in validated.items)}
        if notes:
            # Tell the model what was removed so it can look places up or stop mentioning them.
            result["accuracy_notes"] = notes
        return result
