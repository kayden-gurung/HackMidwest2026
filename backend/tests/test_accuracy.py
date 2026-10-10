"""Accuracy checks on the itinerary sent to the Plan/Map/Budget panels. No AWS or network needed."""

import pytest
from fastapi.testclient import TestClient

import tools as travel_tools
from evidence import Evidence, recording_tools
from itinerary import ItinerarySnapshot
from main import app
from routers import ask as ask_router
from validation import validate_snapshot

OSM_URL = "https://www.openstreetmap.org/node/1"
REAL_PLACE = {"name": "Trattoria Real", "category": "Food", "kind": "restaurant", "lat": 41.0, "lng": 17.2,
              "website_url": "https://trattoria-real.example", "distance_m": 120, "source_urls": [OSM_URL]}


def item(id, **fields):
    return {"id": id, "date": "2029-06-18", "title": id.title(), "category": "Activities", "costUsd": 0, **fields}


def plan(*items, budget=500):
    return {"startDate": "2029-06-18", "endDate": "2029-06-19", "budget": {"plannedUsd": budget}, "items": list(items)}


def model_plan():
    return plan(
        # Real place, but the model got the pin and website wrong: corrected from the tool result.
        item("dinner", category="Food", costUsd=80, time="20:00", sourceUrls=[OSM_URL], websiteUrl="https://wrong.example",
             location={"name": "Trattoria Real", "lat": 41.5, "lng": 17.9}),
        # Invented restaurant with an invented source link, website and pin: all removed, and flagged.
        item("lunch", category="Food", costUsd=60, sourceUrls=["https://www.openstreetmap.org/node/999"],
             websiteUrl="https://madeup.example", location={"name": "Made Up Bistro", "lat": 10, "lng": 10}),
        # Generic activity without a source: left alone.
        item("beach", title="Free afternoon at the beach", time="15:00"),
        # Flight with a made-up departure time.
        item("flight", category="Flights", costUsd=1300, time="18:10"),
    )


@pytest.fixture
def fake_map(monkeypatch):
    monkeypatch.setattr(travel_tools, "find_places", lambda *a, **k: {"status": "ok", "places": [REAL_PLACE]})
    monkeypatch.setattr(travel_tools, "locate", lambda place: {"status": "ok", "name": place, "lat": 41.0, "lng": 17.0})


def looked_up_evidence():
    evidence = Evidence()
    evidence.add_place(REAL_PLACE)
    return evidence


def test_keeps_only_what_the_tools_confirmed():
    cleaned, notes = validate_snapshot(ItinerarySnapshot.model_validate(model_plan()), looked_up_evidence())
    by_id = {i.id: i for i in cleaned.items}

    dinner = by_id["dinner"]
    assert (dinner.location.lat, dinner.location.lng, dinner.websiteUrl, dinner.sourceUrls) == (41.0, 17.2, "https://trattoria-real.example", [OSM_URL])

    lunch = by_id["lunch"]
    assert lunch.sourceUrls == [] and lunch.websiteUrl is None and lunch.location.lat is None
    assert lunch.location.name == "Made Up Bistro"  # the stop stays, minus the invented details

    assert by_id["beach"].time == "15:00"
    assert by_id["flight"].time is None

    text = " ".join(notes)
    assert '"Made Up Bistro"' in text and "check these exist" in text and "Removed map pins" in text
    assert "Flight costs are rough estimates" in text
    assert "over the $500 budget" in text
    assert cleaned.assumptions[: len(notes)] == notes


def test_pin_near_a_looked_up_place_is_snapped_to_it():
    snapshot = ItinerarySnapshot.model_validate(plan(item("coffee", location={"name": "Coffee", "lat": 41.0005, "lng": 17.2005})))
    cleaned, _ = validate_snapshot(snapshot, looked_up_evidence())
    assert (cleaned.items[0].location.lat, cleaned.items[0].sourceUrls) == (41.0, [OSM_URL])


