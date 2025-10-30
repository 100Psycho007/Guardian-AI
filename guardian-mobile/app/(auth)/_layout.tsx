import React, { useEffect } from 'react'
import { Redirect, Stack } from 'expo-router'
import { useAuthStore } from '@/store/authStore'

export default function AuthLayout() {
  const user = useAuthStore((s) => s.user)

  if (user) {
    return <Redirect href="/(tabs)" />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}


