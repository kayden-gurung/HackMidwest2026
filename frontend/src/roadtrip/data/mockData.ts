import type { CommunityDiscovery, DriveStop, TripSummary } from "../types"

export const driveStops: DriveStop[] = [
  {
    id: "rocheport",
    name: "Rocheport",
    category: "Small town · Local food",
    reason:
      "A compact river town with a walkable main street and an easy lunch stop near the route.",
    detourMinutes: 12,
    gasCost: 2.1,
    visitMinutes: 60,
    image:
      "https://images.unsplash.com/photo-1722101503175-942f45bc1c95?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=800",
    interests: ["Small towns", "Local food"],
    x: 42,
    y: 48,
    lookup: "pending",
    sourceLabel: "Source lookup pending",
    lessExplored: true,
    learned:
      "The town grew around river trade and still feels closely tied to the Missouri.",
  },
  {
    id: "katy-trail",
    name: "Katy Trail overlook",
    category: "Nature · Scenic spot",
    reason:
      "A short leg-stretch with river views and shaded trail access without a major reroute.",
    detourMinutes: 14,
    gasCost: 2.4,
    visitMinutes: 45,
    image:
      "https://images.unsplash.com/photo-1563317596-9f46b0d0d5cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=800",
    interests: ["Nature"],
    x: 52,
    y: 38,
    lookup: "demo",
    sourceLabel: "Cached demo data",
    sourceUrl: "https://mostateparks.com/park/katy-trail-state-park",
    learned:
      "This rail-to-trail corridor follows landscapes that are easy to miss from the interstate.",
  },
  {
    id: "arrow-rock",
    name: "Arrow Rock",
    category: "History · Architecture",
    reason:
      "A preserved village of brick storefronts and early Missouri architecture just north of the highway.",
    detourMinutes: 18,
    gasCost: 3.2,
    visitMinutes: 75,
    image:
      "https://images.unsplash.com/photo-1629551383145-cf05865104f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=800",
    interests: ["History", "Architecture", "Small towns"],
    x: 34,
    y: 34,
    lookup: "pending",
    sourceLabel: "Verification pending",
    sourceUrl: "https://mostateparks.com/park/arrow-rock-state-historic-site",
    lessExplored: true,
    learned:
      "Its street plan and surviving buildings show how a river settlement became a regional hub.",
  },
  {
    id: "fulton",
    name: "Fulton historic district",
    category: "History · Quirky stops",
    reason:
      "A college town with preserved architecture and an unexpected Cold War history connection.",
    detourMinutes: 22,
    gasCost: 3.9,
    visitMinutes: 60,
    interests: ["History", "Architecture", "Quirky stops"],
    x: 61,
    y: 45,
    lookup: "failed",
    sourceLabel: "Lookup failed",
    learned:
      "The town’s international history sits alongside a very local courthouse square.",
  },
  {
    id: "hermann",
    name: "Hermann",
    category: "Architecture · Local food",
    reason:
      "German-influenced streets, local bakeries, and river scenery make it a rewarding longer detour.",
    detourMinutes: 34,
    gasCost: 5.8,
    visitMinutes: 90,
    image:
      "https://images.unsplash.com/photo-1702391794650-261670c76e92?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=800",
    interests: ["Architecture", "Local food", "Small towns"],
    x: 70,
    y: 58,
    lookup: "demo",
    sourceLabel: "Cached demo data",
    learned:
      "The town’s building traditions reflect generations of German migration along the river.",
  },
]

export const sampleDiscoveries: CommunityDiscovery[] = [
  {
    id: "discovery-river",
    place: "Missouri River bend",
    caption:
      "We pulled over at dusk and watched the light move across the floodplain.",
    image:
      "https://images.unsplash.com/photo-1722101503175-942f45bc1c95?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=600",
    x: 47,
    y: 62,
    count: 4,
    sample: true,
  },
  {
    id: "discovery-trail",
    place: "Katy Trail",
    caption:
      "A quiet trailhead with cottonwoods, birds, and almost no highway noise.",
    image:
      "https://images.unsplash.com/photo-1563317596-9f46b0d0d5cf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=600",
    x: 57,
    y: 27,
    count: 2,
    sample: true,
  },
  {
    id: "discovery-bridge",
    place: "Old river bridge",
    caption: "The best unplanned ten minutes of our drive.",
    image:
      "https://images.unsplash.com/photo-1629551383145-cf05865104f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=600",
    x: 78,
    y: 39,
    count: 1,
    sample: true,
  },
]

export const trips: TripSummary[] = [
  {
    id: "puglia",
    mode: "fly",
    title: "A slow week in Puglia",
    route: "New York → Bari",
    date: "Jun 18–25",
    status: "Ready to review",
    image:
      "https://images.unsplash.com/photo-1770493967117-6ae3927c0d05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=900",
  },
  {
    id: "kc-stl",
    mode: "drive",
    title: "The river road east",
    route: "Kansas City → St. Louis",
    date: "Flexible",
    status: "Cached demo",
    image:
      "https://images.unsplash.com/photo-1722101503175-942f45bc1c95?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=900",
  },
  {
    id: "kc-omaha",
    mode: "drive",
    title: "Missouri Valley towns",
    route: "Kansas City → Omaha",
    date: "No date",
    status: "Cached demo",
    image:
      "https://images.unsplash.com/photo-1702391815689-451f83eec1d3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=900",
  },
  {
    id: "kc-wichita",
    mode: "drive",
    title: "Prairie architecture",
    route: "Kansas City → Wichita",
    date: "No date",
    status: "Cached demo",
    image:
      "https://images.unsplash.com/photo-1782852528917-8dd46c079132?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=82&w=900",
  },
]
