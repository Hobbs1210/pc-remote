import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParams } from '../navigation'
import { useDevicesStore, AnalyticsData } from '../store/devices'

type Props = NativeStackScreenProps<RootStackParams, 'Analytics'>

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function AnalyticsScreen({ route }: Props) {
  const { deviceId, deviceName } = route.params
  const { fetchAnalytics } = useDevicesStore()

  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)

  useEffect(() => {
    void load()
  }, [deviceId])

  async function load() {
    try {
      const data = await fetchAnalytics(deviceId)
      setAnalytics(data)
    } catch {
      // Quiet error fallback
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    )
  }

  const dailyUsages = analytics?.dailyUsages ?? []
  const maxMinutes = Math.max(...dailyUsages.map((d) => d.activeMinutes), 60)
  const topApps = analytics?.topApps ?? []
  const totalTopAppsMinutes = Math.max(topApps.reduce((acc, a) => acc + a.minutes, 0), 1)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.deviceTitle}>{deviceName}</Text>
      <Text style={styles.deviceSub}>Usage Analytics & Time History</Text>

      {/* ── 1. 7-Day Screen Time Chart ── */}
      <Text style={styles.sectionTitle}>7-Day Active Time</Text>
      <View style={styles.card}>
        <View style={styles.chartRow}>
          {dailyUsages.length === 0 ? (
            <Text style={styles.emptyText}>No activity data recorded yet</Text>
          ) : (
            dailyUsages.map((item) => {
              const heightPercent = Math.round((item.activeMinutes / maxMinutes) * 100)
              const dateLabel = item.date.slice(5) // MM-DD
              return (
                <View key={item.date} style={styles.barWrap}>
                  <Text style={styles.barVal}>{minutesToLabel(item.activeMinutes)}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${Math.max(heightPercent, 4)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barDate}>{dateLabel}</Text>
                </View>
              )
            })
          )}
        </View>
      </View>

      {/* ── 2. Top Applications Usage Breakdown ── */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Top Applications</Text>
      <View style={styles.card}>
        {topApps.length === 0 ? (
          <Text style={styles.emptyText}>No application usage tracked yet</Text>
        ) : (
          topApps.map((app) => {
            const percent = Math.round((app.minutes / totalTopAppsMinutes) * 100)
            return (
              <View key={app.name} style={styles.appRow}>
                <View style={styles.appInfo}>
                  <Text style={styles.appName} numberOfLines={1}>
                    🖥 {app.name}
                  </Text>
                  <Text style={styles.appTime}>{minutesToLabel(app.minutes)}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${percent}%` }]} />
                </View>
              </View>
            )
          })
        )}
      </View>

      {/* Refresh Button */}
      <TouchableOpacity style={styles.refreshBtn} onPress={() => void load()}>
        <Text style={styles.refreshBtnText}>🔄 Refresh Analytics</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  content: { padding: 16 },
  center: { justifyContent: 'center', alignItems: 'center' },
  deviceTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  deviceSub: { color: '#888', fontSize: 13, marginTop: 2, marginBottom: 20 },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    paddingTop: 20,
  },

  barWrap: { flex: 1, alignItems: 'center', height: '100%' },
  barVal: { color: '#6c63ff', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  barTrack: {
    flex: 1,
    width: 14,
    backgroundColor: '#0f0f23',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { backgroundColor: '#6c63ff', borderRadius: 7 },
  barDate: { color: '#666', fontSize: 10, marginTop: 6 },
  emptyText: { color: '#666', textAlign: 'center', width: '100%', paddingVertical: 20 },
  appRow: { marginBottom: 14 },
  appInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  appName: { color: '#fff', fontSize: 14, fontWeight: '500', flex: 1, marginRight: 8 },
  appTime: { color: '#4ade80', fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 6, backgroundColor: '#0f0f23', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 3 },
  refreshBtn: {
    marginTop: 24,
    backgroundColor: '#1a1a2e',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  refreshBtnText: { color: '#cbd5e1', fontWeight: '600', fontSize: 14 },
})
