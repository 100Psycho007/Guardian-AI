import React from 'react';
import { Button, Text } from 'react-native-paper';
import { Link } from 'expo-router';
import { ThemedView } from '../../components/Themed';

export default function HomeScreen() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text variant="headlineMedium" style={{ marginBottom: 12 }}>
        Home
      </Text>
      <Text style={{ marginBottom: 24 }}>This is the home tab.</Text>
      <Link href="/(tabs)/scan" asChild>
        <Button mode="contained">Go to Scan</Button>
      </Link>
    </ThemedView>
  );
}
