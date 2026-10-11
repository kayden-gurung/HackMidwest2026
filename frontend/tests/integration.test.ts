import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { chatService } from "../src/features/chat/api/chatService";
import { conversationStore } from "../src/features/chat/api/conversationStore";
import { localTripsService } from "../src/features/trips/api/tripsService";
import { describeJourney } from "../src/features/journey/describeJourney";
import { itineraryStore, validateItinerary } from "../src/features/itinerary/api/itineraryStore";
import { budgetTotals, googleMapsUrl, hasCoordinates, itemCostLabel, websiteLabel } from "../src/features/itinerary/lib/itinerary";
import type { ItinerarySnapshot } from "../src/features/itinerary/types";
import { sampleTrips } from "../src/features/explore/api/sampleTrips";
import { destinationIdeas } from "../src/features/explore/api/mockData";
import { formatDateRange } from "../src/lib/format";
import { totalCost, tripDates, visibleBudgetCategories } from "../src/features/itinerary/lib/itinerary";
import { postcardFromItinerary } from "../src/features/chat/lib/tripPostcard";
import { travelModeStore } from "../src/features/trips/api/travelModeStore";
import { tripTypesStore } from "../src/features/journey/api/tripTypesStore";
import { agentStore } from "../src/features/chat/api/agentStore";
import type { PlanApproval } from "../src/features/chat/types";
import { describeDrive, driveChangePrompt, roadTripConstraints, roadTripStore } from "../src/roadtrip/api/roadTripStore";
import type { DriveDraft } from "../src/roadtrip/types";

// The services use browser timers; Node provides equivalent timers for these tests.
globalThis.window = globalThis as unknown as Window & typeof globalThis;
afterEach(() => mock.restoreAll());

const driveDraft: DriveDraft = { start: "Kansas City, MO", destination: "St. Louis, MO", interests: ["History", "Local food"],
  detourBudget: 60, departureDate: "Flexible", maxMilesPerDay: 450 };

test("road-trip planning sends structured constraints, preserves measured routes and isolates journeys", async () => {
  const tripId = "live-roadtrip";
  roadTripStore.set(tripId, roadTripConstraints(driveDraft));
  travelModeStore.set(tripId, { carMode: true, maxMilesPerDay: driveDraft.maxMilesPerDay });
  const plan = { ...planFixture(), roadTrip: { origin: driveDraft.start, destination: driveDraft.destination,
    distanceMiles: 260, drivingMinutes: 250, directMinutes: 230, detourMinutes: 20, detourBudgetMinutes: 60,
    fuelCostUsd: 30.18, extraFuelCostUsd: 2.32, mpg: 28, gasPrice: 3.25, routeOption: 0 } };
  const bodies: any[] = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return eventResponse([{ reply: "Your drive is ready." }, { itinerary: plan }, { done: true }]);
  });
  await chatService.sendMessage(tripId, describeDrive(driveDraft), { interests: driveDraft.interests });
  assert.deepEqual(bodies[0].road_trip, { origin: driveDraft.start, destination: driveDraft.destination, detour_minutes: 60, mpg: 28, gas_price: 3.25 });
  assert.equal(bodies[0].max_drive_miles_per_day, 450);
  assert.equal(itineraryStore.snapshot(tripId)!.roadTrip!.fuelCostUsd, 30.18);
  await chatService.sendMessage(tripId, driveChangePrompt("restaurants", "Columbia, MO"));
  assert.deepEqual(bodies[1].current_itinerary.roadTrip, plan.roadTrip);
  assert.match(bodies[1].prompt, /Columbia, MO/);
  assert.match(bodies[1].prompt, /Exclude places already in my itinerary/);
  await chatService.sendMessage("other-roadtrip", "Hello");
  assert.equal(bodies[2].road_trip, undefined);
});

test("changed driving assumptions invalidate an approval without replacing the current plan", async () => {
  const tripId = "roadtrip-stale-review";
  roadTripStore.set(tripId, roadTripConstraints(driveDraft));
  itineraryStore.set(tripId, planFixture());
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; return eventResponse([{ approval: approvalFixture() }, { done: true }]); });
  await chatService.sendMessage(tripId, driveChangePrompt("towns", driveDraft.destination));
  roadTripStore.set(tripId, roadTripConstraints({ ...driveDraft, detourBudget: 15 }));
  await assert.rejects(chatService.resolveApproval(tripId, true), /settings or plan changed/);
  assert.equal(calls, 1);
  assert.equal(itineraryStore.get(tripId)!.items[0].title, "Park picnic");
});

