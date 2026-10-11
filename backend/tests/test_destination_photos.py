"""Destination images use exact map identities and stay optional during outages."""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import places as places_router
from tools import destination_photos as photos, places


IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/St_Louis_skyline.jpg/960px-St_Louis_skyline.jpg"


@pytest.fixture
def services(monkeypatch):
    state = {
        "records": [{"extratags": {"wikipedia": "en:St. Louis"}}],
        "payload": {"query": {"pages": [{
            "title": "St. Louis", "thumbnail": {"source": IMAGE_URL}, "pageimage": "St Louis skyline.jpg",
        }]}},
        "status": 200, "calls": [],
    }

    def handler(request):
        state["calls"].append(request)
        if request.url.host == "nominatim.openstreetmap.org":
            return httpx.Response(200, json=state["records"])
        return httpx.Response(state["status"], json=state["payload"])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(places, "_client", client)
    monkeypatch.setattr(places, "NOMINATIM_MIN_INTERVAL_S", 0)
    photos.clear_cache()
    yield state
    photos.clear_cache()
    client.close()


def test_photo_uses_the_complete_destination_and_free_wikipedia_image(services):
    photo = photos.destination_photo("  St. Louis,   MO  ")
    assert photo is not None
    assert photo.image_url == IMAGE_URL
    assert photo.image_alt == "View of St. Louis"
    assert photo.source_url == "https://en.wikipedia.org/wiki/File:St_Louis_skyline.jpg"
    locate, image = services["calls"]
    assert locate.url.params["q"] == "St. Louis, MO"
    assert locate.url.params["extratags"] == "1" and locate.url.params["limit"] == "1"
    assert image.url.host == "en.wikipedia.org"
    assert image.url.params["titles"] == "St. Louis"
    assert image.url.params["prop"] == "pageimages|pageprops"
    assert image.url.params["pilicense"] == "free"
    assert image.extensions["timeout"]["read"] == photos.PHOTO_TIMEOUT_S


@pytest.mark.parametrize("destination,title", [
    ("Springfield, MO", "Springfield, Missouri"),
    ("Springfield, IL", "Springfield, Illinois"),
    ("Kansas City, MO", "Kansas City, Missouri"),
    ("Kansas City, KS", "Kansas City, Kansas"),
])
def test_same_name_cities_keep_the_map_record_identity(services, destination, title):
    services["records"] = [{"extratags": {"wikipedia": f"en:{title}"}}]
    assert photos.destination_photo(destination) is not None
    assert services["calls"][0].url.params["q"] == destination
    assert services["calls"][1].url.params["titles"] == title


def test_distinct_states_are_cached_separately(services):
    services["records"] = [{"extratags": {"wikipedia": "en:Springfield, Missouri"}}]
    photos.destination_photo("Springfield, MO")
    services["records"] = [{"extratags": {"wikipedia": "en:Springfield, Illinois"}}]
    photos.destination_photo("Springfield, IL")
    assert [request.url.params["titles"] for request in services["calls"] if "titles" in request.url.params] == [
        "Springfield, Missouri", "Springfield, Illinois",
    ]
    photos.destination_photo("  springfield, MO ")
    assert len(services["calls"]) == 4


def test_current_wikimedia_thumbnail_host_is_supported(services):
    thumbnail = IMAGE_URL.replace("upload.wikimedia.org", "thumb.wikimedia.org") + "?utm_source=en.wikipedia.org"
    services["payload"]["query"]["pages"][0]["thumbnail"]["source"] = thumbnail
    assert photos.destination_photo("St. Louis, MO").image_url == thumbnail


@pytest.mark.parametrize("records", [[], [{}], [{"extratags": {}}], [{"extratags": {"wikipedia": "malformed"}}]])
def test_missing_map_article_never_searches_an_unrelated_place(services, records):
    services["records"] = records
    assert photos.destination_photo("Unknown place, MO") is None
    assert len(services["calls"]) == 1
    assert photos.destination_photo("unknown place, mo") is None
    assert len(services["calls"]) == 1


