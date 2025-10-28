import { useQuery } from '@tanstack/react-query';

import type { Profile } from '../lib/supabase';
import {
  selectAuthDeviceToken,
  selectAuthIsHydrated,
  selectAuthProfile,
  selectAuthSession,
  selectIsSignedIn,
  useAuthStore,
} from '../store/auth';

export function useAuth() {
  const session = useAuthStore(selectAuthSession);
  const profile = useAuthStore(selectAuthProfile);
  const deviceToken = useAuthStore(selectAuthDeviceToken);
  const hasHydrated = useAuthStore(selectAuthIsHydrated);
  const isSignedIn = useAuthStore(selectIsSignedIn);

  const setSession = useAuthStore((state) => state.setSession);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setDeviceToken = useAuthStore((state) => state.setDeviceToken);
  const logout = useAuthStore((state) => state.logout);

  const profileQuery = useQuery({
    queryKey: ['profile', session?.user?.id],
    queryFn: async (): Promise<Profile | null> => profile,
    enabled: Boolean(session?.user?.id),
    initialData: profile,
  });

  return {
    session,
    profile: profileQuery.data ?? null,
    profileQuery,
    deviceToken,
    setSession,
    setProfile,
    setDeviceToken,
    logout,
    hasHydrated,
    isSignedIn,
  };
}
