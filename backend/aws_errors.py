"""Translate AWS failures into useful messages without exposing upstream details."""

from botocore.exceptions import (
    ClientError, ConnectTimeoutError, EndpointConnectionError,
    NoCredentialsError, PartialCredentialsError, ReadTimeoutError,
)
from strands.types.exceptions import ModelThrottledException


def aws_error_response(error: Exception) -> tuple[int, str]:
    if isinstance(error, (NoCredentialsError, PartialCredentialsError)):
        return 503, "AWS credentials are missing or incomplete. Configure backend/.env and recreate the backend container."
    if isinstance(error, (ConnectTimeoutError, ReadTimeoutError)):
        return 504, "Amazon Bedrock timed out. Try again shortly."
    if isinstance(error, EndpointConnectionError):
        return 503, "Cannot connect to Amazon Bedrock. Check the AWS region and network connection."
    if isinstance(error, ClientError):
        detail = error.response.get("Error", {})
        code = detail.get("Code", "")
        message = detail.get("Message", "").lower()
        if code in {"UnrecognizedClientException", "InvalidClientTokenId", "SignatureDoesNotMatch", "ExpiredTokenException", "ExpiredToken"}:
            return 503, "AWS credentials are invalid or expired. Update backend/.env and recreate the backend container."
        if code == "AccessDeniedException":
            if "being verified" in message:
                return 503, "AWS account verification is pending. Wait for AWS to finish; if it remains blocked, contact AWS Support."
            return 503, "Bedrock access is denied. Check model access, the Anthropic use-case form, and IAM permissions."
        if code in {"ThrottlingException", "throttlingException", "ServiceQuotaExceededException"}:
            return quota_error()
        if code in {"ValidationException", "ResourceNotFoundException"}:
            return 503, "Bedrock model configuration is unavailable. Check BEDROCK_MODEL_ID, its inference profile, and AWS_REGION."
        if code in {"ModelTimeoutException", "modelTimeoutException"}:
            return 504, "Amazon Bedrock timed out. Try again shortly."
    if isinstance(error, ModelThrottledException):
        return quota_error()
    return 502, "The AI service could not complete the request. Try again shortly."


def quota_error() -> tuple[int, str]:
    return 429, "Bedrock request or token quota is exhausted. Check the model's approved quotas in the AWS console; zero quotas require AWS account access or a quota increase."
