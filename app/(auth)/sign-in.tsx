import React from 'react';
import { Button, Text } from 'react-native-paper';
import { Link } from 'expo-router';
import { ThemedView } from '../../components/Themed';

export default function SignInScreen() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text variant="headlineMedium" style={{ marginBottom: 16 }}>
        Welcome
      </Text>
      <Text style={{ marginBottom: 32 }}>
        This is a placeholder Sign In screen. Continue to the app to verify navigation.
      </Text>
      <Link href="/(tabs)" asChild>
        <Button mode="contained">Continue to App</Button>
      </Link>
    </ThemedView>
  );
}
