import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { Button, HelperText, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '../../components/Themed';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignUpFormValues = {
  fullName?: string;
  email: string;
  password: string;
  confirmPassword: string;
  enableBiometric: boolean;
};

export default function SignUpScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { showToast } = useToast();
  const { signUp, biometricAvailable, isBiometricEnabled } = useAuth();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = React.useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormValues>({
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      enableBiometric: biometricAvailable && isBiometricEnabled,
    },
  });

  const onSubmit = async (values: SignUpFormValues) => {
    setErrorMessage(null);
    setInfoMessage(null);

    if (values.password !== values.confirmPassword) {
      const message = 'Passwords do not match.';
      setErrorMessage(message);
      showToast({ message, type: 'error', source: 'auth.sign_up' });
      return;
    }

    const { confirmPassword, fullName, ...rest } = values;

    const result = await signUp({
      email: rest.email,
      password: rest.password,
      enableBiometric: rest.enableBiometric,
      fullName: fullName?.trim() ? fullName.trim() : undefined,
    });

    if (result.error) {
      setErrorMessage(result.error);
      showToast({ message: result.error, type: 'error', source: 'auth.sign_up' });
      return;
    }

    if (result.needsVerification) {
      const message = 'Check your email inbox to confirm your account before signing in.';
      setInfoMessage(message);
      showToast({ message, type: 'info', source: 'auth.sign_up' });
      return;
    }

    showToast({ message: 'Account created. Welcome aboard!', type: 'success', source: 'auth.sign_up' });
    router.replace('/(tabs)');
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.headingContainer}>
              <Text variant="headlineMedium" accessibilityRole="header">
                Create your account
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Join to start scanning securely.
              </Text>
            </View>

            {errorMessage ? (
              <Text
                variant="bodyMedium"
                style={[styles.feedbackMessage, { color: theme.colors.error }]}
                accessibilityRole="alert"
              >
                {errorMessage}
              </Text>
            ) : null}

            {infoMessage ? (
              <Text
                variant="bodyMedium"
                style={[styles.feedbackMessage, { color: theme.colors.primary }]}
                accessibilityRole="text"
              >
                {infoMessage}
              </Text>
            ) : null}

            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Full name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  textContentType="name"
                  accessibilityLabel="Full name"
                  style={styles.input}
                />
              )}
            />

            <Controller
              control={control}
              name="email"
              rules={{
                required: 'Email is required',
                pattern: {
                  value: emailPattern,
                  message: 'Enter a valid email address',
                },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Email"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  accessibilityLabel="Email address"
                  error={Boolean(errors.email)}
                  style={styles.input}
                  returnKeyType="next"
                />
              )}
            />
            {errors.email ? <HelperText type="error">{errors.email.message}</HelperText> : null}

            <Controller
              control={control}
              name="password"
              rules={{
                required: 'Password is required',
                minLength: {
                  value: 6,
                  message: 'Password must be at least 6 characters',
                },
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry={!passwordVisible}
                  textContentType="newPassword"
                  accessibilityLabel="Password"
                  error={Boolean(errors.password)}
                  style={styles.input}
                  returnKeyType="next"
                  right={
                    <TextInput.Icon
                      icon={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                      onPress={() => setPasswordVisible((prev) => !prev)}
                      forceTextInputFocus={false}
                    />
                  }
                />
              )}
            />
            {errors.password ? <HelperText type="error">{errors.password.message}</HelperText> : null}

            <Controller
              control={control}
              name="confirmPassword"
              rules={{
                required: 'Confirm your password',
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Confirm password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry={!confirmPasswordVisible}
                  textContentType="password"
                  accessibilityLabel="Confirm password"
                  error={Boolean(errors.confirmPassword)}
                  style={styles.input}
                  returnKeyType="done"
                  right={
                    <TextInput.Icon
                      icon={confirmPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                      onPress={() => setConfirmPasswordVisible((prev) => !prev)}
                      forceTextInputFocus={false}
                    />
                  }
                />
              )}
            />
            {errors.confirmPassword ? <HelperText type="error">{errors.confirmPassword.message}</HelperText> : null}

            {biometricAvailable && (
              <Controller
                control={control}
                name="enableBiometric"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyLarge">Enable biometric login</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Save this device for quick, secure access.
                      </Text>
                    </View>
                    <Switch value={value} onValueChange={onChange} accessibilityLabel="Enable biometric login" />
                  </View>
                )}
              />
            )}

            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={isSubmitting}
              accessibilityLabel="Create account"
            >
              Sign up
            </Button>

            <View style={styles.footerRow}>
              <Text variant="bodyMedium">Already have an account?</Text>
              <Link href="/(auth)/sign-in" asChild>
                <Button mode="text" accessibilityLabel="Go to sign in">
                  Sign in
                </Button>
              </Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
  headingContainer: {
    marginTop: 32,
    marginBottom: 8,
    gap: 8,
  },
  feedbackMessage: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'transparent',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
