import React, { useState } from 'react'
import { View, Image, StyleSheet, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function PreviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>()
  const [loading, setLoading] = useState(false)

  const analyze = async () => {
    try {
      setLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      // Compress and resize before OCR to reduce latency and cost
      const manip = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 1920 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      )
      // Ensure file size ≤ 2MB; if larger, compress further
      let compressedUri = manip.uri
      let info = await FileSystem.getInfoAsync(compressedUri)
      if (info.size && info.size > 2 * 1024 * 1024) {
        const further = await ImageManipulator.manipulateAsync(
          compressedUri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        )
        compressedUri = further.uri
      }
      const base64 = await FileSystem.readAsStringAsync(compressedUri, { encoding: FileSystem.EncodingType.Base64 })
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/analyze-upi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64: base64 }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 403 && json.upgrade_required) {
          router.replace('/premium')
          return
        }
        throw new Error(json.error || 'Analysis failed')
      }
      router.replace({ pathname: '/scan/result', params: { scan: JSON.stringify(json) } })
    } catch (e) {
      Alert.alert('Analysis error', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
      ) : (
        <Text>No image</Text>
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#6b7280' }]} onPress={() => router.back()} disabled={loading}>
          <Text style={styles.btnText}>Retake</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#3b82f6' }]} onPress={analyze} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Analyze</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  preview: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', padding: 16, backgroundColor: '#111827' },
  btn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
})


