import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: any | null
  session: any | null
  loading: boolean
  isOnboarded: boolean
  setUser: (user: any | null) => void
  setSession: (session: any | null) => void
  setOnboarded: (value: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      loading: true,
      isOnboarded: false,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setOnboarded: (value) => set({ isOnboarded: value }),
      signOut: async () => {
        await supabase.auth.signOut()
        await SecureStore.deleteItemAsync('session')
        set({ user: null, session: null })
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        session: state.session,
        isOnboarded: state.isOnboarded,
      }),
    }
  )
)


