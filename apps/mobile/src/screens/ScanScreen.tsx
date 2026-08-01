import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNavigation } from '@react-navigation/native'
import { useDevicesStore } from '../store/devices'

type Mode = 'qr' | 'manual'

export default function ScanScreen() {
  const navigation = useNavigation()
  const { bindDevice } = useDevicesStore()
  const [permission, requestPermission] = useCameraPermissions()
  const [mode, setMode] = useState<Mode>('qr')

  // QR state
  const [scanned, setScanned] = useState(false)

  // Shared bind state
  const [nameModal, setNameModal] = useState(false)
  const [pendingData, setPendingData] = useState<{ deviceId: string; secret: string } | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [binding, setBinding] = useState(false)

  // Manual entry state
  const [manualDeviceId, setManualDeviceId] = useState('')
  const [manualSecret, setManualSecret] = useState('')

  // ── QR handler ──────────────────────────────────────────────────────────────
  const handleScan = ({ data }: { data: string }) => {
    if (scanned) return
    setScanned(true)
    try {
      const parsed = JSON.parse(data) as { deviceId: string; secret: string }
      if (!parsed.deviceId || !parsed.secret) throw new Error('Invalid QR')
      setPendingData(parsed)
      setNameModal(true)
    } catch {
      Alert.alert('Error', 'Invalid QR code', [
        { text: 'OK', onPress: () => setScanned(false) },
      ])
    }
  }

  // ── Manual submit ───────────────────────────────────────────────────────────
  const handleManualSubmit = () => {
    const deviceId = manualDeviceId.trim()
    const secret = manualSecret.trim()
    if (!deviceId || !secret) {
      Alert.alert('Error', 'Please enter both Device ID and Secret')
      return
    }
    setPendingData({ deviceId, secret })
    setNameModal(true)
  }

  // ── Shared bind ─────────────────────────────────────────────────────────────
  const handleBind = async () => {
    if (!pendingData || !deviceName.trim()) return
    setBinding(true)
    try {
      await bindDevice(pendingData.deviceId, pendingData.secret, deviceName.trim())
      Alert.alert('✓ Device Paired', deviceName, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch {
      Alert.alert('Error', 'Failed to pair device. Check the Device ID and Secret.')
      setScanned(false)
      setNameModal(false)
      setPendingData(null)
    } finally {
      setBinding(false)
    }
  }

  const handleCancelBind = () => {
    setNameModal(false)
    setPendingData(null)
    setDeviceName('')
    setScanned(false)
  }

  // ── Tab header ───────────────────────────────────────────────────────────────
  const renderTabs = () => (
    <View style={styles.tabRow}>
      <TouchableOpacity
        style={[styles.tab, mode === 'qr' && styles.tabActive]}
        onPress={() => { setMode('qr'); setScanned(false) }}
      >
        <Text style={[styles.tabText, mode === 'qr' && styles.tabTextActive]}>📷 Scan QR</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, mode === 'manual' && styles.tabActive]}
        onPress={() => setMode('manual')}
      >
        <Text style={[styles.tabText, mode === 'manual' && styles.tabTextActive]}>⌨️ Enter Code</Text>
      </TouchableOpacity>
    </View>
  )

  // ── Name modal (shared) ─────────────────────────────────────────────────────
  const renderNameModal = () => (
    <View style={styles.modalOverlay}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Name this device</Text>
        <Text style={styles.modalHint}>Give your PC a friendly name</Text>
        <TextInput
          style={styles.input}
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="e.g. My PC, Gaming Rig…"
          placeholderTextColor="#555"
          autoFocus
          maxLength={40}
        />
        <TouchableOpacity
          style={[styles.button, (!deviceName.trim() || binding) && styles.buttonDisabled]}
          onPress={handleBind}
          disabled={!deviceName.trim() || binding}
        >
          <Text style={styles.buttonText}>{binding ? 'Pairing…' : 'Pair Device'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelBind}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  // ── QR mode ─────────────────────────────────────────────────────────────────
  if (mode === 'qr') {
    if (!permission?.granted) {
      return (
        <View style={styles.container}>
          {renderTabs()}
          <View style={styles.center}>
            <Text style={styles.text}>Camera access is required to scan QR codes</Text>
            <TouchableOpacity style={styles.button} onPress={requestPermission}>
              <Text style={styles.buttonText}>Grant Camera Access</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode('manual')}>
              <Text style={styles.cancelText}>Enter code manually instead</Text>
            </TouchableOpacity>
          </View>
          {nameModal && renderNameModal()}
        </View>
      )
    }

    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={scanned ? undefined : handleScan}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
          {renderTabs()}
          <View style={styles.spacer} />
          <View style={styles.scanFrame} />
          <Text style={styles.hint}>Point camera at the PC agent QR code</Text>
          <View style={styles.spacer} />
        </View>
        {nameModal && renderNameModal()}
      </View>
    )
  }

  // ── Manual entry mode ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.manualScroll} keyboardShouldPersistTaps="handled">
        {renderTabs()}

        <View style={styles.manualContent}>
          <Text style={styles.manualTitle}>Add Device Manually</Text>
          <Text style={styles.manualHint}>
            Find the Device ID and Secret in the PC agent window or tray icon menu.
          </Text>

          <Text style={styles.label}>Device ID</Text>
          <TextInput
            style={styles.input}
            value={manualDeviceId}
            onChangeText={setManualDeviceId}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Secret</Text>
          <TextInput
            style={styles.input}
            value={manualSecret}
            onChangeText={setManualSecret}
            placeholder="Paste the secret from the agent"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, (!manualDeviceId.trim() || !manualSecret.trim()) && styles.buttonDisabled]}
            onPress={handleManualSubmit}
            disabled={!manualDeviceId.trim() || !manualSecret.trim()}
          >
            <Text style={styles.buttonText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {nameModal && renderNameModal()}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    margin: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: { backgroundColor: '#6c63ff' },
  tabText: { color: '#888', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  // QR overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  spacer: { flex: 1 },
  scanFrame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#6c63ff',
    borderRadius: 16,
    marginBottom: 20,
  },
  hint: { color: '#fff', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  // No permission
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  text: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 24 },

  // Manual entry
  manualScroll: { flexGrow: 1 },
  manualContent: { padding: 24 },
  manualTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  manualHint: { color: '#888', fontSize: 14, marginBottom: 28, lineHeight: 20 },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 6 },

  // Shared inputs / buttons
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 14 },
  cancelText: { color: '#666', fontSize: 14 },

  // Name modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 32,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 6 },
  modalHint: { color: '#888', fontSize: 13, marginBottom: 20 },
})