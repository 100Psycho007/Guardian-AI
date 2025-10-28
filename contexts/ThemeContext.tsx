import React from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { getTheme } from '../lib/theme';
import {
  ThemePreferenceValue,
  readThemePreference,
  saveThemePreference,
} from '../lib/storage';

export type ThemePreference = ThemePreferenceValue;

export type ThemeContextValue = {
  theme: ReturnType<typeof getTheme>;
  colorScheme: 'light' | 'dark';
  preference: ThemePreference;
  isDarkMode: boolean;
  isUsingSystem: boolean;
  isReady: boolean;
  setPreference: (preference: ThemePreference) => Promise<{ error?: string }>;
  setDarkMode: (enabled: boolean) => Promise<{ error?: string }>;
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = React.useState<ThemePreference>('system');
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    const loadPreference = async () => {
      try {
        const stored = await readThemePreference();
        if (!active) return;
        if (stored) {
          setPreferenceState(stored);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to read theme preference', error);
        }
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    };

    loadPreference();

    return () => {
      active = false;
    };
  }, []);

  const resolvedScheme = React.useMemo<'light' | 'dark'>(() => {
    if (preference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemScheme]);

  const theme = React.useMemo(() => getTheme(resolvedScheme), [resolvedScheme]);

  const persistPreference = React.useCallback(async (nextPreference: ThemePreference) => {
    try {
      await saveThemePreference(nextPreference);
      setPreferenceState(nextPreference);
      setHydrated(true);
      return {} as const;
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to persist theme preference', error);
      }
      return { error: 'Unable to update appearance preference. Please try again.' } as const;
    }
  }, []);

  const setPreference = React.useCallback(
    async (nextPreference: ThemePreference) => {
      return persistPreference(nextPreference);
    },
    [persistPreference],
  );

  const setDarkMode = React.useCallback(
    async (enabled: boolean) => {
      return persistPreference(enabled ? 'dark' : 'light');
    },
    [persistPreference],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      colorScheme: resolvedScheme,
      preference,
      isDarkMode: resolvedScheme === 'dark',
      isUsingSystem: preference === 'system',
      isReady: hydrated,
      setPreference,
      setDarkMode,
    }),
    [theme, resolvedScheme, preference, hydrated, setPreference, setDarkMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeController() {
  const context = React.useContext(ThemeContext);

  if (!context) {
    throw new Error('useThemeController must be used within a ThemeProvider');
  }

  return context;
}