test("driving form validation and route summaries reject invalid or over-limit values", () => {
  assert.throws(() => roadTripConstraints(driveDraft, { mpg: 0, gas_price: 3.25 }), /fuel assumptions/);
  assert.throws(() => roadTripConstraints({ ...driveDraft, start: " " }), /starting city/);
  assert.match(driveChangePrompt("route", ""), /different road route/);
  assert.match(driveChangePrompt("towns", ""), /different small towns/);
  assert.match(driveChangePrompt("activities", "Columbia"), /different attractions in Columbia/);
  assert.throws(() => driveChangePrompt("restaurants", ""), /city/);
  assert.throws(() => validateItinerary({ ...planFixture(), roadTrip: { origin: "A", destination: "B",
    distanceMiles: 10, drivingMinutes: 40, directMinutes: 20, detourMinutes: 20, detourBudgetMinutes: 15,
    fuelCostUsd: 2, extraFuelCostUsd: 1, mpg: 28, gasPrice: 3.25, routeOption: 0 } }), /driving estimates/);
});

test("the detour slider and exact typed allowances reach the API unchanged", async () => {
  const bodies: any[] = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return eventResponse([{ reply: "No plan changed." }, { done: true }]);
  });
  for (const minutes of [0, 45, 37, 240, 600]) {
    const draft = { ...driveDraft, detourBudget: minutes };
    const tripId = `exact-detour-${minutes}`;
    roadTripStore.set(tripId, roadTripConstraints(draft));
    await chatService.sendMessage(tripId, describeDrive(draft));
    assert.equal(bodies.at(-1).road_trip.detour_minutes, minutes);
  }
  for (const detourBudget of [-1, 601, 1.5, NaN]) {
    assert.throws(() => roadTripConstraints({ ...driveDraft, detourBudget }), /driving limits/);
  }
});

function eventResponse(events: Record<string, unknown>[]) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
}

function approvalFixture(): PlanApproval {
  return { run_id: "opaque-run", expires_in_seconds: 900, interrupts: [{ id: "opaque-sdk-interrupt", name: "roam.itinerary-consent", reason: {
    kind: "itinerary_replan", summary: "Move lunch indoors", changes: [], unchanged_stops: 1,
    before_total_usd: 30, after_total_usd: 50, unknown_costs: 1, itinerary: { ...planFixture(), items: [{ ...planFixture().items[0], title: "Indoor lunch", costUsd: 50 }] },
  } }] };
}

test("an SDK interrupt holds the plan, isolates the live trace, and resumes without adding another user message", async () => {
  const tripId = "consent-trip";
  itineraryStore.set(tripId, planFixture());
  const before = itineraryStore.snapshot(tripId);
  const approval = approvalFixture();
  const requests: { url: string; body: any }[] = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return requests.length === 1 ? eventResponse([
      { run: { id: approval.run_id } },
      { xray: { id: "event-1", agent: "places", kind: "tool_started", tool: "find_places", timestamp: "2026-10-10T12:00:00Z" } },
      { text: "I propose an indoor lunch." }, { approval }, { done: true },
    ]) : eventResponse([{ reply: "Applied the approved re-plan." }, { itinerary: approval.interrupts[0].reason.itinerary }, { done: true }]);
  });
  assert.equal(await chatService.sendMessage(tripId, "Rain tomorrow, move lunch indoors"), undefined);
  assert.equal(conversationStore.getStatus(tripId), "awaiting_approval");
  assert.deepEqual(itineraryStore.snapshot(tripId), before);
  assert.equal(conversationStore.getMessages(tripId).length, 1);
  assert.equal(conversationStore.getDraft(tripId), undefined);
  assert.equal(agentStore.get(tripId).events[0].agent, "places");
  assert.equal(agentStore.get("unrelated-consent-trip").events.length, 0);
  await assert.rejects(chatService.sendMessage(tripId, "Another change"), /Review the pending plan/);
  await chatService.resolveApproval(tripId, true);
  assert.match(requests[1].url, /\/api\/ask\/opaque-run\/resume$/);
  assert.deepEqual(requests[1].body, { interrupt_ids: ["opaque-sdk-interrupt"], approved: true });
  assert.equal(conversationStore.getMessages(tripId).length, 2);
  assert.equal(itineraryStore.get(tripId)!.items[0].title, "Indoor lunch");
  assert.equal(agentStore.get(tripId).approval, undefined);
  assert.equal(agentStore.get(tripId).events.length, 1);
});

