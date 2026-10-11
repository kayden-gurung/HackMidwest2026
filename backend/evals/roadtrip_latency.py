"""Measure real road-trip SSE/hook timings without changing the running app's model.

python evals/roadtrip_latency.py --output /tmp/roadtrip-timing.json
python evals/roadtrip_latency.py --in-process --model-id MODEL_ID --output /tmp/model-timing.json
An in-process model override affects this benchmark process only, not the server or .env.
"""

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import httpx


def default_request():
    return {
        "prompt": "\n".join([
            "Plan a one-way drive from Kansas City, MO to St. Louis, MO for one traveler.",
            "Interests: History, Small towns, Local food, Nature.",
            "Departure: Flexible. If flexible, assume today and state the date.",
            "There is no spending limit set. Use null for unknown meal, activity and lodging prices.",
            "Choose two to four verified, worthwhile stops along the route,",
            "within the total extra driving-time limit. Allow enough days for the daily driving limit.",
            "Create a complete drive itinerary. If live data is unavailable, say so."]),
        "history": [], "mode": "Co-pilot",
        "preferences": {"interests": ["History", "Small towns", "Local food", "Nature"], "currency": "USD"},
        "car_mode": True, "max_drive_miles_per_day": 450, "trip_types": [],
        "road_trip": {"origin": "Kansas City, MO", "destination": "St. Louis, MO",
                      "detour_minutes": 60, "mpg": 28, "gas_price": 3.25},
    }


def measure(client, body, buffered=False):
    started = time.perf_counter()
    trace, tools, models, pending = [], [], defaultdict(list), {}
    result, timing = {}, {}
    with client.stream("POST", "/api/ask/stream", json=body) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if not line.startswith("data: "):
                continue
            payload = json.loads(line[6:])
            elapsed = time.perf_counter() - started
            event = payload.get("xray")
            if event:
                event = {key: value for key, value in event.items() if key not in {"id", "call_id"}}
                trace.append(event)
                role, kind = event["agent"], event["kind"]
                stamp = datetime.fromisoformat(event["timestamp"]).timestamp()
                if kind == "model_started":
                    pending[role] = stamp
                elif kind == "model_finished" and role in pending:
                    models[role].append(stamp - pending.pop(role))
                elif kind == "tool_finished":
                    tools.append({"agent": role, "tool": event["tool"], "seconds": (event.get("duration_ms") or 0) / 1000,
                                  "status": event.get("status")})
                    print(f"{elapsed:.1f}s {event['tool']}: {event.get('duration_ms')}ms", flush=True)
            if not buffered:
                for key in ("text", "approval", "itinerary"):
                    if key in payload:
                        timing.setdefault(f"first_{key}_seconds", elapsed)
            for key in ("reply", "itinerary", "error", "status"):
                if key in payload:
                    result[key] = payload[key]
            if "approval" in payload:
                # Do not save the live capability or opaque interrupt IDs in benchmark artifacts.
                result["proposal"] = payload["approval"]["interrupts"][0]["reason"]
            if payload.get("done"):
                result["completed"] = True
                break
    timing["total_seconds"] = time.perf_counter() - started
    if not result.get("completed"):
        raise RuntimeError("The stream ended early; this is not a completed latency sample.")
    return {"timing": timing, "buffered_client": buffered,
            "model_calls": sum(len(spans) for spans in models.values()),
            "model_seconds": sum(sum(spans) for spans in models.values()),
            "models": dict(models), "tools": tools, "trace": trace, "result": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--request", type=Path, help="A JSON AskRequest, e.g. an existing-trip revision")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--in-process", action="store_true", help="Run a separate test app with inherited AWS credentials")
    parser.add_argument("--model-id", help="Benchmark-only model override; requires --in-process")
    args = parser.parse_args()
    if args.model_id and not args.in_process:
        parser.error("--model-id requires --in-process; the running server is never reconfigured")
    body = json.loads(args.request.read_text()) if args.request else default_request()
    if args.in_process:
        if args.model_id:
            os.environ["BEDROCK_MODEL_ID"] = args.model_id
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from fastapi.testclient import TestClient
        from main import app
        with TestClient(app) as client:
            report = measure(client, body, buffered=True)
        from agent import DEFAULT_MODEL_ID
        report["model_id"] = os.getenv("BEDROCK_MODEL_ID", "").strip() or DEFAULT_MODEL_ID
    else:
        with httpx.Client(base_url=args.base_url, timeout=320) as client:
            report = measure(client, body)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2))
    print(json.dumps({key: report[key] for key in ("timing", "model_calls", "model_seconds")}))
    if "error" in report["result"]:
        print(report["result"]["error"], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
