import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { RiskMeter } from '@/components/RiskMeter'
import { supabase } from '@/lib/supabase'

export default function ResultScreen() {
  const { scan } = useLocalSearchParams<{ scan: string }>()
  const data = useMemo(() => {
    try { return scan ? JSON.parse(scan) : null } catch { return null }
  }, [scan])

  const score = data?.risk_score ?? 0
  const [saving, setSaving] = useState(false)
  const [reported, setReported] = useState(false)
  const [bookmarked, setBookmarked] = useState(!!data?.is_bookmarked)

  const onToggleBookmark = async () => {
    if (!data?.id) return
    try {
      setSaving(true)
      const { error } = await supabase.from('scans').update({ is_bookmarked: !bookmarked }).eq('id', data.id)
      if (error) throw error
      setBookmarked(!bookmarked)
      Alert.alert(!bookmarked ? 'Saved' : 'Removed', !bookmarked ? 'Saved to your scans' : 'Removed from saved')
    } catch (e) {
      Alert.alert('Error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const onReportFraud = async () => {
    if (reported || !data?.id) return
    try {
      setSaving(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const reporterId = sessionData.session?.user?.id
      await supabase.from('fraud_reports').insert({
        reporter_id: reporterId,
        scan_id: data.id,
        details: 'User reported fraud from results screen',
        status: 'pending',
      })
      setReported(true)
      Alert.alert('Reported', 'Thank you for helping the community stay safe.')
    } catch (e) {
      Alert.alert('Error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const onShare = async () => {
    const text = `Guardian AI Result\nRisk: ${score}\nUPI: ${data?.upi_id || data?.extracted_data?.upiId || '—'}\nMerchant: ${data?.merchant || data?.extracted_data?.merchant || '—'}\nFlags: ${(data?.fraud_flags || []).join(', ')}`
    await Share.share({ message: text })
  }

  return (
    <ScrollView style={styles.container}>
      <View style={{ alignItems: 'center', marginTop: 24 }}>
        <RiskMeter score={score} size={220} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Why we flagged this</Text>
        <Text style={styles.text}>{data?.ai_reasoning || '—'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Fraud Flags</Text>
        {(data?.fraud_flags || []).map((f: string, i: number) => (
          <Text key={i} style={styles.text}>• {f}</Text>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Details</Text>
        <Text style={styles.text}>UPI ID: {data?.upi_id || data?.extracted_data?.upiId || '—'}</Text>
        <Text style={styles.text}>Merchant: {data?.merchant || data?.extracted_data?.merchant || '—'}</Text>
        <Text style={styles.text}>Amount: ₹{Number(data?.amount || data?.extracted_data?.amount || 0).toLocaleString('en-IN')}</Text>
        <Text style={styles.text}>Message: {data?.message || data?.extracted_data?.message || '—'}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#111827' }]} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.btnText}>Done</Text>
        </TouchableOpacity>
        {score > 70 && (
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#ef4444' }]} onPress={onReportFraud} disabled={saving || reported}>
            <Text style={styles.btnText}>{reported ? 'Reported' : 'Report Fraud'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, { backgroundColor: bookmarked ? '#6b7280' : '#10b981' }]} onPress={onToggleBookmark} disabled={saving}>
          <Text style={styles.btnText}>{bookmarked ? 'Saved' : 'Save'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#3b82f6' }]} onPress={onShare}>
          <Text style={styles.btnText}>Share</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 8 },
  text: { color: '#374151', marginTop: 6 },
  actions: { marginTop: 16, marginHorizontal: 16, marginBottom: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginRight: 8, marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
})