test("declining a re-plan preserves the itinerary and duplicate approvals are blocked", async () => {
  const tripId = "decline-trip";
  itineraryStore.set(tripId, planFixture());
  const before = itineraryStore.snapshot(tripId);
  let finish: (response: Response) => void;
  let calls = 0;
  mock.method(globalThis, "fetch", async (_url, init) => {
    calls++;
    if (calls === 1) return eventResponse([{ approval: approvalFixture() }, { done: true }]);
    assert.equal(JSON.parse(init.body).approved, false);
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  await chatService.sendMessage(tripId, "Move indoors");
  const pending = chatService.resolveApproval(tripId, false);
  await assert.rejects(chatService.resolveApproval(tripId, true), /no pending plan/);
  assert.equal(calls, 2);
  finish!(eventResponse([{ reply: "Kept your current plan." }, { done: true }]));
  await pending;
  assert.deepEqual(itineraryStore.snapshot(tripId), before);
  assert.equal(conversationStore.getStatus(tripId), "idle");
});

test("expired reviews and incomplete streams preserve the last good plan and can be retried", async () => {
  const tripId = "expired-consent-trip";
  itineraryStore.set(tripId, planFixture());
  const before = itineraryStore.snapshot(tripId);
  let calls = 0;
  mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) return eventResponse([{ approval: approvalFixture() }, { done: true }]);
    if (calls === 2) return new Response(JSON.stringify({ detail: "This review expired. Send your change again." }), { status: 410 });
    return eventResponse([{ reply: "A partial response" }, { itinerary: approvalFixture().interrupts[0].reason.itinerary }]);
  });
  await chatService.sendMessage(tripId, "Move indoors");
  await assert.rejects(chatService.resolveApproval(tripId, true), /expired/);
  assert.equal(conversationStore.getStatus(tripId), "error");
  assert.equal(agentStore.get(tripId).approval, undefined);
  await assert.rejects(chatService.retryMessage(tripId), /connection ended/);
  assert.deepEqual(itineraryStore.snapshot(tripId), before);
  assert.equal(conversationStore.getMessages(tripId).length, 1);
});

test("a proposal cannot overwrite trip settings or a plan changed during review", async () => {
  const tripId = "stale-consent-trip";
  itineraryStore.set(tripId, planFixture());
  let calls = 0;
  mock.method(globalThis, "fetch", async () => { calls++; return eventResponse([{ approval: approvalFixture() }, { done: true }]); });
  await chatService.sendMessage(tripId, "Move indoors");
  travelModeStore.set(tripId, { carMode: true });
  await assert.rejects(chatService.resolveApproval(tripId, true), /settings or plan changed/);
  assert.equal(calls, 1);
  assert.equal(itineraryStore.get(tripId)!.items[0].title, "Park picnic");
});

test("sample trips are not journeys, but open with their own chat, plan and header while new journeys stay empty", async () => {
  const listed = (await localTripsService.listTrips()).map((trip) => trip.id);
  for (const sample of sampleTrips) {
    assert.equal(listed.includes(sample.id), false, `${sample.id} must not be under Recent journeys`);
    assert.equal(conversationStore.getMessages(sample.id).length, 2);
    assert.ok(itineraryStore.get(sample.id)!.items.length > 0);
    const header = await localTripsService.getTrip(sample.id);
    assert.equal(header.title, sample.summary.title);
    assert.equal(header.travelers, sample.details.travelers);
    assert.equal((await localTripsService.listTripCards()).some((card) => card.id === sample.id), false);
  }
  const draft = await localTripsService.createTrip();
  assert.deepEqual(conversationStore.getMessages(draft.id), []);
  assert.equal(itineraryStore.get(draft.id), null);
  await localTripsService.deleteTrip(draft.id);
});

