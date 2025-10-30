import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { useSettingsStore } from '@/store/settingsStore'

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user)
  const biometricEnabled = useSettingsStore((s) => s.biometricEnabled)
  const setBiometricEnabled = useSettingsStore((s) => s.setBiometricEnabled)

  const signOut = async () => {
    await supabase.auth.signOut()
    Alert.alert('Signed out')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>{user?.email}</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Biometric unlock</Text>
        <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} />
      </View>
      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 8, color: '#6b7280' },
  row: { marginTop: 20, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: '#111827', fontWeight: '600', fontSize: 16 },
  button: { marginTop: 20, backgroundColor: '#ef4444', padding: 12, borderRadius: 10, width: 140, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
})


