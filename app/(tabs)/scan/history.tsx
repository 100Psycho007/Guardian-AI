import React from 'react';
import { Text } from 'react-native-paper';
import { ThemedView } from '../../../components/Themed';

export default function ScanHistoryScreen() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text variant="headlineMedium" style={{ marginBottom: 12 }}>
        Scan History
      </Text>
      <Text>List of previous scans would appear here.</Text>
    </ThemedView>
  );
}
