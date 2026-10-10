// MOCK DATA: options and defaults from the Figma design. Defaults should come from the traveler's settings once they exist.

export const vibes = ["Beach & coast", "Big adventure", "Food first", "City energy", "Rest & reset", "Surprise me"];

export const budgetOptionsUsd = [2000, 3000, 5000];

export const journeyDefaults = {
  vibe: "Beach & coast",
  budgetUsd: 3000,
  flexibleDates: true,
  /** Shown when dates are not flexible. */
  fixedDates: "Jun 18–25",
  origin: "New York · JFK",
  travelers: 2,
};
