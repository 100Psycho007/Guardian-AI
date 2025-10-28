import { useColorScheme as useRNColorScheme } from 'react-native';

export function useThemePreference() {
  const scheme = useRNColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}
