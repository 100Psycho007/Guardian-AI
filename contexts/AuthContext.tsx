import React from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import type { Session } from '@supabase/supabase-js';

import {
  clearBiometricSession,
  isBiometricEnabled as readBiometricEnabled,
  readBiometricSession,
  readLastEmail,
  saveBiometricSession,
  saveLastEmail,
  setBiometricEnabled as persistBiometricEnabled,
} from '../lib/storage';
import { supabase } from '../lib/supabase';
import { resetAuthStore, useAuthStore } from '../store/authStore';

export type SignInCredentials = {
  email: string;
  password: string;
  enableBiometric: boolean;
};

export type SignUpCredentials = {
  email: string;
  password: string;
  enableBiometric: boolean;
  fullName?: string;
};

export type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  signIn: (credentials: SignInCredentials) => Promise<{ error?: string }>;
  signUp: (credentials: SignUpCredentials) => Promise<{ error?: string; needsVerification?: boolean }>;
  signOut: () => Promise<void>;
  biometricAvailable: boolean;
  isBiometricEnabled: boolean;
  signInWithBiometrics: () => Promise<{ error?: string }>;
  setBiometricPreference: (enabled: boolean) => Promise<{ error?: string }>;
  lastSignInEmail: string | null;
};

export const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

async function determineBiometricAvailability() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch (error) {
    if (__DEV__) {
      console.warn('Biometric availability check failed', error);
    }
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    session,
    initializing,
    biometricAvailable,
    isBiometricEnabled,
    lastSignInEmail,
    setSession,
    setInitializing,
    setBiometricAvailable,
    setBiometricEnabled,
    setLastSignInEmail,
  } = useAuthStore();

  const persistBiometricTokens = React.useCallback(
    async (nextSession: Session) => {
      if (!nextSession?.refresh_token || !nextSession?.access_token) return;

      const payload = {
        refresh_token: nextSession.refresh_token,
        access_token: nextSession.access_token,
      };

      await saveBiometricSession(payload);
      await persistBiometricEnabled(true);
      setBiometricEnabled(true);
    },
    [setBiometricEnabled],
  );

  const clearBiometricPreference = React.useCallback(async () => {
    await clearBiometricSession();
    await persistBiometricEnabled(false);
    setBiometricEnabled(false);
  }, [setBiometricEnabled]);

  React.useEffect(() => {
    return () => {
      resetAuthStore();
    };
  }, []);

  React.useEffect(() => {
    let isActive = true;
    setInitializing(true);

    const initialize = async () => {
      try {
        const [sessionResult, biometricEnabled, storedSession, storedEmail, availability] = await Promise.all([
          supabase.auth.getSession(),
          readBiometricEnabled(),
          readBiometricSession(),
          readLastEmail(),
          determineBiometricAvailability(),
        ]);

        if (!isActive) return;

        setSession(sessionResult.data.session ?? null);
        setBiometricEnabled(Boolean(biometricEnabled && storedSession));
        setLastSignInEmail(storedEmail);
        setBiometricAvailable(availability);
      } catch (error) {
        if (__DEV__) {
          console.warn('Auth initialization failed', error);
        }
      } finally {
        if (isActive) {
          setInitializing(false);
        }
      }
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [setSession, setBiometricEnabled, setLastSignInEmail, setBiometricAvailable, setInitializing]);

  React.useEffect(() => {
    let cancelled = false;

    const refreshAvailability = async () => {
      const availability = await determineBiometricAvailability();
      if (!cancelled) {
        setBiometricAvailable(availability);
      }
    };

    void refreshAvailability();

    return () => {
      cancelled = true;
    };
  }, [setBiometricAvailable]);

  React.useEffect(() => {
    if (!session || !isBiometricEnabled) return;

    if (!session.refresh_token || !session.access_token) return;

    // Keep stored session fresh when tokens rotate
    persistBiometricTokens(session).catch((error) => {
      if (__DEV__) {
        console.warn('Failed to persist biometric session', error);
      }
    });
  }, [session, isBiometricEnabled, persistBiometricTokens]);

  const signIn = React.useCallback(
    async ({ email, password, enableBiometric }: SignInCredentials) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        return { error: error.message };
      }

      const nextSession = data.session ?? null;
      setSession(nextSession);
      await saveLastEmail(email);
      setLastSignInEmail(email);

      if (nextSession && enableBiometric) {
        await persistBiometricTokens(nextSession);
      } else if (!enableBiometric) {
        await clearBiometricPreference();
      }

      return {};
    },
    [setSession, setLastSignInEmail, persistBiometricTokens, clearBiometricPreference],
  );

  const signUp = React.useCallback(
    async ({ email, password, fullName, enableBiometric }: SignUpCredentials) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: fullName ? { full_name: fullName } : undefined,
        },
      });

      if (error) {
        return { error: error.message };
      }

      const nextSession = data.session ?? null;

      if (nextSession) {
        setSession(nextSession);
        await saveLastEmail(email);
        setLastSignInEmail(email);

        if (enableBiometric) {
          await persistBiometricTokens(nextSession);
        } else {
          await clearBiometricPreference();
        }
      }

      return { needsVerification: !nextSession };
    },
    [setSession, setLastSignInEmail, persistBiometricTokens, clearBiometricPreference],
  );

  const signOut = React.useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    await clearBiometricPreference();
    setSession(null);
  }, [clearBiometricPreference, setSession]);

  const signInWithBiometrics = React.useCallback(async () => {
    if (!biometricAvailable) {
      return { error: 'Biometric authentication is not available on this device.' };
    }

    const storedSession = await readBiometricSession();

    if (!storedSession) {
      await clearBiometricPreference();
      return { error: 'Biometric session unavailable. Sign in with your password to re-enable.' };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock with biometrics',
      fallbackLabel: 'Enter passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      return { error: result.error || 'Authentication was cancelled.' };
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: storedSession.access_token,
      refresh_token: storedSession.refresh_token,
    });

    if (error) {
      await clearBiometricPreference();
      return { error: error.message };
    }

    const nextSession = data.session ?? null;
    setSession(nextSession);

    if (nextSession?.user?.email) {
      await saveLastEmail(nextSession.user.email);
      setLastSignInEmail(nextSession.user.email);
    }

    if (nextSession) {
      await persistBiometricTokens(nextSession);
    }

    return {};
  }, [biometricAvailable, clearBiometricPreference, setSession, setLastSignInEmail, persistBiometricTokens]);

  const setBiometricPreference = React.useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        await clearBiometricPreference();
        return {};
      }

      if (!biometricAvailable) {
        return { error: 'Biometric authentication is not available on this device.' };
      }

      if (!session) {
        return { error: 'Sign in to enable biometric authentication.' };
      }

      if (!session.refresh_token || !session.access_token) {
        return { error: 'A valid session is required to enable biometrics.' };
      }

      await persistBiometricTokens(session);
      return {};
    },
    [biometricAvailable, session, clearBiometricPreference, persistBiometricTokens],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      signIn,
      signUp,
      signOut,
      biometricAvailable,
      isBiometricEnabled,
      signInWithBiometrics,
      setBiometricPreference,
      lastSignInEmail,
    }),
    [
      session,
      initializing,
      signIn,
      signUp,
      signOut,
      biometricAvailable,
      isBiometricEnabled,
      signInWithBiometrics,
      setBiometricPreference,
      lastSignInEmail,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }

  return context;
}
