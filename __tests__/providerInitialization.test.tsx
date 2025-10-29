import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { focusManager } from '@tanstack/react-query';

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../store/alertStore', () => {
  const actual = jest.requireActual('../store/alertStore');
  return {
    ...actual,
    resetAlertStore: jest.fn(() => actual.resetAlertStore()),
  };
});

import type { AuthContextValue } from '../contexts/AuthContext';
import { AlertStoreProvider } from '../contexts/AlertStoreContext';
import { ReactQueryProvider } from '../contexts/ReactQueryProvider';
import { useAuth } from '../hooks/useAuth';
import { resetAlertStore } from '../store/alertStore';

const useAuthMock = useAuth as jest.MockedFunction<typeof useAuth>;
const resetAlertStoreMock = resetAlertStore as jest.MockedFunction<typeof resetAlertStore>;

function createAuthValue(userId: string | null): AuthContextValue {
  return {
    session: userId
      ? ({
          user: { id: userId },
        } as AuthContextValue['session'])
      : null,
    initializing: false,
    signIn: jest.fn().mockResolvedValue({}),
    signUp: jest.fn().mockResolvedValue({ needsVerification: false }),
    signOut: jest.fn().mockResolvedValue(undefined),
    biometricAvailable: false,
    isBiometricEnabled: false,
    signInWithBiometrics: jest.fn().mockResolvedValue({}),
    setBiometricPreference: jest.fn().mockResolvedValue({}),
    lastSignInEmail: null,
  };
}

describe('Provider initialization', () => {
  beforeEach(() => {
    resetAlertStore();
    resetAlertStoreMock.mockClear();
    useAuthMock.mockReset();
  });

  it('AlertStoreProvider resets store on mount, user change, and unmount', () => {
    let authValue = createAuthValue('user-1');
    useAuthMock.mockImplementation(() => authValue);

    const { rerender, unmount, getByText } = render(
      <AlertStoreProvider>
        <Text>content</Text>
      </AlertStoreProvider>,
    );

    expect(getByText('content')).toBeTruthy();
    expect(resetAlertStoreMock).toHaveBeenCalledTimes(1);

    resetAlertStoreMock.mockClear();

    authValue = createAuthValue('user-2');

    act(() => {
      rerender(
        <AlertStoreProvider>
          <Text>content</Text>
        </AlertStoreProvider>,
      );
    });

    expect(resetAlertStoreMock).toHaveBeenCalledTimes(2);

    resetAlertStoreMock.mockClear();

    unmount();

    expect(resetAlertStoreMock).toHaveBeenCalledTimes(1);
  });

  it('ReactQueryProvider configures focus handlers and renders children', () => {
    const focusSpy = jest.spyOn(focusManager, 'setEventListener').mockImplementation(() => undefined);

    const { getByText } = render(
      <ReactQueryProvider>
        <Text>react-query-child</Text>
      </ReactQueryProvider>,
    );

    expect(getByText('react-query-child')).toBeTruthy();
    expect(focusSpy).toHaveBeenCalledTimes(1);

    focusSpy.mockRestore();
  });
});
