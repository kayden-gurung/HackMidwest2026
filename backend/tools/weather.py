"""Live daily forecasts worldwide, using Open-Meteo and the existing place lookup."""

from datetime import date, datetime, timezone

import httpx
from pydantic import BaseModel, ConfigDict, Field

from tools import places

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_TIMEOUT_S = 10.0
DAILY_FIELDS = ("temperature_2m_max", "temperature_2m_min", "precipitation_probability_max",
                "precipitation_sum", "wind_speed_10m_max")


class ForecastDay(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    date: date
    temperature_2m_max: float | None
    temperature_2m_min: float | None
    precipitation_probability_max: float | None = Field(ge=0, le=100)
    precipitation_sum: float | None = Field(ge=0)
    wind_speed_10m_max: float | None = Field(ge=0)


def fetch_forecast(near: str, start_date: str = "", end_date: str = "") -> dict:
    """Return sourced daily data or an explicit error; never substitute example weather."""
    try:
        start = date.fromisoformat(start_date) if start_date else None
        end = date.fromisoformat(end_date) if end_date else start
        if (start and start.isoformat() != start_date) or (end_date and end.isoformat() != end_date):
            raise ValueError
        if (end and not start) or (start and end < start):
            raise ValueError
    except ValueError:
        return {"status": "error", "message": "Use YYYY-MM-DD dates, with end_date on or after start_date."}
    try:
        point = places.geocode(near)
        if point is None:
            return {"status": "no_results", "message": f'Could not find "{near}".'}
        response = places._http().get(FORECAST_URL, params={
            "latitude": point.lat, "longitude": point.lng, "timezone": "auto",
            "forecast_days": 16 if start else 7, "daily": ",".join(DAILY_FIELDS),
            "temperature_unit": "celsius", "wind_speed_unit": "kmh", "precipitation_unit": "mm",
        }, timeout=FORECAST_TIMEOUT_S)
        response.raise_for_status()
        data = response.json()
        daily = data["daily"]
        days = [ForecastDay(date=day, **dict(zip(DAILY_FIELDS, values))).model_dump(mode="json")
                for day, *values in zip(daily["time"], *(daily[key] for key in DAILY_FIELDS), strict=True)]
        if not days or not data["timezone"]:
            raise ValueError("Missing forecast coverage")
        coverage = {"coverage_start": days[0]["date"], "coverage_end": days[-1]["date"]}
        metadata = {"source": "Open-Meteo", "location": point.name, "timezone": data["timezone"],
                    "retrieved_at": datetime.now(timezone.utc).isoformat(), "source_urls": [str(response.url)],
                    "units": {key: data["daily_units"][key] for key in DAILY_FIELDS}, **coverage}
        if start and (start.isoformat() < coverage["coverage_start"] or end.isoformat() > coverage["coverage_end"]):
            return {"status": "out_of_range", **metadata,
                    "message": "Requested dates are outside the live forecast window. Do not invent weather for those dates."}
        selected = [day for day in days if not start or start.isoformat() <= day["date"] <= end.isoformat()]
        return {"status": "ok", **metadata, "daily": selected,
                "assumptions": ["Forecasts can change; null values mean unavailable data.",
                                "Daily totals describe the whole local day, not the weather at a specific activity time."]}
    except (places.PlacesUnavailable, httpx.HTTPError, ValueError, KeyError, TypeError):
        return {"status": "unavailable", "message": "The weather or location service is not responding with usable data. Try again shortly."}
