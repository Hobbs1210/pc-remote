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

export default function DevicesScreen() {
  const navigation = useNavigation<Nav>()
  const { devices, isLoading, fetchDevices, deleteDevice, emergencyLockAll } = useDevicesStore()

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
      style={styles.card}
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
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>CPU</Text>
            <Text style={styles.statValue}>{item.cpuPercent}%</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>RAM</Text>
            <Text style={styles.statValue}>{item.ramPercent}%</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Uptime</Text>
            <Text style={styles.statValue}>
              {Math.floor((item.uptime ?? 0) / 3600)}h
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  ), [navigation])

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
          data={devices}
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
  container: { flex: 1, backgroundColor: '#0f0f23' },
  emergencyBtn: {
    backgroundColor: '#ef4444',
    margin: 16,
    marginBottom: 0,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  emergencyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  card: {

    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
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
  statusText: { color: '#888', fontSize: 13 },
  stats: { flexDirection: 'row', gap: 16 },
  stat: { alignItems: 'center' },
  statLabel: { color: '#666', fontSize: 11, marginBottom: 2 },
  statValue: { color: '#6c63ff', fontSize: 15, fontWeight: '600' },
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
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
})