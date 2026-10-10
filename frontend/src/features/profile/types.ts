/** Data contracts for the profile feature. */

export interface UserProfile {
  name: string;
  plan: string;
  /** One-line summary shown on the "Your travel style" card. */
  travelStyle: string;
}