test("each sample trip is internally consistent and backs its Explore card", () => {
  assert.deepEqual(destinationIdeas.map((idea) => idea.id), sampleTrips.map((trip) => trip.id));
  assert.equal(new Set(sampleTrips.map((trip) => trip.id)).size, sampleTrips.length);
  for (const { id, idea, itinerary, conversation, details, summary } of sampleTrips) {
    const { tripId, ...snapshot } = itinerary;
    assert.equal(tripId, id);
    // The plan is valid for the panels and for the backend, and fits its own budget.
    validateItinerary(snapshot);
    const { spentUsd, remainingUsd, unknownCosts } = budgetTotals(itinerary);
    assert.ok(remainingUsd! >= 0, `${id} is over budget`);
    assert.equal(unknownCosts, 0);
    assert.ok(itinerary.items.every((item) => item.costUsd !== null && item.location), `${id} has a stop without a cost or place`);
    // Every day has a headline and something planned; headlines match the plan's dates.
    const dates = tripDates(itinerary.startDate, itinerary.endDate);
    assert.deepEqual(itinerary.days!.map((day) => day.date), dates);
    for (const date of dates) assert.ok(itinerary.items.some((item) => item.date === date), `${id} has nothing on ${date}`);
    // The card's price, length and group size are the plan's.
    assert.equal(idea.fromPriceUsd, spentUsd);
    assert.equal(idea.days, dates.length);
    assert.equal(idea.travelers, details.travelers);
    assert.equal(summary.budgetUsd, itinerary.budget.plannedUsd);
    // Flights: one out, one home, together the per-person round trip for everyone traveling.
    const flights = itinerary.items.filter((item) => item.category === "Flights");
    assert.equal(flights.length, 2);
    const reply = conversation[1];
    assert.equal(reply.role, "assistant");
    if (reply.role !== "assistant") continue;
    assert.equal(totalCost(flights), reply.flight!.pricePerPersonUsd * details.travelers);
    assert.equal(reply.recommendation!.flightPricePerPersonUsd, reply.flight!.pricePerPersonUsd);
    // The chat postcard repeats what the Plan and Budget tabs say.
    assert.equal(reply.recommendation!.estimatedTotalUsd, spentUsd);
    assert.equal(reply.recommendation!.budgetUsd, itinerary.budget.plannedUsd);
    assert.equal(reply.recommendation!.dateLabel, formatDateRange(itinerary.startDate, itinerary.endDate));
    assert.equal(reply.recommendation!.durationDays, dates.length);
    assert.equal(reply.flight!.withinBudget, spentUsd <= itinerary.budget.plannedUsd!);
    // A flown trip may still hire a car for some days; its Budget sections are all shown.
    assert.ok(visibleBudgetCategories(itinerary.items).includes("Flights"));
    // The stay is booked for every night of the trip.
    const nights = dates.length - 1;
    const stays = itinerary.items.filter((item) => item.category === "Stays");
    assert.equal(stays.map((stay) => Number(/(\d+) nights?/.exec(stay.title)?.[1])).reduce((sum, count) => sum + count, 0), nights, `${id} stays do not cover ${nights} nights`);
    // The highlighted stay and table are real stops in the plan.
    for (const place of itinerary.places!) assert.ok(itinerary.items.some((item) => item.title.includes(place.name) || item.location?.name === place.name), `${place.name} is not in ${id}'s plan`);
  }
});

test("every mapped stop of a sample trip is near where the trip is based", () => {
  const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const rad = Math.PI / 180;
    const x = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  };
  for (const { id, itinerary } of sampleTrips) {
    const base = itinerary.items.find((item) => item.category === "Stays" && hasCoordinates(item))!.location as { lat: number; lng: number };
    for (const item of itinerary.items.filter(hasCoordinates)) {
      const distance = km(base, item.location);
      assert.ok(distance < 120, `${id}: "${item.title}" is ${Math.round(distance)} km from the stay`);
    }
  }
});

test("Explore filters still split the sample trips by interest and budget", () => {
  const withTag = (tag: string) => destinationIdeas.filter((idea) => (idea.tags as string[]).includes(tag)).map((idea) => idea.id);
  for (const tag of ["Beach", "Food", "Outdoors", "Culture"]) assert.ok(withTag(tag).length > 0 && withTag(tag).length < destinationIdeas.length, tag);
  const under = destinationIdeas.filter((idea) => idea.fromPriceUsd < 2500).map((idea) => idea.id);
  assert.deepEqual(under, ["madeira", "busan", "naples"]);
});

test("live chat sends journey history, preferences and mode; retry preserves one user message", async () => {
  const requests: any[] = [];
  let fail = false;
  mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify(fail ? { detail: "Bedrock access is denied." } : { reply: "A real reply" }), { status: fail ? 503 : 200 });
  });
  const preferences = { interests: ["Hiking"], stayStyle: "Boutique", planningStyle: "Hands-on" };
  await chatService.sendMessage("history-trip", "Kansas City for $300", preferences, "Surprise me");
  assert.deepEqual(requests[0].history, []);
  assert.equal(requests[0].preferences.stay_style, "Boutique");
  assert.equal(requests[0].mode, "Surprise me");
  fail = true;
  await assert.rejects(chatService.sendMessage("history-trip", "Make it slower", preferences), /Bedrock access is denied/);
  assert.equal(conversationStore.getError("history-trip"), "Bedrock access is denied.");
  assert.deepEqual(requests[1].history, [{ role: "user", content: "Kansas City for $300" }, { role: "assistant", content: "A real reply" }]);
  fail = false;
  await chatService.retryMessage("history-trip", preferences);
  assert.deepEqual(requests[2].history, requests[1].history);
  assert.equal(conversationStore.getMessages("history-trip").length, 4);
  assert.equal(conversationStore.getStatus("history-trip"), "idle");
  assert.equal(conversationStore.getError("history-trip"), undefined);
  await chatService.sendMessage("another-trip", "New destination");
  assert.deepEqual(requests[3].history, []);
});

