import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Portal, Snackbar, Text, useTheme } from 'react-native-paper';

import { trackEvent } from '../lib/analytics';

export type ToastType = 'success' | 'error' | 'info';

export type ToastOptions = {
  message: string;
  type?: ToastType;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
  /** Optional identifier to help analytics tie the toast back to a user action */
  source?: string;
};

type InternalToast = ToastOptions & {
  id: string;
  type: ToastType;
  duration: number;
};

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
};

const DEFAULT_DURATION = 4500;

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeToast, setActiveToast] = React.useState<InternalToast | null>(null);
  const queueRef = React.useRef<InternalToast[]>([]);

  const showToast = React.useCallback((options: ToastOptions) => {
    const toast: InternalToast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message: options.message,
      type: options.type ?? 'info',
      duration: options.duration ?? DEFAULT_DURATION,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
      source: options.source,
    };

    queueRef.current.push(toast);
    trackEvent('ui.toast_shown', {
      type: toast.type,
      source: toast.source ?? 'unknown',
    });

    setActiveToast((current) => {
      if (current) {
        return current;
      }
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const hideToast = React.useCallback(() => {
    setActiveToast(null);
  }, []);

  const handleDismiss = React.useCallback(() => {
    setActiveToast(null);
  }, []);

  const handleAction = React.useCallback(() => {
    if (!activeToast) return;
    try {
      activeToast.onAction?.();
    } finally {
      setActiveToast(null);
    }
  }, [activeToast]);

  React.useEffect(() => {
    if (!activeToast && queueRef.current.length > 0) {
      const next = queueRef.current.shift() ?? null;
      if (next) {
        setActiveToast(next);
      }
    }
  }, [activeToast]);

  const backgroundColor = React.useMemo(() => {
    if (!activeToast) {
      return theme.colors.inverseSurface;
    }
    switch (activeToast.type) {
      case 'success':
        return theme.colors.primary;
      case 'error':
        return theme.colors.error;
      default:
        return theme.colors.inverseSurface;
    }
  }, [activeToast, theme.colors.error, theme.colors.inverseSurface, theme.colors.primary]);

  const textColor = React.useMemo(() => {
    if (!activeToast) {
      return theme.colors.inverseOnSurface;
    }
    switch (activeToast.type) {
      case 'success':
        return theme.colors.onPrimary;
      case 'error':
        return theme.colors.onError;
      default:
        return theme.colors.inverseOnSurface;
    }
  }, [activeToast, theme.colors.inverseOnSurface, theme.colors.onError, theme.colors.onPrimary]);

  const bottomOffset = React.useMemo(() => Math.max(insets.bottom, 16), [insets.bottom]);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      showToast,
      hideToast,
    }),
    [showToast, hideToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Portal>
        <Snackbar
          visible={Boolean(activeToast)}
          onDismiss={handleDismiss}
          duration={activeToast?.duration ?? DEFAULT_DURATION}
          action={
            activeToast?.actionLabel
              ? {
                  label: activeToast.actionLabel,
                  onPress: handleAction,
                }
              : undefined
          }
          style={{ backgroundColor, marginHorizontal: 16 }}
          wrapperStyle={{ bottom: bottomOffset }}
          theme={{ colors: { onSurface: textColor, inverseOnSurface: textColor } }}
          accessibilityLiveRegion="polite"
        >
          <Text style={{ color: textColor }}>{activeToast?.message ?? ''}</Text>
        </Snackbar>
      </Portal>
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
}

