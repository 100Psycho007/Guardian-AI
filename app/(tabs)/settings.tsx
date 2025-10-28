import React from 'react';
import { Text } from 'react-native-paper';
import { ThemedView } from '../../components/Themed';

export default function SettingsScreen() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text variant="headlineMedium">Settings</Text>
    </ThemedView>
  );
}
