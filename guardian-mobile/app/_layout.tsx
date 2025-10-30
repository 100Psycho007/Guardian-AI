import React, { useEffect } from 'react'
import { Slot, SplashScreen } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as PaperProvider } from 'react-native-paper'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useNotificationsRegistration } from '@/hooks/useNotifications'
import { useSettingsStore } from '@/store/settingsStore'
import { tryBiometricAuth } from '@/hooks/useBiometric'

SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient()

export default function RootLayout() {
  const setUser = useAuthStore((s) => s.setUser)
  const setSession = useAuthStore((s) => s.setSession)
  const biometricEnabled = useSettingsStore((s) => s.biometricEnabled)
  const user = useAuthStore((s) => s.user)
  // Register push notifications once on mount
  useNotificationsRegistration(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      // Ensure a profile row exists for this user
      const uid = data.session?.user?.id
      if (uid) {
        await supabase.from('profiles').upsert({ id: uid }).select('id').single().catch(() => {})
      }
      SplashScreen.hideAsync().catch(() => {})
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    (async () => {
      if (user && biometricEnabled) {
        const ok = await tryBiometricAuth()
        if (!ok) {
          // If auth fails, sign out
          await supabase.auth.signOut()
        }
      }
    })()
  }, [user, biometricEnabled])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider>
          <QueryClientProvider client={queryClient}>
            <Slot />
          </QueryClientProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}


