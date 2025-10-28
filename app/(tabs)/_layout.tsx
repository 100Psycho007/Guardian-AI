import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { useAuth } from '../../hooks/useAuth';
import { useUnreadAlertCount } from '../../hooks/useAlerts';

export default function TabsLayout() {
  const { session, initializing } = useAuth();
  const unreadCount = useUnreadAlertCount();

  if (initializing) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="notifications" size={size} color={color} />,
          tabBarBadge: unreadCount > 99 ? '99+' : unreadCount || undefined,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="qr-code-scanner" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
