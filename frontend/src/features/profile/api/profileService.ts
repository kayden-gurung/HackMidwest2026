import { api } from "../../../lib/apiClient";
import { mockResponse } from "../../../lib/mock";
import type { UserProfile } from "../types";
import { mockProfile } from "./mockData";

export interface ProfileService {
  getProfile(): Promise<UserProfile>;
}

export const mockProfileService: ProfileService = {
  getProfile: () => mockResponse(mockProfile),
};

/** PROPOSED endpoint: not implemented in backend/ yet. */
export const httpProfileService: ProfileService = {
  getProfile: () => api.get<UserProfile>("/api/me"),
};

// The backend has no /api/me yet, so the sample profile is used in both mock and real mode.
// Otherwise the sidebar's profile card fails with mocks off, taking the Settings button with it.
// Switch this to httpProfileService once the endpoint exists.
export const profileService: ProfileService = mockProfileService;
