import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import CameraScanner from '@/components/CameraScanner'

export default function ScanScreen() {
  return (
    <View style={{ flex: 1 }}>
      <CameraScanner />
    </View>
  )
}