def test_assumptions_never_exceed_the_schema_limit():
    snapshot = ItinerarySnapshot.model_validate({**model_plan(), "assumptions": [f"note {n}" for n in range(12)]})
    cleaned, notes = validate_snapshot(snapshot, Evidence())
    assert len(cleaned.assumptions) == 12 and cleaned.assumptions[0] == notes[0]


def test_recording_tools_keep_their_names_and_record_results(fake_map):
    evidence = Evidence()
    tools = {t.tool_name: t for t in recording_tools(evidence)}
    assert set(tools) == {"find_places", "locate"}
    assert "OpenStreetMap" in tools["find_places"].tool_spec["description"]
    tools["find_places"]("Polignano a Mare", "Food")
    tools["locate"]("Polignano a Mare")
    assert OSM_URL in evidence.places_by_source and len(evidence.points) == 1


class FakeAgent:
    """Stands in for Strands: looks up places only if told to, then updates the panels."""

    system_prompt = "Roam"

    def __init__(self, kwargs, look_up=True):
        self.tools = {t.tool_name: t for t in kwargs["travel_tools"]}
        self.update = kwargs["extra_tools"][0]
        self.look_up = look_up

    def __call__(self, prompt):
        if self.look_up:
            self.tools["find_places"]("Polignano a Mare", "Food")
        self.tool_result = self.update(itinerary=model_plan())
        return "Here is your plan."


def test_chat_route_returns_checked_plan_and_tells_the_model(fake_map, monkeypatch):
    agents = []
    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: agents.append(FakeAgent(kwargs)) or agents[-1])
    response = TestClient(app).post("/api/ask", json={"prompt": "Plan Puglia"}).json()
    items = {i["id"]: i for i in response["itinerary"]["items"]}
    assert items["dinner"]["sourceUrls"] == [OSM_URL] and items["dinner"]["websiteUrl"] == "https://trattoria-real.example"
    assert items["lunch"]["websiteUrl"] is None and items["lunch"]["sourceUrls"] == []
    assert "Made Up Bistro" in " ".join(agents[-1].tool_result["accuracy_notes"])


def test_nothing_is_verified_without_a_lookup_in_that_request(fake_map, monkeypatch):
    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: FakeAgent(kwargs, look_up=False))
    response = TestClient(app).post("/api/ask", json={"prompt": "Plan Puglia"}).json()
    dinner = next(i for i in response["itinerary"]["items"] if i["id"] == "dinner")
    assert dinner["sourceUrls"] == [] and dinner["location"]["lat"] is None


def test_revision_keeps_places_verified_in_the_current_plan(fake_map, monkeypatch):
    client = TestClient(app)
    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: FakeAgent(kwargs))
    first = client.post("/api/ask", json={"prompt": "Plan Puglia"}).json()["itinerary"]

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: FakeAgent(kwargs, look_up=False))
    revised = client.post("/api/ask", json={"prompt": "Move the beach", "current_itinerary": first}).json()["itinerary"]
    dinner = next(i for i in revised["items"] if i["id"] == "dinner")
    assert dinner["sourceUrls"] == [OSM_URL] and dinner["location"]["lat"] == 41.0


def test_stream_returns_the_checked_plan(fake_map, monkeypatch):
    class StreamingAgent(FakeAgent):
        async def stream_async(self, prompt):
            self("x")
            yield {"data": "Plan"}

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: StreamingAgent(kwargs))
    text = TestClient(app).post("/api/ask/stream", json={"prompt": "Plan"}).text
    assert "madeup.example" not in text and "trattoria-real.example" in text


def test_prompt_carries_the_accuracy_rules():
    from agent import SYSTEM_PROMPT

    for rule in ("You only help with travel", "Never give flight numbers", "Only recommend specific places that a tool", "update_itinerary"):
        assert rule in SYSTEM_PROMPT
