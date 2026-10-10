import { config } from "../../../config/env";
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

export const profileService: ProfileService = config.useMocks ? mockProfileService : httpProfileService;