@pytest.mark.parametrize("article", ["evil.example:Springfield", "en:City|Another city", "https://evil.example:City"])
def test_upstream_article_cannot_change_the_host_or_query_more_pages(services, article):
    services["records"] = [{"extratags": {"wikipedia": article}}]
    assert photos.destination_photo("Springfield, MO") is None
    assert len(services["calls"]) == 1


@pytest.mark.parametrize("url", [
    "javascript:alert(1)",
    "https://upload.wikimedia.org.evil.example/wikipedia/commons/photo.jpg",
    "https://evil.example/wikipedia/commons/photo.jpg",
    "http://upload.wikimedia.org/wikipedia/commons/photo.jpg",
    "https://user@upload.wikimedia.org/wikipedia/commons/photo.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/City_map.svg",
])
def test_only_https_wikimedia_raster_images_are_returned(services, url):
    services["payload"]["query"]["pages"][0]["thumbnail"]["source"] = url
    assert photos.destination_photo("St. Louis, MO") is None


def test_missing_photo_or_disambiguation_page_is_not_used(services):
    page = services["payload"]["query"]["pages"][0]
    page["pageprops"] = {"disambiguation": ""}
    assert photos.destination_photo("St. Louis, MO") is None
    photos.clear_cache()
    page.pop("pageprops")
    page.pop("thumbnail")
    assert photos.destination_photo("St. Louis, MO") is None


def test_upstream_outage_is_safe_and_can_be_retried(services):
    services["status"] = 503
    with pytest.raises(photos.PhotosUnavailable, match="temporarily unavailable"):
        photos.destination_photo("St. Louis, MO")
    services["status"] = 200
    assert photos.destination_photo("St. Louis, MO") is not None
    assert len(services["calls"]) == 4


def test_geocoder_timeout_is_safe(services, monkeypatch):
    def timeout(*args, **kwargs):
        raise httpx.ReadTimeout("provider timed out")

    monkeypatch.setattr(places, "nominatim_request", timeout)
    with pytest.raises(photos.PhotosUnavailable, match="temporarily unavailable"):
        photos.destination_photo("St. Louis, MO")
    assert not services["calls"]


def test_negative_cache_expires_and_cache_is_bounded(services, monkeypatch):
    clock = [photos.monotonic()]
    monkeypatch.setattr(photos, "monotonic", lambda: clock[0])
    monkeypatch.setattr(photos, "PHOTO_CACHE_SIZE", 2)
    services["records"] = []
    assert photos.destination_photo("City one") is None
    clock[0] += photos.MISSING_PHOTO_TTL_S + 1
    services["records"] = [{"extratags": {"wikipedia": "en:St. Louis"}}]
    assert photos.destination_photo("City one") is not None
    photos.destination_photo("City two")
    photos.destination_photo("City three")
    assert list(photos._photo_cache) == ["city two", "city three"]


def test_photo_endpoint_returns_photo_null_or_safe_outage(services):
    app = FastAPI()
    app.include_router(places_router.router)
    client = TestClient(app)
    response = client.get("/api/places/photo", params={"q": "St. Louis, MO"})
    assert response.status_code == 200
    assert response.json()["image_url"] == IMAGE_URL
    assert response.json()["source_url"].startswith("https://en.wikipedia.org/wiki/File:")
    services["records"] = []
    assert client.get("/api/places/photo", params={"q": "Unknown city"}).json() is None
    services["records"] = [{"extratags": {"wikipedia": "en:St. Louis"}}]
    services["status"] = 503
    response = client.get("/api/places/photo", params={"q": "Another city"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Destination photos are temporarily unavailable."}
    assert client.get("/api/places/photo", params={"q": "a"}).status_code == 422
    assert client.get("/api/places/photo", params={"q": "a" * 201}).status_code == 422
