import React from 'react';
import { jest } from '@jest/globals';
import '@testing-library/jest-native/extend-expect';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');

  // The mock has a default export with `call` mocked out.
  Reanimated.default.call = () => {};

  return Reanimated;
});

const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => {
  const actual = jest.requireActual<typeof import('expo-router')>('expo-router');
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => children,
    useRouter: () => mockRouter,
    __mockRouter: mockRouter,
  };
});

// Expose the mock router globally for convenience in tests.
(global as unknown as { mockRouter: typeof mockRouter }).mockRouter = mockRouter;
