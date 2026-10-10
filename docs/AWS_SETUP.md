# Roam AWS / Strands setup

AWS runs behind the FastAPI backend. The frontend must never receive AWS keys.
The local Compose backend uses `backend/.env`; it does not inherit host AWS
profiles automatically. Keep this file out of Git and Docker build contexts.

## Configure and start

Copy `backend/.env.example` to `backend/.env` only on first setup, then fill in
the credentials. Long-lived IAM keys do not need an `AWS_SESSION_TOKEN`;
temporary credentials need all three fields. Use `AWS_REGION=us-west-2` and
`BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0` for the current
Claude configuration. A model ID is not proof that the account can invoke it.

```sh
chmod 600 backend/.env
docker compose up -d --build
```

After changing `.env`, recreate the backend. A restart alone keeps the old
container environment:

```sh
docker compose up -d --force-recreate backend
```

## Verify credentials and inference separately

```sh
docker compose exec -T backend python check_aws.py
docker compose exec -T backend python check_aws.py --invoke
```

The first command checks credentials and the Anthropic form without generating
text. The second makes a small billable request through the actual Strands
agent. Only a successful invocation establishes that the model works.
`/api/health` checks the web server, not Bedrock access.

You can also check the app endpoints:

```sh
curl http://localhost:8000/api/health
curl -H 'Content-Type: application/json' -d '{"prompt":"Say hello to Roam."}' http://localhost:8000/api/ask
curl -N -H 'Content-Type: application/json' -d '{"prompt":"Say hello to Roam."}' http://localhost:8000/api/ask/stream
```

## Resolve AWS blockers

| Result | Action |
| --- | --- |
| Missing, invalid or expired credentials | Update the backend environment, including the session token for temporary credentials, and recreate the container. |
| Account verification pending | Wait for AWS verification. If still blocked, use AWS Support or the on-site AWS representative. Changing agent code cannot finish account verification. |
| Access denied | Check IAM permissions for `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`, model availability, and Anthropic's first-use form. Cross-region profiles also need permission on their destination foundation models. |
| Request/token quota exhausted | Inspect the applied quotas for the selected model and region in Bedrock → Quotas. A default quota is not the applied account quota. An applied value of zero requires AWS to enable access or approve a quota increase. |
| Model configuration unavailable | Check the model ID or inference profile and region. Some models require an inference profile rather than a direct foundation-model ID. |

For Anthropic, submit a truthful, non-sensitive project description in Bedrock
→ Model catalog → Submit use case details. Use the public project URL; do not
include credentials or personal information. Access may remain pending after
submission. First use of a third-party model can initiate its Marketplace
agreement; review the applicable terms.

During initial setup on October 10, 2026, the local credentials authenticated
and the Roam use-case form was submitted successfully. Inference was initially
blocked: Claude in Oregon reported account verification pending; Nova in Oregon
and Claude/Nova in Virginia reported throttling. The console showed applied
Sonnet 4.5 cross-region quotas of 0 TPM and 0 RPM. The account was on the Free
plan; this observation alone did not establish the cause of the zero quotas.
An account verification support case was submitted with the user's approval.

By 4:08 PM America/Chicago on October 10, live checks succeeded: the Strands
smoke test returned `ROAM_AWS_OK`, both `/api/ask` and `/api/ask/stream` returned
successful model replies, and a real `word_count` tool call returned 3 for
"Roam travel planning". Bedrock reported the Claude agreement, authorization,
entitlement, and regional availability as available/authorized. The earlier
inference blocker was no longer reproduced. No billing-plan upgrade was made.

The localhost chat now calls the Strands backend with travel-planning instructions
and conversation history. Open http://localhost:5173, choose a suggested trip or
send your own request, then send follow-ups to revise it. New journey starts a separate conversation; switching journeys preserves each
journey’s history in browser memory. Loading and retry states handle failed requests. Conversation
history is held in browser memory and is cleared by a page reload.

The merged frontend includes New journey parameters, Settings, profile editing,
local journey navigation, dark mode, and the interactive itinerary views. Live
Strands chat is the default; `VITE_USE_MOCKS=true` enables the offline design demo.
Settings preferences and header planning mode reach the agent. It has the
OpenStreetMap `find_places` and `locate` tools as well as `word_count`. Generated
itinerary panels and bookings remain to be implemented; live plans appear in
the conversation and the live itinerary panel stays empty. Prices and
availability are estimates to verify.

The backend returns safe JSON errors (503 for access/configuration, 429 for
quotas, 504 for timeouts, 502 for other upstream failures). Streaming returns an
`error` event with a `status`, then a `done` event. It does not return raw AWS
exception details. Requests use bounded connection/read timeouts and one SDK
retry; the extra Strands retry loop is disabled to avoid waiting minutes on
zero quotas.

Run the regression checks with:

```sh
docker compose exec -T backend python -m unittest discover -s tests -v
```

Official references: [Strands Bedrock provider](https://strandsagents.com/docs/user-guide/sdk/model-providers/amazon-bedrock/),
[Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html),
[Bedrock quotas](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html).