test("history stays within the backend's 40-message limit", async () => {
  let latest: any;
  mock.method(globalThis, "fetch", async (_url, init) => {
    latest = JSON.parse(init.body);
    return new Response(JSON.stringify({ reply: "ok" }));
  });
  for (let index = 0; index < 22; index++) await chatService.sendMessage("long-trip", `turn ${index}`);
  assert.equal(latest.history.length, 40);
  assert.equal(latest.history[0].content, "turn 1");
});

test("concurrent sends to one journey are blocked before appending a duplicate", async () => {
  let finish: (response: Response) => void;
  mock.method(globalThis, "fetch", () => new Promise<Response>((resolve) => { finish = resolve; }));
  const pending = chatService.sendMessage("busy-trip", "First message");
  await assert.rejects(chatService.sendMessage("busy-trip", "Duplicate"), /already responding/);
  assert.equal(conversationStore.getMessages("busy-trip").length, 1);
  finish!(new Response(JSON.stringify({ reply: "ok" })));
  await pending;
});

test("New journey parameters reach chat and the header; My trips uses local journeys", async () => {
  const request = { prompt: "Kansas City", vibes: ["City energy", "Food first"], budgetUsd: 300, dates: { start: "2026-10-17", end: "2026-10-18" }, origin: "Omaha", adults: 2, children: 1 };
  const message = describeJourney(request);
  assert.match(message, /2 adults and 1 child, leaving from Omaha/);
  assert.match(message, /Vibe: City energy, Food first\./);
  assert.match(message, /Budget: \$300 total/);
  const noVibe = describeJourney({ ...request, prompt: "", vibes: [] });
  assert.match(noVibe, /^Plan me a trip\. Vibe: no preference\./);
  assert.match(message, /2026-10-17 to 2026-10-18/);
  const trip = await localTripsService.createTrip();
  await localTripsService.renameTrip(trip.id, "Kansas City", { startDate: request.dates.start, endDate: request.dates.end, origin: request.origin, travelers: 3 });
  assert.equal((await localTripsService.getTrip(trip.id)).travelers, 3);
  let card = (await localTripsService.listTripCards()).find((item) => item.id === trip.id)!;
  assert.equal(card.dates, "Oct 17–18");
  await localTripsService.renameTrip(trip.id, "Family weekend");
  card = (await localTripsService.listTripCards()).find((item) => item.id === trip.id)!;
  assert.equal(card.title, "Family weekend");
  itineraryStore.set(trip.id, { startDate: "2026-10-19", endDate: "2026-10-20", items: [], budget: { plannedUsd: 300 } });
  card = (await localTripsService.listTripCards()).find((item) => item.id === trip.id)!;
  assert.equal(card.dates, "Oct 19–20");
  await localTripsService.deleteTrip(trip.id);
  assert.equal((await localTripsService.listTripCards()).some((item) => item.id === trip.id), false);
});

const planFixture = (): ItinerarySnapshot => ({
  startDate: "2026-10-17", endDate: "2026-10-18", budget: { plannedUsd: 300 },
  items: [
    { id: "picnic", date: "2026-10-17", title: "Park picnic", category: "Food", costUsd: 30, location: { name: "Park", lat: 39.1, lng: -94.6 } },
    { id: "stay", date: "2026-10-17", title: "Stay", category: "Stays", costUsd: null },
  ],
});

