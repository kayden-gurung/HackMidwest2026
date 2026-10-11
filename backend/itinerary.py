"""Validated, request-local itinerary updates from the Strands agent."""

from datetime import date
import logging
from typing import Literal

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
    category: Literal["Driving", "Stays", "Food", "Activities"]
    costUsd: float | None = Field(default=None, ge=0, le=1000000,
                                 description="Estimated total USD for all travelers. Null means unknown; 0 means free.")
    location: Location | None = None
    websiteUrl: str | None = Field(default=None, max_length=2000)
    sourceUrls: list[str] = Field(default_factory=list, max_length=10)
    route: list[list[float]] | None = Field(default=None, max_length=400,
                                            description="Filled in automatically for driving legs from plan_drive. Leave it out.")


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


class RoadTripSummary(PlanModel):
    origin: str
    destination: str
    distanceMiles: float = Field(ge=0)
    drivingMinutes: float = Field(ge=0)
    directMinutes: float = Field(ge=0)
    detourMinutes: float = Field(ge=0)
    detourBudgetMinutes: int = Field(ge=0)
    fuelCostUsd: float = Field(ge=0)
    extraFuelCostUsd: float = Field(ge=0)
    mpg: float = Field(gt=0)
    gasPrice: float = Field(ge=0)
    routeOption: int = Field(ge=0, le=2)


