import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';

import type { Profile } from '../lib/supabase';

const AUTH_STORE_KEY = 'auth-store';

export type AuthState = {
  session: Session | null;
  profile: Profile | null;
  deviceToken: string | null;
  hasHydrated: boolean;
};

export type AuthActions = {
  setSession: (session: Session | null, profile?: Profile | null) => void;
  setProfile: (profile: Profile | null) => void;
  setDeviceToken: (token: string | null) => void;
  logout: () => Promise<void>;
  setHasHydrated: (value: boolean) => void;
};

export type AuthStore = AuthState & AuthActions;

const baseState: Omit<AuthState, 'hasHydrated'> = {
  session: null,
  profile: null,
  deviceToken: null,
};

const secureStorage = {
  getItem: async (name: string) => {
    const value = await SecureStore.getItemAsync(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...baseState,
      hasHydrated: false,
      setSession: (session, profile) =>
        set((state) => ({
          session,
          profile: profile !== undefined ? profile : session ? state.profile : null,
        })),
      setProfile: (profile) => set({ profile }),
      setDeviceToken: (token) => set({ deviceToken: token }),
      logout: async () => {
        set({ ...baseState });
      },
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: AUTH_STORE_KEY,
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        session: state.session,
        profile: state.profile,
        deviceToken: state.deviceToken,
      }),
      onRehydrateStorage: () => (state, error) => {
        state?.setHasHydrated(true);
        if (error) {
          console.warn('Failed to restore auth store state', error);
        }
      },
    },
  ),
);

export const selectAuthSession = (state: AuthStore) => state.session;
export const selectAuthProfile = (state: AuthStore) => state.profile;
export const selectAuthDeviceToken = (state: AuthStore) => state.deviceToken;
export const selectAuthIsHydrated = (state: AuthStore) => state.hasHydrated;
export const selectIsSignedIn = (state: AuthStore) => Boolean(state.session);
