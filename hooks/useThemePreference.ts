import { useThemeController } from '../contexts/ThemeContext';

export function useThemePreference() {
  const { colorScheme } = useThemeController();
  return colorScheme;
}
