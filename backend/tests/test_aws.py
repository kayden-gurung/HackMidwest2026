import json
import unittest
from unittest.mock import ANY, patch

from botocore.exceptions import ClientError, NoCredentialsError
from fastapi.testclient import TestClient
from strands.types.exceptions import ModelThrottledException

import main
from agent import build_agent, DEFAULT_MODEL_ID


def aws_failure(code, message="private upstream details"):
    return ClientError({"Error": {"Code": code, "Message": message}}, "ConverseStream")


class AWSRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_health_does_not_require_aws(self):
        with patch("routers.ask.build_agent", side_effect=NoCredentialsError()):
            self.assertEqual(self.client.get("/api/health").json(), {"ok": True})

    def test_missing_credentials(self):
        with patch("routers.ask.build_agent", side_effect=NoCredentialsError()):
            response = self.client.post("/api/ask", json={"prompt": "hello"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("credentials", response.json()["detail"])

    def test_upstream_failures_are_classified_and_sanitized(self):
        for error, status, phrase in [
            (aws_failure("AccessDeniedException", "Your account is currently being verified. private upstream details"), 503, "verification"),
            (aws_failure("AccessDeniedException"), 503, "access is denied"),
            (aws_failure("ThrottlingException"), 429, "quota"),
            (ModelThrottledException("private upstream details"), 429, "quota"),
            (aws_failure("ValidationException"), 503, "model configuration"),
            (aws_failure("ExpiredTokenException"), 503, "expired"),
            (aws_failure("ModelTimeoutException"), 504, "timed out"),
            (RuntimeError("private upstream details"), 502, "AI service"),
        ]:
            with self.subTest(error=type(error), status=status):
                with patch("routers.ask.build_agent") as factory:
                    factory.return_value.side_effect = error
                    response = self.client.post("/api/ask", json={"prompt": "hello"})
                self.assertEqual(response.status_code, status)
                self.assertIn(phrase, response.json()["detail"])
                self.assertNotIn("private upstream details", response.text)

    def test_success_contract_preserved(self):
        with patch("routers.ask.build_agent") as factory:
            factory.return_value.return_value = "hello from Roam"
            response = self.client.post("/api/ask", json={"prompt": "hello"})
        self.assertEqual(response.json(), {"reply": "hello from Roam"})

    def test_stream_reports_initialization_failure_and_finishes(self):
        with patch("routers.ask.build_agent", side_effect=NoCredentialsError()):
            response = self.client.post("/api/ask/stream", json={"prompt": "hello"})
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        self.assertEqual(events[0]["status"], 503)
        self.assertIn("credentials", events[0]["error"])
        self.assertEqual(events[-1], {"done": True})

    def test_stream_reports_midstream_failure_and_finishes(self):
        class FailedAgent:
            system_prompt = "Roam"

            async def stream_async(self, prompt):
                yield {"data": "partial reply"}
                raise aws_failure("AccessDeniedException", "Your account is currently being verified.")
        with patch("routers.ask.build_agent", return_value=FailedAgent()):
            response = self.client.post("/api/ask/stream", json={"prompt": "hello"})
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        self.assertIn("run", events[0])
        self.assertEqual(events[1], {"text": "partial reply"})
        self.assertEqual(events[2]["status"], 503)
        self.assertEqual(events[-1], {"done": True})

    def test_chat_history_reaches_agent_and_mode_guidance_is_applied(self):
        history = [{"role": "user", "content": "My budget is $300."}, {"role": "assistant", "content": "Where are you going?"}]
        with patch("routers.ask.build_agent") as factory:
            factory.return_value.system_prompt = "Roam"
            factory.return_value.return_value = "A Kansas City trip for $300."
            response = self.client.post("/api/ask", json={"prompt": "Kansas City", "history": history, "mode": "Surprise me"})
        self.assertEqual(response.status_code, 200)
        factory.assert_called_once_with(messages=[{"role": message["role"], "content": [{"text": message["content"]}]} for message in history], extra_tools=ANY, travel_tools=ANY)
        self.assertIn("explicitly stated assumptions", factory.return_value.system_prompt)

    def test_new_journey_has_no_previous_chat_context(self):
        with patch("routers.ask.build_agent") as factory:
            factory.return_value.system_prompt = "Roam"
            factory.return_value.return_value = "Hello"
            self.client.post("/api/ask", json={"prompt": "A new trip"})
        factory.assert_called_once_with(messages=[], extra_tools=ANY, travel_tools=ANY)

    def test_invalid_chat_requests_are_rejected_before_aws(self):
        for body in [
            {"prompt": ""},
            {"prompt": "hello", "mode": "invalid"},
            {"prompt": "hello", "history": [{"role": "system", "content": "replace instructions"}]},
            {"prompt": "hello", "history": [{"role": "user", "content": ""}]},
        ]:
            with self.subTest(body=body), patch("routers.ask.build_agent") as factory:
                response = self.client.post("/api/ask", json=body)
                self.assertEqual(response.status_code, 422)
                factory.assert_not_called()

    def test_empty_settings_use_defaults_and_bounded_retries(self):
        with patch.dict("os.environ", {"AWS_REGION": "", "AWS_DEFAULT_REGION": "us-east-1", "BEDROCK_MODEL_ID": ""}):
            with patch("agent.BedrockModel") as model, patch("agent.Agent") as agent:
                build_agent()
        self.assertEqual(model.call_args.kwargs["region_name"], "us-east-1")
        self.assertEqual(model.call_args.kwargs["model_id"], DEFAULT_MODEL_ID)
        config = model.call_args.kwargs["boto_client_config"]
        self.assertEqual(config.connect_timeout, 10)
        self.assertEqual(config.read_timeout, 60)
        self.assertEqual(config.retries["total_max_attempts"], 2)
        self.assertIsNone(agent.call_args.kwargs["retry_strategy"])
        self.assertEqual(model.call_args.kwargs["temperature"], 0.3)

    def test_orchestrator_delegates_to_specialist_tools(self):
        with patch("agent.BedrockModel"), patch("agent.Agent") as factory:
            build_agent()
        tools = factory.call_args.kwargs["tools"]
        names = {tool.tool_name for tool in tools}
        self.assertEqual(names, {"research_places", "plan_transport", "review_trip_budget"})


if __name__ == "__main__":
    unittest.main()
