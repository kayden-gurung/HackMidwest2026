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


@pytest.fixture(autouse=True)
def no_network_geocoding(monkeypatch):
    """pins.py looks stops up by name; tests must never reach the real service."""
    import tools.places as places_module

    monkeypatch.setattr(places_module, "geocode", lambda query: None)


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
    assert set(tools) == {"find_places", "locate", "plan_drive"}
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


# ----- Car mode -------------------------------------------------------------------------------

def car_plan():
    return plan(
        item("fly", title="Fly to Denver", category="Activities", costUsd=500),
        item("flight", title="Return", category="Flights", costUsd=400, time="09:00"),
        item("drive", title="Drive Kansas City to Salina", category="Driving", costUsd=40,
             sourceUrls=["https://project-osrm.org/"], websiteUrl="https://www.google.com/maps/dir/?api=1&x"),
        item("fishing", title="Fly fishing on the river", costUsd=60),
        budget=2000,
    )


def drive_evidence():
    evidence = Evidence()
    evidence.drive_links.update({"https://project-osrm.org/", "https://www.google.com/maps/dir/?api=1&x"})
    return evidence


def test_car_mode_removes_every_flight_and_keeps_driving():
    cleaned, notes = validate_snapshot(ItinerarySnapshot.model_validate(car_plan()), drive_evidence(), car_mode=True)
    ids = [i.id for i in cleaned.items]
    assert ids == ["drive", "fishing"]
    drive = cleaned.items[0]
    assert drive.sourceUrls == ["https://project-osrm.org/"] and drive.websiteUrl.startswith("https://www.google.com/maps/dir/")
    assert "Car mode is on, so flights were removed" in notes[0] and '"Fly to Denver"' in notes[0]


def test_flights_stay_when_car_mode_is_off():
    cleaned, _ = validate_snapshot(ItinerarySnapshot.model_validate(car_plan()), drive_evidence())
    assert {"fly", "flight"} <= {i.id for i in cleaned.items}


def test_unrecorded_drive_links_are_removed():
    cleaned, _ = validate_snapshot(ItinerarySnapshot.model_validate(car_plan()), Evidence(), car_mode=True)
    drive = next(i for i in cleaned.items if i.id == "drive")
    assert drive.sourceUrls == [] and drive.websiteUrl is None


def test_chat_in_car_mode_never_returns_flights(fake_map, monkeypatch):
    seen = {}

    class CarAgent:
        system_prompt = "Roam"

        def __init__(self, kwargs):
            seen["tools"] = {t.tool_name for t in kwargs["travel_tools"]}
            self.update = kwargs["extra_tools"][0]

        def __call__(self, prompt):
            seen["prompt"] = self.system_prompt
            self.update(itinerary=car_plan())
            return "Road trip ready."

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: CarAgent(kwargs))
    body = {"prompt": "Plan Denver", "car_mode": True, "max_drive_miles_per_day": 300}
    response = TestClient(app).post("/api/ask", json=body).json()
    categories = {i["category"] for i in response["itinerary"]["items"]}
    assert "Flights" not in categories and not any("Fly to" in i["title"] for i in response["itinerary"]["items"])
    assert "plan_drive" in seen["tools"]


def test_car_mode_prompt_and_limit_reach_the_agent(fake_map, monkeypatch):
    agents = []

    class Recorder:
        system_prompt = "Roam"

        def __init__(self, kwargs):
            self.drive = {t.tool_name: t for t in kwargs["travel_tools"]}["plan_drive"]
            agents.append(self)

        def __call__(self, prompt):
            return "ok"

    calls = []
    monkeypatch.setattr(travel_tools, "plan_drive", lambda *args: calls.append(args) or {"status": "ok", "source_urls": []})
    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: Recorder(kwargs))
    client = TestClient(app)

    client.post("/api/ask", json={"prompt": "x", "car_mode": True, "max_drive_miles_per_day": 300})
    assert "CAR MODE IS ON" in agents[-1].system_prompt and "at most 300 miles per day" in agents[-1].system_prompt
    assert "max_miles_per_day" not in agents[-1].drive.tool_spec["inputSchema"]["json"]["properties"]
    agents[-1].drive("Kansas City, MO", "Denver, CO")
    assert calls[-1] == ("Kansas City, MO", "Denver, CO", True, 300)

    client.post("/api/ask", json={"prompt": "x", "max_drive_miles_per_day": 300})
    assert "CAR MODE" not in agents[-1].system_prompt
    agents[-1].drive("Kansas City, MO", "Denver, CO")
    assert calls[-1][3] == 0  # the limit only applies in car mode

    assert client.post("/api/ask", json={"prompt": "x", "car_mode": True, "max_drive_miles_per_day": 5}).status_code == 422


def test_switching_car_mode_on_clears_flights_from_the_current_plan(fake_map, monkeypatch):
    class Quiet:
        system_prompt = "Roam"

        def __init__(self, kwargs):
            pass

        def __call__(self, prompt):
            return "Sure, I'll keep that in mind."  # no update_itinerary call

    monkeypatch.setattr(ask_router, "build_agent", lambda **kwargs: Quiet(kwargs))
    client = TestClient(app)
    current = car_plan()
    with_car = client.post("/api/ask", json={"prompt": "drive instead", "car_mode": True, "current_itinerary": current}).json()
    assert {"fly", "flight"}.isdisjoint(i["id"] for i in with_car["itinerary"]["items"])
    without_car = client.post("/api/ask", json={"prompt": "hi", "current_itinerary": current}).json()
    assert "itinerary" not in without_car


# ----- Map pins --------------------------------------------------------------------------------

