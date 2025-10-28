import React from 'react';
import { Button, Text } from 'react-native-paper';
import { Link } from 'expo-router';
import { ThemedView } from '../../../components/Themed';

export default function ScanScreen() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text variant="headlineMedium" style={{ marginBottom: 12 }}>
        Scan
      </Text>
      <Text style={{ marginBottom: 24 }}>This is a placeholder Scan screen.</Text>
      <Link href="/(tabs)/scan/history" asChild>
        <Button mode="contained">View Scan History</Button>
      </Link>
    </ThemedView>
  );
}
