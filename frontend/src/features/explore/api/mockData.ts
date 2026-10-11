import type { DestinationIdea } from "../types";
import { sampleTrips } from "./sampleTrips";

// MOCK DATA: destinations and images from the Figma design. Each idea opens a premade sample trip
// (see ./sampleTrips), and its price, length and tags come from that trip so the filters stay honest.
// Personalized suggestions should come from the agent once it can read the traveler's preferences.

export const destinationIdeas: DestinationIdea[] = sampleTrips.map((trip) => trip.idea);

/** "Because you like local food" row. */
export const foodIdeas = [
  { label: "Market mornings", icon: "utensils" as const, tone: "bg-peach text-coral" },
  { label: "Farm-to-table stays", icon: "hotel" as const, tone: "bg-mint text-sea" },
  { label: "Street food weekends", icon: "utensils" as const, tone: "bg-mint text-sea" },
];

export const featuredCollection = {
  eyebrow: "This week’s escape",
  title: "Go where summer lingers.",
  description: "Three Mediterranean corners with warm water, small towns, and flights under your usual budget.",
  /** Sent to New journey when the traveler opens the collection. */
  prompt: "A warm Mediterranean trip with small coastal towns and warm water",
  imageUrl: "https://images.unsplash.com/photo-1785694420952-d936d514d4ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=1600",
};
