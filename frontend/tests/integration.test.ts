import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { chatService } from "../src/features/chat/api/chatService";
import { conversationStore } from "../src/features/chat/api/conversationStore";
import { localTripsService } from "../src/features/trips/api/tripsService";
import { describeJourney } from "../src/features/journey/describeJourney";

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
  await localTripsService.deleteTrip(trip.id);
  assert.equal((await localTripsService.listTripCards()).some((item) => item.id === trip.id), false);
});
