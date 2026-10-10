"""Request shapes shared by routes and the agent. Keep in step with the frontend types that mirror them."""

from pydantic import BaseModel, Field


class Preferences(BaseModel):
    """The traveler's saved settings, sent with every message so the agent can use them.

    Mirrors `TravelPreferences` in frontend/src/features/chat/types.ts. Every field is optional,
    so the frontend can add settings over time without breaking older requests.
    """

    interests: list[str] = Field(default_factory=list, max_length=20)
    pace: str | None = Field(default=None, max_length=40)
    stay_style: str | None = Field(default=None, max_length=40)
    # "Hands-on", "Co-pilot" or "Surprise me": how much the agent should decide on its own.
    planning_style: str | None = Field(default=None, max_length=40)
    currency: str | None = Field(default=None, max_length=10)
    home_airport: str | None = Field(default=None, max_length=80)
    travelers: str | None = Field(default=None, max_length=80)


def describe_preferences(preferences: Preferences | None) -> str:
    """The preferences as a short block of text for the model, or "" when there are none."""
    if preferences is None:
        return ""
    # Values come from the browser, so newlines are flattened to keep each setting on its own line.
    clean = lambda value: " ".join(str(value).split())  # noqa: E731
    lines = [
        ("Interests", ", ".join(clean(item) for item in preferences.interests if clean(item))),
        ("Travel pace", clean(preferences.pace or "")),
        ("Stay style", clean(preferences.stay_style or "")),
        ("Planning style", clean(preferences.planning_style or "")),
        ("Currency", clean(preferences.currency or "")),
        ("Home airport", clean(preferences.home_airport or "")),
        ("Usual travelers", clean(preferences.travelers or "")),
    ]
    present = [f"- {label}: {value}" for label, value in lines if value]
    return "Traveler's saved preferences:\n" + "\n".join(present) if present else ""
