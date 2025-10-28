import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

export type AuthStoreState = {
  session: Session | null;
  initializing: boolean;
  biometricAvailable: boolean;
  isBiometricEnabled: boolean;
  lastSignInEmail: string | null;
};

export type AuthStoreActions = {
  setSession: (session: Session | null) => void;
  setInitializing: (initializing: boolean) => void;
  setBiometricAvailable: (available: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setLastSignInEmail: (email: string | null) => void;
  reset: () => void;
};

export type AuthStore = AuthStoreState & AuthStoreActions;

const initialState: AuthStoreState = {
  session: null,
  initializing: true,
  biometricAvailable: false,
  isBiometricEnabled: false,
  lastSignInEmail: null,
};

function createInitialState(): AuthStoreState {
  return { ...initialState };
}

export const useAuthStore = create<AuthStore>((set) => ({
  ...createInitialState(),
  setSession: (session) => set({ session }),
  setInitializing: (initializing) => set({ initializing }),
  setBiometricAvailable: (available) => set({ biometricAvailable: available }),
  setBiometricEnabled: (enabled) => set({ isBiometricEnabled: enabled }),
  setLastSignInEmail: (email) => set({ lastSignInEmail: email }),
  reset: () => set(() => createInitialState()),
}));

export function resetAuthStore() {
  useAuthStore.getState().reset();
}
