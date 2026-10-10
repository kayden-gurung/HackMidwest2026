# Strands implementation guide for Roam

This is the team's proposed architecture. The planning, revision and Decider modules described below still need implementation.

## Responsibilities

| Component | Responsibility | Example |
| --- | --- | --- |
| Strands Agents SDK | Runs the agent and connects tools | Coordinates planning and data lookups |
| Amazon Bedrock model | Generates structured itineraries and explanations | Writes a revised afternoon plan |
| Travel tools | Retrieve real facts with sources | Weather, places, opening hours and travel times |
| Decider 2B, optional | Makes a typed routing decision | Select weather lookup or indoor-place search |
| Python validation | Enforces concrete constraints | Validates dates and calculates costs |

Start with one Strands agent, Bedrock, structured itinerary output and one real tool. Add Decider after the complete planning flow works.

## Core planning flow

1. React submits the trip preferences to `POST /api/trips/plan`.
2. FastAPI validates the request using the models agreed in [TEAM_PLAN.md](../TEAM_PLAN.md).
3. The Strands agent receives travel instructions and the tools from `get_travel_tools()`.
4. The agent retrieves available facts and produces an itinerary using a Pydantic structured output model.
5. Python checks the dates, day bounds and cost totals. Missing or unverified information remains explicit in assumptions.
6. FastAPI returns the agreed JSON shape for React to render.

Use `structured_output_model=Itinerary` when invoking the agent and read `result.structured_output`. See the [official structured output guide](https://strandsagents.com/docs/user-guide/sdk/agents/structured-output/).

Travel instructions should tell the agent to respect dates, total budget and interests; allow realistic travel time; preserve tool-provided source URLs; label estimates; and avoid inventing live prices, availability or opening hours.

Tools should be typed Python functions decorated with `@tool`, then supplied through `Agent(tools=[...])`. See the [official Agent API](https://strandsagents.com/docs/api/python/strands.agent.agent/). Each integration needs a bounded timeout and an understandable unavailable-data result.

AWS credentials and model configuration belong in the backend environment. Confirm the chosen Bedrock model can be invoked with the team's credentials before integrating the full UI.

## Optional Decider experiment: replanning tool selection

Strands Decider 2B is separate from the Strands Agents SDK. The supplied AWS Builder Center page describes it as a small experimental decision model that returns a choice, yes/no or score with confidence; it does not generate itinerary text. Bedrock supplies the generative part.

Example user request: "It is raining tomorrow. Keep the museum visit, but replace the park."

1. Receive the original preferences, current itinerary and requested change.
2. Give Decider the relevant state and a fixed option set.
3. Dispatch its choice to an explicitly allowed action.
4. Fetch the required data.
5. Ask the Bedrock planner to revise affected activities and explain the changes.
6. Validate the resulting itinerary in Python before returning it.

Conceptual decision input, not verified Decider API syntax:

```json
{
  "state": {
    "request": "Replace tomorrow's park visit because of rain",
    "has_current_forecast": false,
    "has_indoor_candidates": false
  },
  "question": "Which action should happen next?",
  "options": [
    "CHECK_WEATHER",
    "SEARCH_INDOOR_PLACES",
    "REVISE_ITINERARY",
    "ASK_FOR_CLARIFICATION"
  ]
}
```

| Choice | Allowed action |
| --- | --- |
| `CHECK_WEATHER` | Invoke the weather tool |
| `SEARCH_INDOOR_PLACES` | Invoke the places tool |
| `REVISE_ITINERARY` | Invoke the Bedrock planner with gathered evidence |
| `ASK_FOR_CLARIFICATION` | Return a question to the UI |

Verify the actual Decider API and model setup before implementing the adapter. Validate the returned option against the allowed set. Bound routing steps so repeated tool choices cannot loop indefinitely. Treat confidence as a signal to evaluate, not a guarantee; select a fallback threshold through testing. Keep arithmetic and hard constraints in Python.

The supplied page advertises roughly 115 ms decision latency on supported hardware. This is a source claim, not a measurement for Roam. Measure on the team's setup before claiming latency or cost improvements.

## Files and ownership

| Proposed file | Owner | Responsibility |
| --- | --- | --- |
| `backend/agents/planner.py` | B: Agent | Public planning/revision functions agreed in TEAM_PLAN |
| `backend/agents/replanner.py` | B: Agent | Internal orchestration for itinerary changes |
| `backend/agents/decisions.py` | B: Agent | Optional Decider adapter and routing |
| `backend/prompts/travel.py` | B: Agent | Travel instructions |
| `backend/tools/places.py` | C: Data tools | Real place information |
| `backend/tools/weather.py` | C: Data tools | Forecast information |
| `backend/schemas.py` | D: Integration, agreed with B | API and itinerary models |
| `backend/validation.py` | D: Integration | Cost calculations and hard constraint checks |

Keep the public `plan_trip` and `revise_trip` imports in `planner.py` stable. It can delegate internally to `replanner.py`; that should not require route or UI changes. If clarification adds a new response variant, B and D must agree and update the API contract before A implements it.

## Demo and checks

- Generate an itinerary from actual preferences and show at least one real tool source.
- Ask for a rain-related change, preserve unaffected activities, and show explanations.
- If Decider is added, display its selected action and the tool actually called.
- Check invalid requests, unavailable data, upstream model errors and repeated routing choices.
- Label any example fallback as sample data. Do not claim a live lookup or performance improvement without evidence.

## Separate Builder Center challenge

The supplied [AWS Builder Center page](https://builder.aws.com/build/hackathons/4f50957c-1d08-37ab-b11c-97516b9adeb4/agent-experience-hackathon-strands-decider) describes an online Decider event separate from HackMidwest. The live page could not be fetched during review; this summary uses the user's saved HTML copy.

It lists a meaningful Decider decision paired with Bedrock, a Builder Center article, a public source repository with a reusable decision pattern, a demo video under three minutes, an original previously unpublished agent, and submission tags including `#strands-decider-2b` plus a decision-pattern tag. Its patterns include tool selection, guardrails, policy, model routing, and context/memory.

The saved page shows October 16–30, 2026 in the event header but October 23 as the project deadline in its milestone table. Verify current rules, eligibility, originality requirements and deadlines before planning a separate submission. These requirements do not replace the HackMidwest Strands challenge requirements.
