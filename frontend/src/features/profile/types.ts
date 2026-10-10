/** Data contracts for the profile feature. */

export interface UserProfile {
  name: string;
  plan: string;
  email: string;
  /** Free text, e.g. "Brooklyn, NY". Optional. */
  homeAddress: string;
  /** Default departure airport, e.g. "New York · JFK". Sent to the agent with the travel preferences. */
  homeAirport: string;
  /** e.g. "2 adults". */
  defaultTravelers: string;
  /** Profile photo as a data URL; when missing, the avatar shows initials. */
  avatarUrl?: string;
}

/** The fields the traveler can edit on the Settings profile card. */
export type ProfileChanges = Partial<Pick<UserProfile, "name" | "email" | "homeAddress" | "homeAirport" | "avatarUrl">>;
