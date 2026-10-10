// MOCK DATA: settings content from the Figma design. Choices are kept in settingsStore (browser memory) and reset on reload.

export const accountProfile = {
  name: "Alex Morgan",
  initials: "AM",
  email: "alex.morgan@example.com",
  homeAirport: "New York · JFK",
  defaultTravelers: "2 adults",
};

export const interestOptions = ["Local food", "Beaches", "Hiking", "Art & culture", "Nightlife", "Wellness", "Shopping", "History"];

export const paceOptions = ["Slow", "Balanced", "Packed"];
export const stayOptions = ["Boutique", "Local", "Any"];

export const planningStyles = [
  { title: "Hands-on", description: "You make the calls. Roam researches and organizes." },
  { title: "Co-pilot", description: "Roam suggests. You review and refine together." },
  { title: "Surprise me", description: "Share a budget and vibe. Roam handles the rest." },
];

export const notificationOptions = [
  { key: "price", title: "Price drops", description: "When saved flight or hotel prices change." },
  { key: "itinerary", title: "Itinerary updates", description: "Reminders and changes for upcoming plans." },
  { key: "inspiration", title: "Travel inspiration", description: "Occasional ideas based on your travel style." },
] as const;

export const currencies = ["USD", "EUR", "GBP"];

export const settingsDefaults = {
  interests: ["Local food", "Beaches", "Hiking"],
  pace: "Slow",
  stay: "Boutique",
  planningStyle: "Co-pilot",
  currency: "USD",
  notifications: { price: true, itinerary: true, inspiration: false },
};
