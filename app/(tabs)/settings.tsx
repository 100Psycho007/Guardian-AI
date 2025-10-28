import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, List, Snackbar, Switch, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedView } from '../../components/Themed';
import { useAuth } from '../../hooks/useAuth';

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session, signOut, biometricAvailable, isBiometricEnabled, setBiometricPreference } = useAuth();
  const [snackbarMessage, setSnackbarMessage] = React.useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = React.useState(false);
  const [signOutLoading, setSignOutLoading] = React.useState(false);

  const toggleBiometric = async () => {
    if (!biometricAvailable) {
      setSnackbarMessage('Biometric authentication is not available on this device.');
      return;
    }

    setToggleLoading(true);
    try {
      const result = await setBiometricPreference(!isBiometricEnabled);
      if (result.error) {
        setSnackbarMessage(result.error);
      } else {
        setSnackbarMessage(
          !isBiometricEnabled ? 'Biometric login enabled for this device.' : 'Biometric login disabled.',
        );
      }
    } finally {
      setToggleLoading(false);
    }
  };

  const handleSignOut = async () => {
    setSignOutLoading(true);
    try {
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      if (__DEV__) {
        console.warn('Error signing out', error);
      }
      setSnackbarMessage('Unable to sign out. Please try again.');
    } finally {
      setSignOutLoading(false);
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.content}>
          <View style={[styles.profileCard, { backgroundColor: theme.colors.surfaceVariant }]} accessibilityRole="summary">
            <Text variant="titleMedium">{session?.user?.email ?? 'Account'}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Signed in user
            </Text>
          </View>

          <List.Section>
            <List.Subheader>Security</List.Subheader>
            <List.Item
              title="Biometric login"
              description={
                biometricAvailable
                  ? 'Use Face ID or Touch ID to unlock the app.'
                  : 'Biometric authentication is not available on this device.'
              }
              right={() => (
                <Switch
                  value={biometricAvailable && isBiometricEnabled}
                  disabled={toggleLoading || !biometricAvailable}
                  onValueChange={toggleBiometric}
                  accessibilityLabel={
                    biometricAvailable ? 'Toggle biometric authentication' : 'Biometric login unavailable'
                  }
                />
              )}
            />
          </List.Section>

          <Button
            mode="contained"
            onPress={handleSignOut}
            loading={signOutLoading}
            disabled={signOutLoading}
            accessibilityLabel="Sign out"
          >
            Sign out
          </Button>
        </View>
        <Snackbar
          visible={Boolean(snackbarMessage)}
          onDismiss={() => setSnackbarMessage(null)}
          duration={4000}
          accessibilityLiveRegion="polite"
        >
          {snackbarMessage}
        </Snackbar>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 24,
  },
  profileCard: {
    borderRadius: 16,
    padding: 16,
  },
});
