import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignInScreen from '../app/(auth)/sign-in';
import SignUpScreen from '../app/(auth)/sign-up';
import OnboardingScreen from '../app/onboarding';
import { getTheme } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { setOnboardingComplete } from '../lib/storage';
import type { AuthContextValue } from '../contexts/AuthContext';

jest.mock('../hooks/useAuth');
jest.mock('../lib/storage', () => ({
  setOnboardingComplete: jest.fn().mockResolvedValue(undefined),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockSetOnboardingComplete = setOnboardingComplete as jest.MockedFunction<typeof setOnboardingComplete>;

const theme = getTheme('light');

function renderWithProviders(children: React.ReactNode) {
  return render(
    <SafeAreaProvider>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </SafeAreaProvider>,
  );
}

const mockRouter = (global as unknown as { mockRouter: { replace: jest.Mock; push: jest.Mock; back: jest.Mock } })
  .mockRouter;

function createAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    session: null,
    initializing: false,
    signIn: jest.fn().mockResolvedValue({}),
    signUp: jest.fn().mockResolvedValue({ needsVerification: false }),
    signOut: jest.fn().mockResolvedValue(undefined),
    biometricAvailable: false,
    isBiometricEnabled: false,
    signInWithBiometrics: jest.fn().mockResolvedValue({}),
    setBiometricPreference: jest.fn().mockResolvedValue({}),
    lastSignInEmail: '',
    ...overrides,
  };
}

describe('Authentication flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.replace.mockReset();
    mockRouter.push.mockReset();
    mockRouter.back.mockReset();
  });

  it('validates email input before signing in', async () => {
    const signIn = jest.fn().mockResolvedValue({});

    mockUseAuth.mockReturnValue(createAuthValue({ signIn }));

    const screen = renderWithProviders(<SignInScreen />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'invalid-email');
    fireEvent.press(screen.getByA11yLabel('Sign in'));

    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('submits valid credentials and enables biometric login', async () => {
    const signIn = jest.fn().mockResolvedValue({});

    mockUseAuth.mockReturnValue(
      createAuthValue({
        signIn,
        biometricAvailable: true,
        isBiometricEnabled: false,
      }),
    );

    const screen = renderWithProviders(<SignInScreen />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'user@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'securePass123');
    fireEvent(screen.getByLabelText('Enable biometric login'), 'valueChange', true);
    fireEvent.press(screen.getByA11yLabel('Sign in'));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'securePass123',
        enableBiometric: true,
      });
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('uses biometric login when available', async () => {
    const signInWithBiometrics = jest.fn().mockResolvedValue({});

    mockUseAuth.mockReturnValue(
      createAuthValue({
        signInWithBiometrics,
        biometricAvailable: true,
        isBiometricEnabled: true,
      }),
    );

    const screen = renderWithProviders(<SignInScreen />);

    fireEvent.press(screen.getByA11yLabel('Unlock with biometrics'));

    await waitFor(() => {
      expect(signInWithBiometrics).toHaveBeenCalled();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('prevents account creation when passwords do not match', async () => {
    const signUp = jest.fn().mockResolvedValue({ needsVerification: false });

    mockUseAuth.mockReturnValue(
      createAuthValue({
        signUp,
        biometricAvailable: true,
        isBiometricEnabled: false,
      }),
    );

    const screen = renderWithProviders(<SignUpScreen />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'new@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'password456');
    fireEvent.press(screen.getByA11yLabel('Create account'));

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('creates an account and navigates on success', async () => {
    const signUp = jest.fn().mockResolvedValue({ needsVerification: false });

    mockUseAuth.mockReturnValue(createAuthValue({ signUp }));

    const screen = renderWithProviders(<SignUpScreen />);

    fireEvent.changeText(screen.getByLabelText('Email address'), 'new@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'password123');
    fireEvent.press(screen.getByA11yLabel('Create account'));

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password123',
        enableBiometric: false,
        fullName: undefined,
      });
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('completes onboarding when skipped', async () => {
    mockUseAuth.mockReturnValue(createAuthValue());

    const screen = renderWithProviders(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Skip'));

    await waitFor(() => {
      expect(mockSetOnboardingComplete).toHaveBeenCalledWith(true);
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/sign-in');
  });
});
