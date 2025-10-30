import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'

export default function Premium() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upgrade to Premium</Text>
      <Text style={styles.subtitle}>Unlimited scans, priority analysis, realtime alerts.</Text>
      <View style={{ height: 16 }} />
      <TouchableOpacity style={[styles.button, { backgroundColor: '#3b82f6' }]} onPress={() => alert('Stub: connect RevenueCat')}>
        <Text style={styles.buttonText}>₹99/month</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, { backgroundColor: '#10b981' }]} onPress={() => alert('Stub: connect RevenueCat')}>
        <Text style={styles.buttonText}>₹999/year</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={() => router.back()}>
        <Text style={styles.linkText}>Maybe later</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 8, color: '#374151' },
  button: { marginTop: 12, padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#2563eb', fontWeight: '600' },
})


