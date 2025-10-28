import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../hooks/useAuth';

export default function AuthLayout() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return null;
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