test("chat updates a journey's plan/map/budget, sends it for revisions, and preserves it on failure", async () => {
  const requests: any[] = [];
  let response: any = { reply: "Ready", itinerary: planFixture() };
  mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify(response), { status: response.detail ? 503 : 200 });
  });
  let updates = 0;
  const unsubscribe = itineraryStore.subscribe(() => { updates++; });
  await chatService.sendMessage("panel-trip", "Plan weekend");
  assert.equal(updates, 1);
  assert.equal(requests[0].current_itinerary, undefined);
  const first = itineraryStore.get("panel-trip")!;
  assert.equal(first.items[0].title, "Park picnic");
  assert.ok(hasCoordinates(first.items[0]));
  assert.equal(budgetTotals(first).spentUsd, 30);
  assert.equal(budgetTotals(first).unknownCosts, 1);
  assert.equal(itemCostLabel(first.items[1]), "Cost TBD");
  response.itinerary.items[0] = { ...response.itinerary.items[0], title: "Restaurant lunch", costUsd: 60 };
  await chatService.sendMessage("panel-trip", "Replace picnic with lunch");
  assert.equal(requests[1].current_itinerary.items[0].title, "Park picnic");
  const revised = itineraryStore.get("panel-trip")!;
  assert.equal(revised.items[0].title, "Restaurant lunch");
  assert.equal(revised.items[1].id, "stay");
  assert.equal(budgetTotals(revised).remainingUsd, 240);
  response = { reply: "Answer without a revision" };
  await chatService.sendMessage("panel-trip", "Question only");
  assert.equal(itineraryStore.get("panel-trip"), revised);
  response = { detail: "Model unavailable" };
  await assert.rejects(chatService.sendMessage("panel-trip", "Revise again"));
  assert.equal(itineraryStore.get("panel-trip"), revised);
  response = { reply: "Bad plan", itinerary: { ...planFixture(), items: [{ ...planFixture().items[0], date: "2026-10-20" }] } };
  await assert.rejects(chatService.retryMessage("panel-trip"), /invalid stop/);
  assert.equal(itineraryStore.get("panel-trip"), revised);
  response = { reply: "Clear stops", itinerary: { ...planFixture(), items: [] } };
  await chatService.retryMessage("panel-trip");
  assert.equal(itineraryStore.get("panel-trip")!.items.length, 0);
  await chatService.sendMessage("separate-panel-trip", "Another trip");
  assert.equal(requests.at(-1).current_itinerary, undefined);
  unsubscribe();
});

test("unknown budgets/costs stay distinct from free items; invalid dates, IDs and map coordinates are rejected", () => {
  const plan = planFixture();
  plan.budget.plannedUsd = null;
  assert.equal(budgetTotals({ ...plan, tripId: "x" }).remainingUsd, null);
  assert.equal(itemCostLabel({ ...plan.items[0], costUsd: 0 }), "Free");
  for (const patch of [
    { endDate: "2026-02-30" }, { endDate: "2026-10-16" }, { endDate: "2027-10-18" },
    { items: [plan.items[0], plan.items[0]] },
    { items: [{ ...plan.items[0], costUsd: -1 }] },
    { items: [{ ...plan.items[0], location: { name: "Park", lat: 100, lng: 0 } }] },
  ]) assert.throws(() => validateItinerary({ ...plan, ...patch }), /invalid/);
});

test("live postcards use each journey's metadata and keep unknown estimates separate from free costs", () => {
  const plan = planFixture();
  plan.overview = { destination: "Kansas City, Missouri", headline: "A weekend of new corners.", pace: "Relaxed" };
  plan.summary = "Good food and a little time outside.";
  const postcard = postcardFromItinerary(validateItinerary(plan))!;
  assert.equal(postcard.destination, "Kansas City, Missouri");
  assert.equal(postcard.budgetUsd, 300);
  assert.equal(postcard.estimatedTotalUsd, 30);
  assert.equal(postcard.unknownCosts, 1);
  assert.equal(postcard.durationDays, 2);
  assert.equal(postcard.imageUrl, undefined);
  assert.equal(postcard.flightPricePerPersonUsd, undefined);
  assert.equal(postcard.matchPercent, undefined);
  itineraryStore.set("postcard-trip", plan);
  assert.deepEqual(itineraryStore.snapshot("postcard-trip")!.overview, plan.overview);
  const other = { ...planFixture(), overview: { destination: "Kyoto, Japan", imageUrl: "https://example.com/kyoto.jpg" } };
  assert.equal(postcardFromItinerary(other)!.destination, "Kyoto, Japan");
  assert.equal(postcardFromItinerary(other)!.imageUrl, "https://example.com/kyoto.jpg");
  const unknown = { ...plan, items: plan.items.map((item) => ({ ...item, costUsd: null })) };
  assert.equal(postcardFromItinerary(unknown)!.estimatedTotalUsd, null);
  const free = { ...plan, items: plan.items.map((item) => ({ ...item, costUsd: 0 })) };
  assert.equal(postcardFromItinerary(free)!.estimatedTotalUsd, 0);
  assert.equal(postcardFromItinerary(free)!.unknownCosts, 0);
  assert.equal(postcardFromItinerary({ ...plan, items: [] }), undefined);
  assert.throws(() => validateItinerary({ ...plan, overview: { destination: "" } }), /invalid plan/);
});

