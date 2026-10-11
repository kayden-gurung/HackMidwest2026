"""Optional destination photos, anchored to the exact place's Wikipedia record.

Photo lookup is separate from route planning: a missing photo never changes a drive.
Nominatim supplies the article identity; Wikimedia supplies a freely licensed image.
"""

from collections import OrderedDict
import re
import threading
from time import monotonic
from urllib.parse import quote, urlsplit

import httpx
from pydantic import BaseModel

from tools import places


PHOTO_TIMEOUT_S = 5.0
PHOTO_CACHE_SIZE = 256
PHOTO_CACHE_TTL_S = 24 * 60 * 60
MISSING_PHOTO_TTL_S = 5 * 60


class DestinationPhoto(BaseModel):
    image_url: str
    image_alt: str
    # The selected file's description page includes its creator and license.
    source_url: str


class PhotosUnavailable(Exception):
    """The photo providers could not be reached. Safe to display to the traveler."""


_photo_cache: OrderedDict[str, tuple[float, DestinationPhoto | None]] = OrderedDict()
_cache_lock = threading.Lock()


def _remember(key: str, photo: DestinationPhoto | None) -> DestinationPhoto | None:
    ttl = PHOTO_CACHE_TTL_S if photo is not None else MISSING_PHOTO_TTL_S
    with _cache_lock:
        _photo_cache[key] = (monotonic() + ttl, photo)
        _photo_cache.move_to_end(key)
        while len(_photo_cache) > PHOTO_CACHE_SIZE:
            _photo_cache.popitem(last=False)
    return photo


def _article(record: object) -> tuple[str, str] | None:
    if not isinstance(record, dict) or not isinstance(record.get("extratags"), dict):
        return None
    value = record["extratags"].get("wikipedia")
    if not isinstance(value, str) or ":" not in value or "://" in value:
        return None
    language, title = value.split(":", 1)
    title = title.strip()
    # The host is constructed only from a language code, never an upstream URL.
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,19}", language) or not title or len(title) > 300:
        return None
    if "|" in title or any(ord(char) < 32 for char in title):
        return None
    return language, title


def _image_url(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        url = urlsplit(value)
    except ValueError:
        return None
    if url.scheme != "https" or url.netloc not in {"upload.wikimedia.org", "thumb.wikimedia.org"} or not url.path.startswith("/wikipedia/"):
        return None
    # PageImages can also return flags, maps and SVG icons. Do not render vectors as photos.
    if not url.path.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".avif")):
        return None
    return value


def destination_photo(query: str) -> DestinationPhoto | None:
    """A verified place's photo, None when absent, or PhotosUnavailable on an outage.

    Never search a shortened city name: Springfield, MO and Springfield, IL must
    resolve to the separate Wikipedia tags attached to their exact map records.
    """
    query = " ".join(query.split())
    if not query:
        return None
    key = query.casefold()
    with _cache_lock:
        cached = _photo_cache.get(key)
        if cached is not None:
            if cached[0] > monotonic():
                _photo_cache.move_to_end(key)
                return cached[1]
            del _photo_cache[key]

    try:
        records = places.nominatim_request(places.NOMINATIM_URL, {
            "q": query, "format": "jsonv2", "limit": 1, "extratags": 1,
        })
        article = _article(records[0]) if isinstance(records, list) and records else None
        if article is None:
            return _remember(key, None)
        language, title = article
        response = places._http().get(f"https://{language}.wikipedia.org/w/api.php", params={
            "action": "query", "format": "json", "formatversion": 2, "redirects": 1,
            "prop": "pageimages|pageprops", "titles": title,
            "piprop": "thumbnail|name", "pithumbsize": 960, "pilicense": "free",
        }, timeout=PHOTO_TIMEOUT_S)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or "error" in payload:
            raise ValueError("Invalid photo response")
    except (httpx.HTTPError, ValueError) as error:
        # Do not cache outages as missing photos: the next visit can retry.
        raise PhotosUnavailable("Destination photos are temporarily unavailable.") from error

    pages = payload.get("query", {}).get("pages", []) if isinstance(payload.get("query"), dict) else []
    page = pages[0] if isinstance(pages, list) and len(pages) == 1 and isinstance(pages[0], dict) else {}
    thumbnail = page.get("thumbnail")
    image = _image_url(thumbnail.get("source")) if isinstance(thumbnail, dict) else None
    filename = page.get("pageimage")
    properties = page.get("pageprops")
    if (image is None or not isinstance(filename, str) or not filename.strip()
            or "missing" in page or (isinstance(properties, dict) and "disambiguation" in properties)):
        return _remember(key, None)
    page_title = page.get("title")
    name = page_title if isinstance(page_title, str) and page_title.strip() else title
    photo = DestinationPhoto(image_url=image, image_alt=f"View of {name}",
        source_url=f"https://{language}.wikipedia.org/wiki/File:{quote(filename.replace(' ', '_'), safe='')}")
    return _remember(key, photo)


def clear_cache() -> None:
    with _cache_lock:
        _photo_cache.clear()
