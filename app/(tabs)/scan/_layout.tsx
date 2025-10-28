import React from 'react';
import { Stack } from 'expo-router';

export default function ScanStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ title: 'Scan History' }} />
      <Stack.Screen name="result/[id]" options={{ title: 'Scan Result' }} />
    </Stack>
  );
}