test("car mode is sent with each message, takes flights off the plan, and accepts Driving stops", async () => {
  const requests: any[] = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ reply: "ok" }), { status: 200 });
  });
  const tripId = "car-trip";
  itineraryStore.set(tripId, {
    startDate: "2026-10-17", endDate: "2026-10-18", budget: { plannedUsd: 900 }, assumptions: [],
    items: [
      { id: "f", date: "2026-10-17", title: "Flight MCI to DEN", category: "Flights", costUsd: 400 },
      { id: "d", date: "2026-10-17", title: "Drive to Salina", category: "Driving", costUsd: 40 },
    ],
  });

  await chatService.sendMessage(tripId, "Plan Denver");
  assert.equal(requests[0].car_mode, false);
  assert.equal(requests[0].max_drive_miles_per_day, undefined);

  travelModeStore.set(tripId, { carMode: true });
  assert.deepEqual(itineraryStore.get(tripId)!.items.map((item) => item.id), ["d"]);
  await chatService.sendMessage(tripId, "Drive instead");
  assert.equal(requests[1].car_mode, true);
  // Road sends the daily mileage limit (400 by default; changeable in the header and on New journey).
  assert.equal(requests[1].max_drive_miles_per_day, 400);
  assert.equal(travelModeStore.get("another-trip").carMode, false);

  assert.doesNotThrow(() => validateItinerary(itineraryStore.snapshot(tripId)));
});

test("Google Maps links use the address, else exact coordinates, never a bare name when a pin is known", () => {
  const base = { id: "x", date: "2026-10-17", title: "Dinner", category: "Food" as const, costUsd: 20 };
  const query = (url?: string) => decodeURIComponent(new URL(url!).searchParams.get("query")!);
  assert.equal(query(googleMapsUrl({ ...base, location: { name: "Blue Plate", address: "Main St 1, Kansas City" } })), "Blue Plate, Main St 1, Kansas City");
  assert.equal(query(googleMapsUrl({ ...base, location: { name: "Blue Plate", lat: 39.05, lng: -94.59 } })), "39.05,-94.59");
  assert.equal(query(googleMapsUrl({ ...base, location: { name: "Blue Plate" } })), "Blue Plate");
  assert.equal(googleMapsUrl(base), undefined);
});

test("streamed replies show the draft and tools, retaining forecast and budget steps with the final reply", async () => {
  const events = [{ text: "Let me check " }, { text: "real places." }, { tool: "find_places" }, { tool: "get_forecast" }, { tool: "check_budget" }, { tool: "update_itinerary" }, { text: "Here is your plan." }, { reply: "Here is your plan." }, { done: true }];
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  // Split mid-event so the client has to stitch chunks back together.
  const chunks = [body.slice(0, 7), body.slice(7, 40), body.slice(40)];
  const drafts: (ReturnType<typeof conversationStore.getDraft>)[] = [];
  const unsubscribe = conversationStore.subscribe(() => drafts.push(conversationStore.getDraft("stream-trip")));
  let url = "";
  mock.method(globalThis, "fetch", async (requestUrl: string) => {
    url = requestUrl;
    const stream = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  });
  const reply = await chatService.sendMessage("stream-trip", "Weekend in KC");
  unsubscribe();
  assert.match(url, /\/api\/ask\/stream$/);
  assert.equal(reply.text, "Here is your plan.");
  assert.ok(drafts.some((draft) => draft?.text === "Let me check real places." && draft.tool === undefined));
  assert.ok(drafts.some((draft) => draft?.tool === "find_places"));
  assert.ok(drafts.some((draft) => draft?.tool === "get_forecast"));
  assert.ok(drafts.some((draft) => draft?.tool === "check_budget"));
  assert.deepEqual(reply.toolSteps, ["find_places", "get_forecast", "check_budget", "update_itinerary"]);
  assert.ok(drafts.some((draft) => draft?.text === "Let me check real places.\n\nHere is your plan."));
  assert.equal(conversationStore.getDraft("stream-trip"), undefined);
  assert.equal(conversationStore.getMessages("stream-trip").at(-1)?.text, "Here is your plan.");
  assert.deepEqual((conversationStore.getMessages("stream-trip").at(-1) as any).toolSteps, reply.toolSteps);
});

