import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const ONBOARDING_COMPLETE_KEY = 'onboarding:completed';
export const BIOMETRIC_SESSION_KEY = 'auth:biometric_session';
export const BIOMETRIC_ENABLED_KEY = 'auth:biometric_enabled';
export const LAST_EMAIL_KEY = 'auth:last_email';
export const THEME_PREFERENCE_KEY = 'settings:theme_preference';
export const PUSH_NOTIFICATIONS_ENABLED_KEY = 'settings:push_enabled';
export const PUSH_NOTIFICATIONS_TOKEN_KEY = 'settings:push_token';

export type ThemePreferenceValue = 'system' | 'light' | 'dark';

export type StoredBiometricSession = {
  refresh_token: string;
  access_token: string;
};

export async function setOnboardingComplete(completed: boolean = true) {
  if (completed) {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
  }
}

export async function isOnboardingComplete() {
  const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
  return value === 'true';
}

export async function saveBiometricSession(session: StoredBiometricSession) {
  await SecureStore.setItemAsync(BIOMETRIC_SESSION_KEY, JSON.stringify(session));
}

export async function readBiometricSession(): Promise<StoredBiometricSession | null> {
  const value = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY);
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as StoredBiometricSession;
    if (parsed.refresh_token && parsed.access_token) {
      return parsed;
    }
  } catch (error) {
    // fall through to cleanup below
  }

  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY);
  return null;
}

export async function clearBiometricSession() {
  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY);
}

export async function setBiometricEnabled(enabled: boolean) {
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  }
}

export async function isBiometricEnabled() {
  const value = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return value === 'true';
}

export async function saveLastEmail(email: string) {
  await AsyncStorage.setItem(LAST_EMAIL_KEY, email);
}

export async function readLastEmail() {
  const value = await AsyncStorage.getItem(LAST_EMAIL_KEY);
  return value ?? null;
}

export async function clearLastEmail() {
  await AsyncStorage.removeItem(LAST_EMAIL_KEY);
}

function getUserScopedKey(baseKey: string, userId: string) {
  return `${baseKey}:${userId}`;
}

export async function readThemePreference(): Promise<ThemePreferenceValue | null> {
  const value = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return null;
}

export async function saveThemePreference(preference: ThemePreferenceValue) {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
}

export async function clearThemePreference() {
  await AsyncStorage.removeItem(THEME_PREFERENCE_KEY);
}

export async function readNotificationPreference(userId: string) {
  const key = getUserScopedKey(PUSH_NOTIFICATIONS_ENABLED_KEY, userId);
  const value = await AsyncStorage.getItem(key);
  return value === 'true';
}

export async function saveNotificationPreference(userId: string, enabled: boolean) {
  const key = getUserScopedKey(PUSH_NOTIFICATIONS_ENABLED_KEY, userId);
  if (enabled) {
    await AsyncStorage.setItem(key, 'true');
  } else {
    await AsyncStorage.removeItem(key);
  }
}

export async function readNotificationToken(userId: string) {
  const key = getUserScopedKey(PUSH_NOTIFICATIONS_TOKEN_KEY, userId);
  const value = await AsyncStorage.getItem(key);
  return value ?? null;
}

export async function saveNotificationToken(userId: string, token: string) {
  const key = getUserScopedKey(PUSH_NOTIFICATIONS_TOKEN_KEY, userId);
  await AsyncStorage.setItem(key, token);
}

export async function clearNotificationToken(userId: string) {
  const key = getUserScopedKey(PUSH_NOTIFICATIONS_TOKEN_KEY, userId);
  await AsyncStorage.removeItem(key);
}

export async function clearNotificationPreference(userId: string) {
  await saveNotificationPreference(userId, false);
  await clearNotificationToken(userId);
}
