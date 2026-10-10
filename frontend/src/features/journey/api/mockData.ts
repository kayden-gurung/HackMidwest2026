// MOCK DATA: options and defaults from the Figma design. Defaults should come from the traveler's settings once they exist.

export const vibes = ["Beach & coast", "Big adventure", "Food first", "City energy", "Rest & reset", "Surprise me"];

/** Range of the budget slider. Typed amounts can go above the max; the slider then sits at the end. */
export const budgetSliderUsd = { min: 500, max: 20000, step: 100 };

/** Party size limits, matching `travelers` 1–10 in TEAM_PLAN.md. */
export const travelerLimits = { maxTotal: 10, minAdults: 1 };

export const journeyDefaults = {
  vibe: "Beach & coast",
  budgetUsd: 3000 as number | null,
  origin: "New York · JFK",
  adults: 2,
  children: 0,
};
