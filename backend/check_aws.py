"""Run inside Compose: python check_aws.py [--invoke]. Never prints credentials."""

import argparse
import os

import boto3
from botocore.config import Config

from agent import DEFAULT_MODEL_ID, build_agent
from aws_errors import aws_error_response


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--invoke", action="store_true", help="Make one small, billable Strands/Bedrock inference request")
    args = parser.parse_args()
    region = os.getenv("AWS_REGION", "").strip() or os.getenv("AWS_DEFAULT_REGION", "").strip() or "us-west-2"
    model = os.getenv("BEDROCK_MODEL_ID", "").strip() or DEFAULT_MODEL_ID
    print(f"Region: {region}\nModel: {model}")
    try:
        config = Config(connect_timeout=10, read_timeout=20, retries={"total_max_attempts": 1})
        boto3.client("sts", region_name=region, config=config).get_caller_identity()
        print("AWS credentials: authenticated")
        if "anthropic." in model:
            try:
                boto3.client("bedrock", region_name=region, config=config).get_use_case_for_model_access()
                print("Anthropic use-case form: submitted")
            except Exception as error:
                if getattr(error, "response", {}).get("Error", {}).get("Code") == "ResourceNotFoundException":
                    print("Anthropic use-case form: not submitted")
                    return 1
                print("Anthropic use-case form: could not inspect (invocation may still be allowed)")
        if not args.invoke:
            print("Inference not tested. Run again with --invoke to verify model access and quotas.")
            return 0
        agent = build_agent()
        agent.model.update_config(max_tokens=32)
        result = agent("Reply exactly: ROAM_AWS_OK")
        print(f"Strands/Bedrock reply: {result}")
        return 0
    except Exception as error:
        status, detail = aws_error_response(error)
        print(f"FAILED ({status}): {detail}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
