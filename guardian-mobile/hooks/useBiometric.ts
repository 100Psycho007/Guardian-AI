import * as LocalAuthentication from 'expo-local-authentication'

export async function tryBiometricAuth(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  if (!hasHardware) return true
  const supported = await LocalAuthentication.supportedAuthenticationTypesAsync()
  if (!supported || supported.length === 0) return true
  const enrolled = await LocalAuthentication.isEnrolledAsync()
  if (!enrolled) return true
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock Guardian AI',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  })
  return !!result.success
}


