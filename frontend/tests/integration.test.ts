import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { chatService } from "../src/features/chat/api/chatService";
import { conversationStore } from "../src/features/chat/api/conversationStore";
import { localTripsService } from "../src/features/trips/api/tripsService";
import { describeJourney } from "../src/features/journey/describeJourney";
import { itineraryStore, validateItinerary } from "../src/features/itinerary/api/itineraryStore";
import { budgetTotals, hasCoordinates, itemCostLabel } from "../src/features/itinerary/lib/itinerary";
import type { ItinerarySnapshot } from "../src/features/itinerary/types";

// The services use browser timers; Node provides equivalent timers for these tests.
globalThis.window = globalThis as unknown as Window & typeof globalThis;
afterEach(() => mock.restoreAll());

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
  const request = { prompt: "Kansas City", vibe: "City energy", budgetUsd: 300, dates: { start: "2026-10-17", end: "2026-10-18" }, origin: "Omaha", adults: 2, children: 1 };
  const message = describeJourney(request);
  assert.match(message, /2 adults and 1 child, leaving from Omaha/);
  assert.match(message, /Budget: \$300 total/);
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
