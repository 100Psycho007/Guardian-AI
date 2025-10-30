import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'

export function useNotificationsRegistration(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return
    let mounted = true
    ;(async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
        })
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') return

      const tokenData = await Notifications.getExpoPushTokenAsync()
      const expoToken = tokenData.data

      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId || !mounted) return

      await supabase.from('profiles').upsert({ id: userId, device_token: expoToken })
    })()
    return () => {
      mounted = false
    }
  }, [enabled])
}


