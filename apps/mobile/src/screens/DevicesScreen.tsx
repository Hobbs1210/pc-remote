import React, { useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useDevicesStore } from '../store/devices'
import type { RootStackParams } from '../navigation'

type Nav = NativeStackNavigationProp<RootStackParams>

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'online' ? '#4ade80' :
    status === 'away'   ? '#facc15' : '#ef4444'

  return <View style={[styles.dot, { backgroundColor: color }]} />
}

function UsageBar({ label, value }: { label: string; value: number }) {
  const barColor =
    value >= 85 ? '#ef4444' :
    value >= 60 ? '#facc15' : '#4ade80'

  return (
    <View style={styles.usageContainer}>
      <View style={styles.usageHeader}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={[styles.usageVal, { color: barColor }]}>{value}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  )
}

export default function DevicesScreen() {
  const navigation = useNavigation<Nav>()
  const { devices, isLoading, fetchDevices, deleteDevice, emergencyLockAll } = useDevicesStore()
  const { width } = useWindowDimensions()

  const numColumns = width >= 1200 ? 3 : width >= 768 ? 2 : 1

  useEffect(() => {
    void fetchDevices()
    const interval = setInterval(() => void fetchDevices(), 30_000)
    return () => clearInterval(interval)
  }, [])

  const handleEmergencyLock = useCallback(() => {
    Alert.alert(
      'Emergency Lockdown',
      'Are you sure you want to lock all connected PCs immediately?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock All PCs',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await emergencyLockAll()
              Alert.alert('Lockdown Sent', `Locked ${res.locked} of ${res.total} devices.`)
            } catch {
              Alert.alert('Error', 'Failed to trigger emergency lockdown')
            }
          },
        },
      ]
    )
  }, [emergencyLockAll])

  const handleLongPress = useCallback((item: typeof devices[0]) => {
    Alert.alert(
      item.name,
      'Select action',
      [
        {
          text: 'Delete device',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Delete device?',
            `"${item.name}" will be unlinked.\n\nThe PC agent will reset and show a new QR code for re-pairing.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => void deleteDevice(item.id),
              },
            ]
          ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    )
  }, [deleteDevice])

  const renderDevice = useCallback(({ item }: { item: typeof devices[0] }) => (
    <TouchableOpacity
      style={[
        styles.card,
        numColumns > 1 && { flex: 1, margin: 6 }
      ]}
      onPress={() =>
        navigation.navigate('Control', {
          deviceId: item.id,
          deviceName: item.name,
        })
      }
      onLongPress={() => handleLongPress(item)}
      delayLongPress={400}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitle}>
          <StatusDot status={item.status} />
          <Text style={styles.deviceName}>{item.name}</Text>
        </View>
        <Text style={styles.statusText}>{item.status}</Text>
      </View>

      {item.status === 'online' && (
        <View style={styles.statsContainer}>
          <UsageBar label="CPU" value={item.cpuPercent ?? 0} />
          <UsageBar label="RAM" value={item.ramPercent ?? 0} />
          
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnControl]}
              onPress={() => navigation.navigate('Control', { deviceId: item.id, deviceName: item.name })}
            >
              <Text style={styles.actionBtnText}>🎮 Control</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnAnalytics]}
              onPress={() => navigation.navigate('Analytics', { deviceId: item.id, deviceName: item.name })}
            >
              <Text style={styles.actionBtnText}>📊 Analytics</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  ), [navigation, numColumns, handleLongPress])

  return (
    <View style={styles.container}>
      {devices.some((d) => d.status === 'online') && (
        <TouchableOpacity style={styles.emergencyBtn} onPress={handleEmergencyLock}>
          <Text style={styles.emergencyBtnText}>🚨 Lock All PCs Immediately</Text>
        </TouchableOpacity>
      )}

      {isLoading && devices.length === 0 ? (
        <ActivityIndicator color="#6c63ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          key={numColumns}
          data={devices}
          numColumns={numColumns}
          keyExtractor={(d) => d.id}
          renderItem={renderDevice}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={fetchDevices}
              tintColor="#6c63ff"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No paired devices</Text>
              <Text style={styles.emptyHint}>
                Tap + to pair a new PC
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Scan')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a16' },
  emergencyBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: '#ef4444',
    margin: 16,
    marginBottom: 0,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  emergencyBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#121225',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  deviceName: { color: '#fff', fontSize: 17, fontWeight: '600' },
  statusText: { color: '#888', fontSize: 13, textTransform: 'capitalize' },
  statsContainer: { marginTop: 4, gap: 8 },
  usageContainer: { marginVertical: 2 },
  usageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  usageLabel: { color: '#888', fontSize: 11, fontWeight: '600' },
  usageVal: { fontSize: 11, fontWeight: '700' },
  barTrack: { height: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionBtnControl: { backgroundColor: '#7c3aed' },
  actionBtnAnalytics: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)' },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#fff', fontSize: 18, marginBottom: 8 },
  emptyHint: { color: '#666', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
})