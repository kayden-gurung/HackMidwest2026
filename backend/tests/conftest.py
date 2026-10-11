import pytest

from tools import places


@pytest.fixture(autouse=True)
def no_retry_waits(monkeypatch):
    """Retries after a failed map lookup wait a few seconds in real use; tests do not."""
    monkeypatch.setattr(places, "RETRY_WAIT_S", 0)
