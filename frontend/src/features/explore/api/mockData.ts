import type { DestinationIdea } from "../types";

// MOCK DATA: destinations and images from the Figma design. Tags are our own labels so the filters work.
// Personalized suggestions should come from the agent once it can read the traveler's preferences.

export const destinationIdeas: DestinationIdea[] = [
  {
    id: "madeira",
    title: "Coastal quiet",
    place: "Madeira, Portugal",
    fromPriceUsd: 1940,
    days: 7,
    tags: ["Beach", "Outdoors"],
    imageUrl: "https://images.unsplash.com/photo-1766866794128-4e87ba6fa53d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=900",
  },
  {
    id: "busan",
    title: "Mountains to sea",
    place: "Busan, South Korea",
    fromPriceUsd: 2280,
    days: 7,
    tags: ["Outdoors", "Food", "Culture"],
    imageUrl: "https://images.unsplash.com/photo-1771406117596-e7a09655527b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=900",
  },
  {
    id: "naples",
    title: "Food by the bay",
    place: "Naples, Italy",
    fromPriceUsd: 1720,
    days: 7,
    tags: ["Food", "Culture", "Beach"],
    imageUrl: "https://images.unsplash.com/photo-1773600876856-338c2e99cd45?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixlib=rb-4.1.0&q=85&w=900",
  },
];

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
