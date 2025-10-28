import React from 'react';
import NetInfo, { type NetInfoState, type NetInfoStateType } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

export type ConnectivityContextValue = {
  isOnline: boolean;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: NetInfoStateType;
  details: NetInfoState['details'] | null;
  lastChangedAt: number;
};

const defaultState: ConnectivityContextValue = {
  isOnline: true,
  isConnected: true,
  isInternetReachable: true,
  type: 'unknown',
  details: null,
  lastChangedAt: Date.now(),
};

const ConnectivityContext = React.createContext<ConnectivityContextValue>(defaultState);

function deriveConnectivityState(netState: NetInfoState | null): ConnectivityContextValue {
  if (!netState) {
    return defaultState;
  }

  const isConnected = Boolean(netState.isConnected);
  const isInternetReachable = netState.isInternetReachable ?? null;
  const isOnline = isConnected && (isInternetReachable ?? true);

  return {
    isOnline,
    isConnected,
    isInternetReachable,
    type: netState.type,
    details: netState.details ?? null,
    lastChangedAt: Date.now(),
  };
}

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConnectivityContextValue>(() => defaultState);

  React.useEffect(() => {
    let mounted = true;

    const handleChange = (netState: NetInfoState) => {
      if (!mounted) {
        return;
      }

      const nextState = deriveConnectivityState(netState);
      onlineManager.setOnline(nextState.isOnline);
      setState(nextState);
    };

    NetInfo.fetch().then(handleChange).catch(() => undefined);
    const unsubscribe = NetInfo.addEventListener(handleChange);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return <ConnectivityContext.Provider value={state}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity() {
  return React.useContext(ConnectivityContext);
}
