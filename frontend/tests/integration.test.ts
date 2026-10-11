import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { chatService } from "../src/features/chat/api/chatService";
import { conversationStore } from "../src/features/chat/api/conversationStore";
import { localTripsService } from "../src/features/trips/api/tripsService";
import { describeJourney } from "../src/features/journey/describeJourney";
import { itineraryStore, validateItinerary } from "../src/features/itinerary/api/itineraryStore";
import { budgetTotals, googleMapsUrl, hasCoordinates, itemCostLabel, websiteLabel } from "../src/features/itinerary/lib/itinerary";
import type { ItinerarySnapshot } from "../src/features/itinerary/types";
import { EXAMPLE_TRIP_ID } from "../src/features/trips/api/mockData";
import { postcardFromItinerary } from "../src/features/chat/lib/tripPostcard";
import { travelModeStore } from "../src/features/trips/api/travelModeStore";
import { tripTypesStore } from "../src/features/journey/api/tripTypesStore";

// The services use browser timers; Node provides equivalent timers for these tests.
globalThis.window = globalThis as unknown as Window & typeof globalThis;
afterEach(() => mock.restoreAll());

test("the example journey has matching seeded chat and itinerary while new journeys stay empty", async () => {
  assert.ok((await localTripsService.listTrips()).some((trip) => trip.id === EXAMPLE_TRIP_ID));
  assert.ok(conversationStore.getMessages(EXAMPLE_TRIP_ID).length > 0);
  assert.ok(itineraryStore.get(EXAMPLE_TRIP_ID)!.items.length > 0);
  const draft = await localTripsService.createTrip();
  assert.deepEqual(conversationStore.getMessages(draft.id), []);
  assert.equal(itineraryStore.get(draft.id), null);
  await localTripsService.deleteTrip(draft.id);
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
  // No daily mileage limit is sent: the backend keeps each driving day to a comfortable length.
  assert.equal(requests[1].max_drive_miles_per_day, undefined);
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
  assert.equal(sent[1].max_drive_miles_per_day, undefined);

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
