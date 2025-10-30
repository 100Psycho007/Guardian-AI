import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type AlertRow = {
  id: string
  entity_id: string
  entity_type: 'upi' | 'phone' | 'merchant' | 'url'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  description: string | null
  report_count: number
  created_at: string
}

export default function AlertsScreen() {
  const { data = [], refetch, isPending } = useQuery<AlertRow[]>({
    queryKey: ['fraud_alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraud_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data || []
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('fraud_alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fraud_alerts' }, (payload) => {
        // Naive refetch; for production, optimistically merge
        refetch()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const colorForRisk = (risk: AlertRow['risk_level']) => {
    if (risk === 'critical') return '#991b1b'
    if (risk === 'high') return '#ef4444'
    if (risk === 'medium') return '#f59e0b'
    return '#10b981'
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerts</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={!!isPending} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={[styles.riskBar, { backgroundColor: colorForRisk(item.risk_level) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.entity}>{item.entity_type.toUpperCase()}: {item.entity_id}</Text>
              <Text style={styles.desc}>{item.description || '—'}</Text>
              <Text style={styles.meta}>Reports: {item.report_count}  •  {new Date(item.created_at).toLocaleString()}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: '#6b7280', padding: 20 }}>All clear! No new alerts.</Text>}
        contentContainerStyle={{ paddingVertical: 12 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  riskBar: { width: 6, borderRadius: 4, marginRight: 12 },
  entity: { fontSize: 16, fontWeight: '700', color: '#111827' },
  desc: { color: '#374151', marginTop: 6 },
  meta: { color: '#6b7280', marginTop: 8, fontSize: 12 },
})


