import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Portal, Surface, Text, useTheme } from 'react-native-paper';

import { useConnectivity } from '../contexts/ConnectivityContext';

const HIDE_DELAY_MS = 1800;

export function OfflineBanner() {
  const theme = useTheme();
  const { isOnline } = useConnectivity();
  const [status, setStatus] = React.useState<'online' | 'offline'>(isOnline ? 'online' : 'offline');
  const [rendered, setRendered] = React.useState(!isOnline);
  const translateY = React.useRef(new Animated.Value(-100)).current;
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!isOnline) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setStatus('offline');
      setRendered(true);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return () => undefined;
    }

    setStatus('online');
    setRendered(true);
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();

    hideTimer.current = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -100,
        duration: 240,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setRendered(false);
        }
      });
    }, HIDE_DELAY_MS);

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [isOnline, translateY]);

  React.useEffect(() => {
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, []);

  if (!rendered) {
    return null;
  }

  const isOffline = status === 'offline';
  const backgroundColor = isOffline ? theme.colors.errorContainer : theme.colors.primaryContainer;
  const textColor = isOffline ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer;
  const icon = isOffline ? 'wifi-off' : 'wifi';
  const message = isOffline
    ? 'You’re offline. Pending scans will sync once you reconnect.'
    : 'Back online. Syncing pending data…';

  return (
    <Portal>
      <Animated.View
        pointerEvents="none"
        style={[styles.container, { transform: [{ translateY }] }]}
      >
        <Surface elevation={3} style={[styles.banner, { backgroundColor }]}>
          <MaterialIcons name={icon} size={20} color={textColor} style={styles.icon} />
          <Text style={[styles.text, { color: textColor }]} accessibilityLiveRegion="polite">
            {message}
          </Text>
        </Surface>
      </Animated.View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  banner: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    flex: 1,
    fontWeight: '600',
  },
});
