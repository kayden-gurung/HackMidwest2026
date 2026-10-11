"""Deterministic budget arithmetic. The agent, not this function, chooses what to change."""

from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from itinerary import ItinerarySnapshot


def analyze_budget(plan: "ItinerarySnapshot") -> dict:
    def dollars(value: Decimal) -> float:
        return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    total = sum((Decimal(str(item.costUsd)) for item in plan.items if item.costUsd is not None), Decimal(0))
    budget = Decimal(str(plan.budget.plannedUsd)) if plan.budget.plannedUsd is not None else None
    remaining = dollars(budget - total) if budget is not None else None
    unknown = [{"id": item.id, "title": item.title} for item in plan.items if item.costUsd is None]
    status = ("no_limit" if remaining is None else "over_budget" if remaining < 0 else
              "incomplete" if unknown else "under_budget" if remaining > 0 else "on_budget")
    # Review optional activities first; essential meals, lodging and transport need cheaper
    # replacements, not blind deletion. These are candidates, never automatic edits.
    priority = {"Activities": 0, "Food": 1, "Stays": 2, "Driving": 3}
    candidates = sorted((item for item in plan.items if item.costUsd),
                        key=lambda item: (priority[item.category], -item.costUsd)) if remaining is not None and remaining < 0 else []
    return {
        "status": "ok", "budget_status": status, "estimated_total_usd": dollars(total),
        "budget_usd": dollars(budget) if budget is not None else None,
        "remaining_usd": remaining, "over_budget_usd": max(0, -remaining) if remaining is not None else None,
        "within_budget": False if remaining is not None and remaining < 0 else (None if unknown or budget is None else True),
        "unknown_costs": unknown,
        "cut_candidates": [{"id": item.id, "title": item.title, "category": item.category,
                            "estimated_cost_usd": dollars(Decimal(str(item.costUsd))),
                            "suggestion": "Consider skipping or replacing this activity, unless it is a must-do."
                            if item.category == "Activities" else "Find a cheaper alternative; do not simply omit this essential cost."}
                           for item in candidates],
        "message": "Costs are planning estimates for all travelers. Unknown costs are excluded from the subtotal. "
                   "Cut candidates are a review order, not guaranteed savings; preserve the traveler's must-do stops. "
                   "Revise the draft if needed and call check_budget again before update_itinerary.",
    }
