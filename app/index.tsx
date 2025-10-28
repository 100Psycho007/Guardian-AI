import React from 'react';
import { ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { ThemedView } from '../components/Themed';
import { useAuth } from '../hooks/useAuth';
import { isOnboardingComplete } from '../lib/storage';

export default function Index() {
  const router = useRouter();
  const { session, initializing } = useAuth();
  const hasNavigatedRef = React.useRef(false);
  const [checkingOnboarding, setCheckingOnboarding] = React.useState(true);
  const [onboardingComplete, setOnboardingComplete] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let isActive = true;

    const loadOnboardingStatus = async () => {
      try {
        const completed = await isOnboardingComplete();
        if (isActive) {
          setOnboardingComplete(completed);
        }
      } finally {
        if (isActive) {
          setCheckingOnboarding(false);
        }
      }
    };

    loadOnboardingStatus();

    return () => {
      isActive = false;
    };
  }, []);

  React.useEffect(() => {
    if (hasNavigatedRef.current) return;
    if (initializing || checkingOnboarding || onboardingComplete === null) return;

    if (!onboardingComplete) {
      hasNavigatedRef.current = true;
      router.replace('/onboarding');
      return;
    }

    if (session) {
      hasNavigatedRef.current = true;
      router.replace('/(tabs)');
      return;
    }

    hasNavigatedRef.current = true;
    router.replace('/(auth)/sign-in');
  }, [initializing, checkingOnboarding, onboardingComplete, session, router]);

  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator animating size="large" accessibilityLabel="Loading app" />
    </ThemedView>
  );
}
