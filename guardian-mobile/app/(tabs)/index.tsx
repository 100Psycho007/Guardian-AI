import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Ionicons } from '@expo/vector-icons'

// Minimal StatsCard and ScanCard placeholders to keep file self-contained for bootstrap
function StatsCard({ title, value, icon, color }: { title: string; value: string | number; icon: any; color: string }) {
  return (
    <View style={[styles.card, { borderColor: color }]}> 
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </View>
  )
}

function ScanCard({ scan }: { scan: any }) {
  return (
    <View style={styles.scanCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.scanMerchant}>{scan.merchant || 'Unknown'}</Text>
        <View style={[styles.dot, { backgroundColor: scan.risk_score < 40 ? '#10b981' : scan.risk_score < 70 ? '#f59e0b' : '#ef4444' }]} />
      </View>
      <Text style={styles.scanSub}>{scan.upi_id || '—'}</Text>
      <Text style={styles.scanAmount}>₹{Number(scan.amount || 0).toLocaleString('en-IN')}</Text>
    </View>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      return data
    },
  })

  const { data: recentScans = [], refetch: refetchScans, isPending } = useQuery({
    queryKey: ['recentScans', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data } = await supabase
        .from('scans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)
      return data || []
    },
  })

  const onRefresh = () => {
    refetchProfile()
    refetchScans()
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={!!isPending} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi {profile?.username || 'Guardian'}! 👋</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>⭐ {profile?.reputation_score || 0}</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <StatsCard title="Total Scans" value={profile?.total_scans || 0} icon="scan" color="#3b82f6" />
        <StatsCard title="Fraud Detected" value={profile?.fraud_detected || 0} icon="alert-circle" color="#ef4444" />
        <StatsCard title="Money Saved" value={`₹${(profile?.money_saved || 0).toLocaleString('en-IN')}`} icon="shield-checkmark" color="#10b981" />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Scans</Text>
          <TouchableOpacity onPress={() => router.push('/profile')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        {recentScans && recentScans.length > 0 ? (
          recentScans.map((scan: any) => <ScanCard key={scan.id} scan={scan} />)
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="scan" size={64} color="#9ca3af" />
            <Text style={styles.emptyText}>No scans yet</Text>
            <Text style={styles.emptySubtext}>Tap the camera button to scan your first payment</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/(tabs)/scan')} activeOpacity={0.8}>
        <Ionicons name="camera" size={28} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },
  badge: { backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeText: { fontSize: 14, fontWeight: '600', color: '#92400e' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 24 },
  section: { padding: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  viewAll: { fontSize: 14, color: '#3b82f6', fontWeight: '600' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6b7280', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 8, textAlign: 'center' },
  fab: { position: 'absolute', bottom: 30, alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4 },
  card: { flex: 1, marginHorizontal: 6, padding: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 2 },
  cardTitle: { color: '#6b7280', fontSize: 12, marginBottom: 8 },
  cardValue: { color: '#111827', fontSize: 18, fontWeight: '700' },
  scanCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  scanMerchant: { fontSize: 16, fontWeight: '700', color: '#111827' },
  scanSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  scanAmount: { fontSize: 16, color: '#111827', marginTop: 8, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
})


