import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { Button, HelperText, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '../../components/Themed';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignInFormValues = {
  email: string;
  password: string;
  enableBiometric: boolean;
};

export default function SignInScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { showToast } = useToast();
  const {
    signIn,
    signInWithBiometrics,
    biometricAvailable,
    isBiometricEnabled,
    lastSignInEmail,
  } = useAuth();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [biometricLoading, setBiometricLoading] = React.useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<SignInFormValues>({
    defaultValues: {
      email: lastSignInEmail ?? '',
      password: '',
      enableBiometric: isBiometricEnabled,
    },
  });

  React.useEffect(() => {
    if (lastSignInEmail) {
      setValue('email', lastSignInEmail);
    }
  }, [lastSignInEmail, setValue]);


  const onSubmit = async (values: SignInFormValues) => {
    setErrorMessage(null);
    const result = await signIn(values);
    if (result.error) {
      setErrorMessage(result.error);
      showToast({ message: result.error, type: 'error', source: 'auth.sign_in' });
      return;
    }
    showToast({ message: 'Signed in successfully.', type: 'success', source: 'auth.sign_in' });
    router.replace('/(tabs)');
  };

  const handleBiometric = async () => {
    setErrorMessage(null);
    setBiometricLoading(true);
    try {
      const result = await signInWithBiometrics();
      if (result.error) {
        setErrorMessage(result.error);
        showToast({ message: result.error, type: 'error', source: 'auth.sign_in_biometrics' });
        return;
      }
      showToast({ message: 'Signed in with biometrics.', type: 'success', source: 'auth.sign_in_biometrics' });
      router.replace('/(tabs)');
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 48 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel="Sign in form"
          >
            <View style={styles.headingContainer}>
              <Text variant="headlineMedium" accessibilityRole="header">
                Welcome back
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Sign in to continue to your dashboard.
              </Text>
            </View>

            {errorMessage ? (
              <Text
                variant="bodyMedium"
                style={[styles.formError, { color: theme.colors.error }]}
                accessibilityRole="alert"
              >
                {errorMessage}
              </Text>
            ) : null}

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
                  textContentType="password"
                  accessibilityLabel="Password"
                  error={Boolean(errors.password)}
                  style={styles.input}
                  returnKeyType="done"
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

            {biometricAvailable && (
              <Controller
                control={control}
                name="enableBiometric"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyLarge">Enable biometric login</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Unlock the app with Touch ID or Face ID next time.
                      </Text>
                    </View>
                    <Switch
                      value={value}
                      onValueChange={onChange}
                      accessibilityLabel="Enable biometric login"
                    />
                  </View>
                )}
              />
            )}

            <Button
              mode="contained"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={isSubmitting}
              accessibilityLabel="Sign in"
            >
              Sign in
            </Button>

            {biometricAvailable && isBiometricEnabled && (
              <Button
                mode="outlined"
                icon="fingerprint"
                onPress={handleBiometric}
                loading={biometricLoading}
                disabled={biometricLoading || isSubmitting}
                accessibilityLabel="Unlock with biometrics"
              >
                Unlock with biometrics
              </Button>
            )}

            <View style={styles.footerRow}>
              <Text variant="bodyMedium">Don't have an account?</Text>
              <Link href="/(auth)/sign-up" asChild>
                <Button mode="text" accessibilityLabel="Create an account">
                  Register
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
  formError: {
    marginBottom: 8,
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