test("an error event in the stream is shown like any other backend error", async () => {
  mock.method(globalThis, "fetch", async () => new Response(`data: ${JSON.stringify({ error: "Bedrock throttled the request.", status: 429 })}\n\ndata: {"done": true}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
  await assert.rejects(chatService.sendMessage("stream-error-trip", "Hi"), /Bedrock throttled/);
  assert.equal(conversationStore.getError("stream-error-trip"), "Bedrock throttled the request.");
});

test("the Plane / Road toggle is sent with each message, and links say what they open", async () => {
  const sent: any[] = [];
  mock.method(globalThis, "fetch", async (_url: string, init: any) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ reply: "ok" }));
  });
  await chatService.sendMessage("toggle-trip", "Plan it");
  assert.equal(sent[0].travel_mode, "plane");
  assert.equal(sent[0].car_mode, false);
  travelModeStore.set("toggle-trip", { carMode: true });
  await chatService.sendMessage("toggle-trip", "Now by road");
  assert.equal(sent[1].travel_mode, "road");
  assert.equal(sent[1].max_drive_miles_per_day, 400);

  const base = { id: "x", date: "2026-10-17", title: "x", costUsd: null } as const;
  assert.equal(websiteLabel({ ...base, category: "Flights", websiteUrl: "https://www.google.com/travel/flights?q=Flights" }), "Find tickets");
  assert.equal(websiteLabel({ ...base, category: "Driving", websiteUrl: "https://www.google.com/maps/dir/?api=1&origin=A" }), "Directions");
  assert.equal(websiteLabel({ ...base, category: "Food", websiteUrl: "https://example.com" }), "Website");
});

test("trip types chosen for a journey go with every message of that journey only", async () => {
  const requests: any[] = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ reply: "ok" }), { status: 200 });
  });
  tripTypesStore.set("typed-trip", ["Food first", "Rest & reset"]);
  await chatService.sendMessage("typed-trip", "Plan Kansas City");
  await chatService.sendMessage("typed-trip", "Make day 2 slower");
  await chatService.sendMessage("other-trip", "Plan Denver");
  assert.deepEqual(requests[0].trip_types, ["Food first", "Rest & reset"]);
  assert.deepEqual(requests[1].trip_types, ["Food first", "Rest & reset"]);
  assert.deepEqual(requests[2].trip_types, []);
});

test("New journey says how the traveler gets there in Roam's first message", () => {
  const base = { prompt: "Denver", vibes: [], budgetUsd: 1500, dates: null, origin: "Kansas City, MO", adults: 2, children: 0 };
  assert.match(describeJourney(base), /Getting there: by plane\.$/);
  assert.match(describeJourney({ ...base, travelBy: "plane" }), /Getting there: by plane\.$/);
  assert.match(describeJourney({ ...base, travelBy: "road" }), /Getting there: by road in our own car\.$/);
});

test("driving legs keep their road route for the map; malformed routes are rejected", () => {
  const plan = (route: unknown) => ({
    startDate: "2026-10-17", endDate: "2026-10-18", budget: { plannedUsd: 500 },
    items: [{ id: "d", date: "2026-10-17", title: "Drive Kansas City → Salina", category: "Driving", costUsd: 40,
      location: { name: "Salina, Kansas", lat: 38.84, lng: -97.61 }, route }],
  });
  const ok = validateItinerary(plan([[39.1, -94.58], [38.9, -96.2], [38.84, -97.61]]));
  assert.equal(ok.items[0].route!.length, 3);
  assert.throws(() => validateItinerary(plan([[39.1]])));
  assert.throws(() => validateItinerary(plan([[200, 0], [0, 0]])));
});

test("road trips send the daily miles limit, and New journey can set it", async () => {
  const requests: any[] = [];
  mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ reply: "ok" }), { status: 200 });
  });
  travelModeStore.set("miles-trip", { carMode: true, maxMilesPerDay: 300 });
  await chatService.sendMessage("miles-trip", "Plan Denver");
  assert.equal(requests.at(-1).travel_mode, "road");
  assert.equal(requests.at(-1).max_drive_miles_per_day, 300);
  travelModeStore.set("miles-trip", { carMode: false });
  await chatService.sendMessage("miles-trip", "Fly instead");
  assert.equal(requests.at(-1).max_drive_miles_per_day, undefined);
  const base = { prompt: "Denver", vibes: [], budgetUsd: 900, dates: null, origin: "Kansas City", adults: 2, children: 0 };
  assert.match(describeJourney({ ...base, travelBy: "road", maxMilesPerDay: 300 }), /by road in our own car, at most 300 miles a day\./);
  assert.match(describeJourney({ ...base, travelBy: "plane" }), /Getting there: by plane\./);
});
