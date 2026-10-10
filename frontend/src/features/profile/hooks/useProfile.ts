import { useAsync } from "../../../hooks/useAsync";
import { profileService } from "../api/profileService";

export function useProfile() {
  return useAsync(() => profileService.getProfile(), []);
}
