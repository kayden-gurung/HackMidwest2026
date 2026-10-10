import { api } from "../../../lib/apiClient";
import { mockResponse } from "../../../lib/mock";
import type { ProfileChanges, UserProfile } from "../types";
import { profileStore } from "./profileStore";

export interface ProfileService {
  getProfile(): Promise<UserProfile>;
  /** Saves profile edits and resolves with the updated profile. */
  updateProfile(changes: ProfileChanges): Promise<UserProfile>;
}

export const localProfileService: ProfileService = {
  getProfile: () => mockResponse(profileStore.get()),
  updateProfile: (changes) => {
    profileStore.update(changes);
    return mockResponse(profileStore.get());
  },
};

/** PROPOSED endpoints: not implemented in backend/ yet. */
export const httpProfileService: ProfileService = {
  getProfile: () => api.get<UserProfile>("/api/me"),
  updateProfile: (changes) => api.post<UserProfile>("/api/me", changes),
};

// The backend has no /api/me yet, so the profile is kept locally in both mock and real mode.
// Otherwise the sidebar's profile card fails with mocks off, taking the Settings button with it.
// Switch this to httpProfileService once the endpoint exists (and copy its result into profileStore).
export const profileService: ProfileService = localProfileService;