class ItinerarySnapshot(PlanModel):
    startDate: date
    endDate: date
    items: list[PlanItem] = Field(max_length=100)
    budget: PlanBudget
    summary: str = Field(default="", max_length=1000)
    assumptions: list[str] = Field(default_factory=list, max_length=12)
    overview: TripOverview | None = None
    roadTrip: RoadTripSummary | None = None

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

    def __init__(self, check=None, check_on_budget=False):
        self.latest: ItinerarySnapshot | None = None
        # Optional accuracy check (validation.validate_snapshot): returns a cleaned plan plus notes.
        self.check = check
        self.check_on_budget = check_on_budget
        self.failed_checks = 0
        self._budget_draft: ItinerarySnapshot | None = None
        self._prepared: dict[str, tuple[ItinerarySnapshot, list[str]]] = {}

    def discard_draft(self):
        """A failed source-based edit must not leave an older partial draft publishable."""
        self._budget_draft = None
        self._prepared.clear()

    @tool
    def check_budget(self, itinerary: ItinerarySnapshot) -> dict:
        """Check a complete draft's estimated total against its total USD budget before publishing it.

        Python calculates the subtotal, remaining/over-budget amount and unknown costs. Returns
        ranked cut candidates when over budget; you decide which alternatives preserve the
        traveler's priorities. Never treat unknown costs as free or remove essential costs to
        pretend a trip is affordable. This check does not publish or edit the plan, but it
        keeps the draft: afterwards call update_itinerary with NO arguments to publish exactly
        this draft, so the plan is written out only once. After any draft change, call
        check_budget again with the changed draft.

        This is where the plan is written, so make it complete: the FULL replacement snapshot,
        retaining unaffected stops and stable IDs. Give every specific stop a location so it
        shows on the map: coordinates and source URL from the find_places result for that exact
        place, or from locate for a named landmark or district. Never reuse a town's
        coordinates as a stand-in for stops you did not look
        up: omit coordinates instead and the backend will try to place the stop. Copy source
        URLs exactly. Costs are estimates for ALL travelers, never booking quotes. Use null for
        unknown costs, 0 only for free stops. Include transport, lodging and meals when
        relevant; explain omitted costs in assumptions. State assumed dates explicitly if
        flexible. An empty items list clears stops. Include overview with the destination, a
        short inviting headline and the trip's pace when known. Preserve this metadata on
        revisions. Only include imageUrl when a tool or the traveler supplied a photo URL.

        Args:
            itinerary: Complete draft itinerary, including costs for all travelers and budget.
        """
        draft = ItinerarySnapshot.model_validate(itinerary)
        if self.check_on_budget:
            # Measure the route before reporting costs or requesting approval. Freeze the
            # result so approval publishes exactly the preview, without another lookup.
            self._budget_draft = draft.model_copy(deep=True)
            self._prepared.pop(draft.model_dump_json(), None)
            try:
                prepared, _ = self.prepare(draft, freeze=True)
            except Exception as error:
                self._budget_draft = None
                self.failed_checks += 1
                logging.getLogger("roam.ask").warning("Road-trip draft rejected: %s", error)
                raise
            result = analyze_budget(prepared)
            if prepared.roadTrip is not None:
                result["road_trip"] = prepared.roadTrip.model_dump()
            return result
        result = analyze_budget(draft)
        self._budget_draft = draft.model_copy(deep=True)
        return result

    @property
    def checked_draft(self) -> ItinerarySnapshot | None:
        """The draft check_budget last accepted and update_itinerary has not yet published."""
        return self._budget_draft.model_copy(deep=True) if self._budget_draft is not None else None

    @property
    def review_draft(self) -> ItinerarySnapshot | None:
        draft = self.checked_draft
        if draft is not None and self.check_on_budget:
            prepared = self._prepared.get(draft.model_dump_json())
            if prepared is not None:
                return prepared[0].model_copy(deep=True)
        return draft

    def _draft(self, itinerary=None) -> ItinerarySnapshot | None:
        """The draft a tool call refers to: the one it sent, or the last budget-checked one."""
        return self.checked_draft if itinerary is None else ItinerarySnapshot.model_validate(itinerary)

    def budget_checked(self, itinerary=None) -> bool:
        """Consent and publication both require the exact draft's budget check."""
        draft = self._draft(itinerary)
        return draft is not None and self._budget_draft == draft

    def prepare(self, itinerary=None, *, freeze=False) -> tuple[ItinerarySnapshot, list[str]]:
        """Freeze a consent preview until commit; later calls may use newly gathered evidence."""
        draft = self._draft(itinerary)
        if draft is None:
            raise ValueError("No budget-checked draft to prepare.")
        key = draft.model_dump_json()
        prepared = self._prepared.get(key)
        if prepared is None:
            prepared = self.check(draft) if self.check else (draft, [])
            if freeze:
                self._prepared[key] = prepared
        validated, notes = prepared
        return validated.model_copy(deep=True), list(notes)

    def confirmation(self) -> str:
        """Some model turns finish the tool action without a final text block."""
        plan = self.latest
        if plan is None:
            return ""
        if plan.roadTrip is not None:
            road = plan.roadTrip
            stops = [item.title for item in plan.items if item.category != "Driving"]
            unknown = sum(item.costUsd is None for item in plan.items)
            return (f"Your one-way drive from {road.origin} to {road.destination} is ready: "
                    f"{road.distanceMiles:.1f} miles, about {road.drivingMinutes:.0f} driving minutes, "
                    f"including {road.detourMinutes:.1f} extra minutes within your {road.detourBudgetMinutes}-minute limit. "
                    f"Estimated fuel: ${road.fuelCostUsd:.2f} for one car at {road.mpg:g} MPG and ${road.gasPrice:.2f}/gallon."
                    + ("\n\nStops: " + "; ".join(stops) + "." if stops else "")
                    + (f"\n\n{unknown} stop costs are unknown and excluded from the budget total." if unknown else "")
                    + " Driving time excludes traffic and visits. Review the map and planning assumptions for details.")
        total = analyze_budget(plan)["estimated_total_usd"]
        unknown = sum(item.costUsd is None for item in plan.items)
        dates = plan.startDate.isoformat() if plan.startDate == plan.endDate else f"{plan.startDate.isoformat()} to {plan.endDate.isoformat()}"
        budget = "" if plan.budget.plannedUsd is None else f" against your ${plan.budget.plannedUsd:,.2f} budget"
        missing = f" {unknown} costs are still unknown and excluded from the total." if unknown else ""
        return f"Updated your plan for {dates}: {len(plan.items)} stops, with an estimated total of ${total:,.2f}{budget}.{missing}"

    @tool
    def update_itinerary(self, itinerary: ItinerarySnapshot | None = None) -> dict:
        """Publish the budget-checked draft to the traveler's Plan, Map and Budget panels.

        Call with NO arguments right after check_budget: it publishes exactly the draft that
        check_budget just accepted. Do NOT send the itinerary again; rewriting it only makes
        the traveler wait. Call whenever you propose or revise a concrete trip plan, even a
        short draft. If you change anything, call check_budget with the changed draft first.
        Without a checked draft nothing is published. Do not call for greetings or unrelated
        questions.

        Args:
            itinerary: Leave this out. Only for older callers; it must equal the checked draft.
        """
        # Strands validates tool input, then passes nested models as dictionaries.
        if itinerary is None and self._budget_draft is None and self.latest is not None:
            # A repeated call after publishing: say so, or the model rewrites the whole plan.
            return {"status": "already_updated", "message": "The checked draft is already published. Nothing else to do unless the plan changes."}
        if not self.budget_checked(itinerary):
            return {"status": "budget_check_required",
                    "message": "Call check_budget with the complete draft, review its result, then call update_itinerary with no arguments. No plan was changed."}
        key = self._draft(itinerary).model_dump_json()
        validated, notes = self.prepare(itinerary)
        self._prepared.pop(key, None)
        self.latest = validated
        self._budget_draft = None
        budget = analyze_budget(validated)
        result = {"status": "updated", "stops": len(validated.items),
                  "estimated_total_usd": budget["estimated_total_usd"],
                  "unknown_costs": sum(item.costUsd is None for item in validated.items)}
        if notes:
            # Tell the model what was removed so it can look places up or stop mentioning them.
            result["accuracy_notes"] = notes
        return result
