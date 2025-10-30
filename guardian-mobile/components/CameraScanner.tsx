import React, { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'

export default function CameraScanner() {
  const [permission, requestPermission] = useCameraPermissions()
  const [ready, setReady] = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const [flash, setFlash] = useState<'off' | 'on'>('off')

  useEffect(() => {
    if (!permission) requestPermission()
  }, [permission])

  if (!permission) return null
  if (!permission.granted) {
    return (
      <View style={styles.center}> 
        <Text style={styles.info}>Camera access is required</Text>
        <TouchableOpacity style={styles.action} onPress={requestPermission}>
          <Text style={styles.actionText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const onCapture = async () => {
    if (!cameraRef.current) return
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false })
    if (photo?.uri) {
      router.push({ pathname: '/scan/preview', params: { imageUri: photo.uri } })
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        onCameraReady={() => setReady(true)}
        enableTorch={flash === 'on'}
      />
      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFlash((f) => (f === 'on' ? 'off' : 'on'))} style={styles.iconBtn}>
            <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={26} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.frame} />
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.capture} onPress={onCapture} disabled={!ready} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  info: { color: '#111827', fontSize: 16, marginBottom: 12 },
  action: { backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  actionText: { color: '#fff', fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: { marginTop: 40, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between' },
  bottomBar: { alignItems: 'center', marginBottom: 40 },
  iconBtn: { padding: 8 },
  frame: { alignSelf: 'center', width: '70%', height: '40%', borderWidth: 2, borderColor: '#fff', borderRadius: 16, opacity: 0.9 },
  capture: { width: 70, height: 70, backgroundColor: '#fff', borderRadius: 35, borderWidth: 6, borderColor: '#e5e7eb' },
})