TOWN = {"status": "ok", "name": "Kansas City, Missouri, United States", "lat": 39.0997, "lng": -94.5786}


def town_evidence():
    evidence = Evidence()
    evidence.add_point(TOWN)
    evidence.add_place({**REAL_PLACE, "address": "Main Street 1, 64105, Kansas City"})
    return evidence


def test_stops_sharing_the_town_center_lose_that_pin():
    """The bug: the model reused the city's coordinates for every stop, so every pin and link hit downtown."""
    city = {"lat": 39.0997, "lng": -94.5786}
    snapshot = ItinerarySnapshot.model_validate(plan(
        item("bbq", title="BBQ dinner", category="Food", location={"name": "Joe's Kansas City Bar-B-Que", **city}),
        item("museum", title="Art museum", location={"name": "Nelson-Atkins Museum of Art", **city}),
        item("jazz", title="Jazz night", location={"name": "Kansas City", **city}),
        item("walk", title="Walk", location={"name": "Kansas City", **city}),
        item("real", title="Real dinner", category="Food", sourceUrls=[OSM_URL], location={"name": "Trattoria Real"}),
    ))
    cleaned, notes = validate_snapshot(snapshot, town_evidence())
    by_id = {i.id: i for i in cleaned.items}
    assert all(by_id[k].location.lat is None for k in ("bbq", "museum"))
    # Name-only stops get the town added, so Google Maps searches in the right place.
    assert by_id["museum"].location.address == "Kansas City, Missouri, United States"
    # Stops whose only "location" was the town name have nothing specific to show.
    assert by_id["jazz"].location is None
    # A real looked-up place keeps its own pin and gets the tool's address.
    assert (by_id["real"].location.lat, by_id["real"].location.address) == (41.0, "Main Street 1, 64105, Kansas City")
    assert any("shared one generic map pin" in n for n in notes)


def test_one_stop_at_a_looked_up_landmark_keeps_its_pin():
    snapshot = ItinerarySnapshot.model_validate(plan(item("downtown", title="Explore downtown", location={"name": "Downtown", "lat": 39.0997, "lng": -94.5786})))
    cleaned, notes = validate_snapshot(snapshot, town_evidence())
    assert cleaned.items[0].location.lat == 39.0997
    assert not any("shared one generic map pin" in n for n in notes)


def test_two_meals_at_the_same_real_place_keep_their_pins():
    same = {"name": "Trattoria Real", "lat": 41.0, "lng": 17.2}
    snapshot = ItinerarySnapshot.model_validate(plan(
        item("lunch", title="Lunch", category="Food", sourceUrls=[OSM_URL], location=same),
        item("dinner", title="Dinner", category="Food", sourceUrls=[OSM_URL], location=same),
    ))
    cleaned, _ = validate_snapshot(snapshot, town_evidence())
    assert all(i.location.lat == 41.0 for i in cleaned.items)


def test_unpinned_stops_are_looked_up_in_the_trip_town(monkeypatch):
    import tools.places as places_module
    from pins import pin_stops
    from tools.places import GeoPoint

    found = {
        "Nelson-Atkins Museum of Art, Kansas City": GeoPoint(name="Nelson-Atkins", lat=39.0450, lng=-94.5809, source_url="https://www.openstreetmap.org/way/5"),
        "Union Station, Kansas City": GeoPoint(name="Union Station, Chicago", lat=41.8786, lng=-87.6403),  # wrong city
        "City Market, Kansas City": GeoPoint(name="Kansas City", lat=39.0998, lng=-94.5787),  # only matched the town
    }
    queries = []
    monkeypatch.setattr(places_module, "geocode", lambda q: queries.append(q) or found.get(q))
    city = {"lat": 39.0997, "lng": -94.5786}
    snapshot = ItinerarySnapshot.model_validate(plan(
        item("museum", title="Art museum", location={"name": "Nelson-Atkins Museum of Art", **city}),
        item("union", title="Union Station", location={"name": "Union Station", **city}),
        item("market", title="Brunch", category="Food", location={"name": "City Market", **city}),
        item("drive", title="Drive home", category="Driving", location={"name": "Lawrence"}),
    ))
    cleaned, notes = validate_snapshot(snapshot, town_evidence(), pinner=pin_stops)
    by_id = {i.id: i for i in cleaned.items}

    museum = by_id["museum"]
    assert (museum.location.lat, museum.sourceUrls) == (39.0450, ["https://www.openstreetmap.org/way/5"])
    assert by_id["union"].location.lat is None   # a match in another city is ignored
    assert by_id["market"].location.lat is None  # a match on the town center is ignored
    assert "Lawrence, Kansas City" not in queries  # driving legs are not looked up
    note = next(n for n in notes if "shared one generic map pin" in n)
    assert "Nelson-Atkins" not in note and '"Union Station"' in note


def test_lookup_limit_defaults_to_15_and_can_be_changed(monkeypatch):
    import tools.places as places_module
    from pins import max_lookups, pin_stops

    monkeypatch.delenv("ROAM_MAX_PIN_LOOKUPS", raising=False)
    assert max_lookups() == 15
    monkeypatch.setenv("ROAM_MAX_PIN_LOOKUPS", "not a number")
    assert max_lookups() == 15
    monkeypatch.setenv("ROAM_MAX_PIN_LOOKUPS", "2")
    queries = []
    monkeypatch.setattr(places_module, "geocode", lambda q: queries.append(q) or None)
    items = ItinerarySnapshot.model_validate(plan(*(item(f"s{n}", location={"name": f"Stop {n}"}) for n in range(5)))).items
    pin_stops(items, town_evidence())
    assert len(queries) == 2
