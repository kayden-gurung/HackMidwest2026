"""Map lookup fixes: saved answers on disk, the Photon backup, and the Overpass backup search."""

import gzip
import json
from datetime import date

import httpx
import pytest

from evidence import Evidence, evidence_from_snapshot
from itinerary import ItinerarySnapshot, Location, PlanBudget, PlanItem
from tools import places
from validation import validate_snapshot

TIMED_OUT = {"elements": [{"type": "node", "id": 1}],
             "remark": 'runtime error: Query timed out in "query" at line 1 after 26 seconds.'}


def test_saved_answers_are_reused_without_the_network(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"elements": [{"type": "node", "id": 1}]})

    client = httpx.Client(transport=places.DiskCacheTransport(httpx.MockTransport(handler), tmp_path))
    first = client.post("https://overpass-api.de/api/interpreter", data={"data": "query"})
    again = client.post("https://overpass-api.de/api/interpreter", data={"data": "query"})
    client.post("https://overpass-api.de/api/interpreter", data={"data": "another query"})
    assert first.json() == again.json() and again.headers["x-roam-cache"] == "hit"
    assert len(calls) == 2


def test_failures_and_cut_short_overpass_answers_are_never_saved(tmp_path):
    failing = httpx.Client(transport=places.DiskCacheTransport(httpx.MockTransport(lambda r: httpx.Response(504)), tmp_path / "a"))
    assert failing.get("https://example.org/x").status_code == 504
    cut_short = httpx.Client(transport=places.DiskCacheTransport(
        httpx.MockTransport(lambda r: httpx.Response(200, json=TIMED_OUT)), tmp_path / "b"))
    assert cut_short.post("https://overpass-api.de/api/interpreter", data={"data": "q"}).json() == TIMED_OUT
    assert not list(tmp_path.rglob("*.json"))
    assert places.overpass_failed(json.dumps(TIMED_OUT))
    assert not places.overpass_failed(json.dumps({"elements": [], "remark": "note: fine"}))


def test_compressed_answers_pass_through_the_disk_cache(tmp_path):
    """Real servers send gzip. The cache hands on the already-decompressed body, so it must drop the
    Content-Encoding header, or httpx decompresses twice (DecodingError)."""
    body = json.dumps({"code": "Ok", "routes": []}).encode()
    client = httpx.Client(transport=places.DiskCacheTransport(httpx.MockTransport(
        lambda r: httpx.Response(200, content=gzip.compress(body), headers={"content-encoding": "gzip", "content-type": "application/json"})),
        tmp_path))
    assert client.get("https://router.project-osrm.org/route/x").json() == {"code": "Ok", "routes": []}  # fresh
    assert client.get("https://router.project-osrm.org/route/x").json() == {"code": "Ok", "routes": []}  # saved


def test_saved_nominatim_answers_skip_the_one_a_second_wait(tmp_path, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=[{"display_name": "Salina, Kansas", "lat": "38.84", "lon": "-97.61"}])

    monkeypatch.setattr(places, "_client", httpx.Client(transport=places.DiskCacheTransport(httpx.MockTransport(handler), tmp_path)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 5)  # a real wait would make this test slow
    places.clear_caches()
    places.geocode("Salina, KS")
    places.clear_caches()  # forget the in-memory answer: the disk one must be used, with no wait
    import time
    began = time.monotonic()
    assert places.geocode("Salina, KS").lat == 38.84
    assert len(calls) == 1 and time.monotonic() - began < 1
    places.clear_caches()


def test_city_lookup_falls_back_to_photon_when_nominatim_refuses(monkeypatch):
    state = {"photon_up": True}

    def handler(request):
        if "nominatim" in request.url.host:
            return httpx.Response(429, text="Too Many Requests")  # a throttled shared network
        if not state["photon_up"]:
            return httpx.Response(503)
        if request.url.path.endswith("/reverse"):
            return httpx.Response(200, json={"features": [{"geometry": {"coordinates": [-97.6, 38.84]},
                                                          "properties": {"type": "city", "name": "Salina", "state": "Kansas"}}]})
        return httpx.Response(200, json={"features": [{"geometry": {"coordinates": [-97.6114, 38.8403]},
                                                       "properties": {"osm_type": "R", "osm_id": 128123, "name": "Salina",
                                                                      "state": "Kansas", "country": "United States", "type": "city"}}]})

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    places.clear_caches()
    point = places.geocode("Salina, KS")
    assert (point.lat, point.lng, point.kind) == (38.8403, -97.6114, "city")
    assert point.source_url == "https://www.openstreetmap.org/relation/128123"
    assert places.town_at(38.84, -97.6) == "Salina, Kansas"
    # Both down: say the service is unavailable, never "unknown city".
    places.clear_caches()
    state["photon_up"] = False
    with pytest.raises(places.PlacesUnavailable):
        places.geocode("Salina, KS")
    places.clear_caches()


def test_overpass_backup_search_keeps_node_coordinates():
    """"out tags center" leaves out node coordinates, which dropped most restaurants and attractions."""
    query = places._overpass_query("Food", 38.84, -97.61, 3000, None, fetch=80)
    assert "out center" in query and "out tags" not in query


def test_overpass_backup_search_skips_a_cut_short_answer(monkeypatch):
    tried = []

    def handler(request):
        if "nominatim" in request.url.host:
            if "q" in request.url.params and request.url.params.get("bounded"):
                return httpx.Response(200, json=[])  # the fast path finds nothing: Overpass is the backup
            return httpx.Response(200, json=[{"display_name": "Salina", "lat": "38.84", "lon": "-97.61"}])
        tried.append(request.url.host)
        if request.url.host == "overpass-api.de":
            return httpx.Response(200, json=TIMED_OUT)
        return httpx.Response(200, json={"elements": [
            {"type": "node", "id": 7, "lat": 38.841, "lon": -97.611, "tags": {"amenity": "restaurant", "name": "Diner"}}]})

    monkeypatch.setattr(places, "_client", httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    places.clear_caches()
    found = places.search_places("Salina, KS", "Food")
    assert [p.name for p in found] == ["Diner"] and tried == ["overpass-api.de", "overpass.kumi.systems"]
    places.clear_caches()


def test_revising_a_plan_with_driving_days_does_not_report_removed_pins():
    """The chat checks every plan again on each revision. A driving leg's end pin comes from its route,
    so it must not be reported as "Removed map pins" (it was, then silently put back)."""
    link = "https://www.google.com/maps/dir/?api=1&origin=Kansas+City&destination=Salina"
    plan = ItinerarySnapshot(
        startDate=date(2026, 10, 17), endDate=date(2026, 10, 17), budget=PlanBudget(plannedUsd=None),
        items=[PlanItem(id="drive-1", date=date(2026, 10, 17), title="Drive Kansas City → Salina", category="Driving",
                        location=Location(name="Salina", lat=38.84, lng=-97.61), websiteUrl=link,
                        route=[[39.1, -94.58], [38.84, -97.61]])],
    )
    cleaned, notes = validate_snapshot(plan, evidence_from_snapshot(plan), car_mode=True)
    assert not [n for n in notes if n.startswith("Removed")]
    assert cleaned.items[0].location.lat == 38.84 and cleaned.items[0].route == [[39.1, -94.58], [38.84, -97.61]]
    assert isinstance(Evidence(), Evidence)
