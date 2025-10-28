import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';

export type AppTheme = MD3Theme;

export function getTheme(colorScheme: 'light' | 'dark'): AppTheme {
  const base = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: '#2563eb',
      secondary: '#64748b',
    },
  } as AppTheme;
}
