import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParams } from '../navigation'
import { api } from '../api/client'

type Props = NativeStackScreenProps<RootStackParams, 'Schedule'>

interface TimeSlot { start: string; end: string }
type DaySlots = Record<string, TimeSlot[]>

interface DowntimeConfig { enabled: boolean; start: string; end: string }
interface DailyLimitConfig { enabled: boolean; minutesWeekday: number; minutesWeekend: number }

interface DeviceSchedule {
  enabled: boolean
  timezone: string
  days: DaySlots
  downtime?: DowntimeConfig
  dailyLimit?: DailyLimitConfig
}

const DAYS = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
]

const TIME_RE = /^\d{2}:\d{2}$/

function formatTime(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`
}

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export default function ScheduleScreen({ route }: Props) {
  const { deviceId } = route.params

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Allowed hours
  const [enabled, setEnabled] = useState(false)
  const [days, setDays] = useState<DaySlots>({})
  const [addForm, setAddForm] = useState<Record<string, { start: string; end: string } | undefined>>({})

  // Curfew / Quiet Hours
  const [downtimeEnabled, setDowntimeEnabled] = useState(false)
  const [downtimeStart, setDowntimeStart] = useState('23:00')
  const [downtimeEnd, setDowntimeEnd] = useState('07:00')

  // Daily limit
  const [limitEnabled, setLimitEnabled] = useState(false)
  const [minutesWeekday, setMinutesWeekday] = useState('120')
  const [minutesWeekend, setMinutesWeekend] = useState('240')

  // Blocked apps
  const [blockedApps, setBlockedApps] = useState<string[]>([])
  const [newAppName, setNewAppName] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    try {
      const { data } = await api.get<{ schedule?: (DeviceSchedule & { blockedApps?: string[] }) | null }>(`/devices/${deviceId}`)
      const s = data.schedule
      if (s) {
        setEnabled(s.enabled)
        setDays(s.days ?? {})
        if (s.downtime) {
          setDowntimeEnabled(s.downtime.enabled)
          setDowntimeStart(s.downtime.start)
          setDowntimeEnd(s.downtime.end)
        }
        if (s.dailyLimit) {
          setLimitEnabled(s.dailyLimit.enabled)
          setMinutesWeekday(String(s.dailyLimit.minutesWeekday))
          setMinutesWeekend(String(s.dailyLimit.minutesWeekend))
        }
        if (s.blockedApps) {
          setBlockedApps(s.blockedApps)
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!TIME_RE.test(downtimeStart) || !TIME_RE.test(downtimeEnd)) {
      Alert.alert('Error', 'Invalid time format for curfew (HH:MM)')
      return
    }
    const wd = parseInt(minutesWeekday)
    const we = parseInt(minutesWeekend)
    if (isNaN(wd) || wd < 1 || isNaN(we) || we < 1) {
      Alert.alert('Error', 'Enter a valid limit in minutes (minimum 1)')
      return
    }

    setSaving(true)
    try {
      await api.put(`/devices/${deviceId}/schedule`, {
        enabled,
        timezone,
        days,
        downtime: { enabled: downtimeEnabled, start: downtimeStart, end: downtimeEnd },
        dailyLimit: { enabled: limitEnabled, minutesWeekday: wd, minutesWeekend: we },
        blockedApps,
      })
      Alert.alert('Saved', 'Schedule updated successfully')
    } catch {
      Alert.alert('Error', 'Failed to save schedule')
    } finally {
      setSaving(false)
    }
  }

  function addBlockedApp() {
    if (!newAppName.trim()) return
    const name = newAppName.trim().toLowerCase().endsWith('.exe') ? newAppName.trim() : `${newAppName.trim()}.exe`
    if (blockedApps.includes(name)) return
    setBlockedApps((prev) => [...prev, name])
    setNewAppName('')
  }

  function removeBlockedApp(name: string) {
    setBlockedApps((prev) => prev.filter((a) => a !== name))
  }


  // — Allowed hours helpers —
  function openAddForm(key: string) {
    setAddForm((prev) => ({ ...prev, [key]: { start: '09:00', end: '21:00' } }))
  }
  function cancelAddForm(key: string) {
    setAddForm((prev) => { const next = { ...prev }; delete next[key]; return next })
  }
  function confirmAddSlot(key: string) {
    const form = addForm[key]
    if (!form) return
    if (!TIME_RE.test(form.start) || !TIME_RE.test(form.end)) {
      Alert.alert('Invalid Format', 'Enter time in HH:MM format'); return
    }
    const [sh = 0, sm = 0] = form.start.split(':').map(Number)
    const [eh = 0, em = 0] = form.end.split(':').map(Number)
    if (sh * 60 + sm >= eh * 60 + em) {
      Alert.alert('Error', 'Start time must be earlier than end time'); return
    }
    setDays((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), { start: form.start, end: form.end }] }))
    cancelAddForm(key)
  }
  function removeSlot(key: string, index: number) {
    setDays((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== index) }))
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#6c63ff" size="large" /></View>
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── 1. Curfew / Quiet Hours ── */}
      <Text style={styles.sectionTitle}>Quiet Hours</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.cardTitle}>Curfew Hours</Text>
            <Text style={styles.cardSub}>PC is completely unavailable during this period</Text>
          </View>
          <Switch value={downtimeEnabled} onValueChange={setDowntimeEnabled}
            trackColor={{ false: '#333', true: '#6c63ff' }} thumbColor="#fff" />
        </View>
        {downtimeEnabled && (
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <Text style={styles.timeLabel}>From</Text>
              <TextInput style={styles.timeInput} value={downtimeStart}
                onChangeText={(v) => setDowntimeStart(formatTime(v))}
                placeholder="23:00" placeholderTextColor="#555"
                keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>
            <Text style={styles.timeSep}>—</Text>
            <View style={styles.timeField}>
              <Text style={styles.timeLabel}>To</Text>
              <TextInput style={styles.timeInput} value={downtimeEnd}
                onChangeText={(v) => setDowntimeEnd(formatTime(v))}
                placeholder="07:00" placeholderTextColor="#555"
                keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>
          </View>
        )}
      </View>

      {/* ── 2. Daily Limit ── */}
      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Daily Limit</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.cardTitle}>Screen Time Limit</Text>
            <Text style={styles.cardSub}>
              {limitEnabled
                ? `Weekdays: ${minutesToLabel(parseInt(minutesWeekday) || 0)} · Weekends: ${minutesToLabel(parseInt(minutesWeekend) || 0)}`
                : 'Unlimited time'}
            </Text>
          </View>
          <Switch value={limitEnabled} onValueChange={setLimitEnabled}
            trackColor={{ false: '#333', true: '#6c63ff' }} thumbColor="#fff" />
        </View>
        {limitEnabled && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Weekdays (Mon–Fri)</Text>
              <View style={styles.limitInputWrap}>
                <TextInput style={styles.limitInput} value={minutesWeekday}
                  onChangeText={setMinutesWeekday} keyboardType="number-pad"
                  placeholder="120" placeholderTextColor="#555" />
                <Text style={styles.limitUnit}>min</Text>
              </View>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Weekends (Sat–Sun)</Text>
              <View style={styles.limitInputWrap}>
                <TextInput style={styles.limitInput} value={minutesWeekend}
                  onChangeText={setMinutesWeekend} keyboardType="number-pad"
                  placeholder="240" placeholderTextColor="#555" />
                <Text style={styles.limitUnit}>min</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* ── 3. Blocked Applications ── */}
      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Blocked Applications</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Executable Blacklist</Text>
        <Text style={[styles.cardSub, { marginBottom: 12 }]}>
          Automatically terminates process when launched
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <TextInput
            style={[styles.timeInputSlot, { flex: 1, textTransform: 'lowercase' }]}
            value={newAppName}
            onChangeText={setNewAppName}
            placeholder="e.g. chrome.exe, game.exe"
            placeholderTextColor="#555"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.confirmBtn} onPress={addBlockedApp}>
            <Text style={styles.confirmBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {blockedApps.map((appName) => (
          <View key={appName} style={styles.slotRow}>
            <Text style={styles.slotTime}>🚫 {appName}</Text>
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => removeBlockedApp(appName)}>
              <Text style={styles.removeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* ── 4. Allowed Hours ── */}
      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Allowed Hours</Text>

      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.cardTitle}>Time Restrictions</Text>
            <Text style={styles.cardSub}>
              {enabled ? 'PC is available only during specified hours' : 'PC is available anytime'}
            </Text>
          </View>
          <Switch value={enabled} onValueChange={setEnabled}
            trackColor={{ false: '#333', true: '#6c63ff' }} thumbColor="#fff" />
        </View>
      </View>

      {enabled && DAYS.map(({ key, label }) => {
        const slots = days[key] ?? []
        const form = addForm[key]
        return (
          <View key={key} style={styles.card}>
            <Text style={styles.dayLabel}>{label}</Text>
            {slots.length === 0 && !form && (
              <Text style={styles.noSlots}>Day blocked</Text>
            )}
            {slots.map((slot, i) => (
              <View key={i} style={styles.slotRow}>
                <Text style={styles.slotTime}>{slot.start} — {slot.end}</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => removeSlot(key, i)}>
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {form ? (
              <View style={styles.addForm}>
                <TextInput style={styles.timeInputSlot} value={form.start}
                  onChangeText={(v) => setAddForm((prev) => ({ ...prev, [key]: { start: formatTime(v), end: prev[key]?.end ?? '21:00' } }))}
                  placeholder="09:00" placeholderTextColor="#555"
                  keyboardType="numbers-and-punctuation" maxLength={5} />
                <Text style={styles.timeSep}>—</Text>
                <TextInput style={styles.timeInputSlot} value={form.end}
                  onChangeText={(v) => setAddForm((prev) => ({ ...prev, [key]: { start: prev[key]?.start ?? '09:00', end: formatTime(v) } }))}
                  placeholder="21:00" placeholderTextColor="#555"
                  keyboardType="numbers-and-punctuation" maxLength={5} />
                <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmAddSlot(key)}>
                  <Text style={styles.confirmBtnText}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => cancelAddForm(key)}>
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={() => openAddForm(key)}>
                <Text style={styles.addBtnText}>+ Add Interval</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={() => void save()} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Schedule'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#0f0f23', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: {
    color: '#888', fontSize: 12, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  card: {
    backgroundColor: '#1a1a2e', borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#333',
  },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  cardSub: { color: '#888', fontSize: 13 },

  // Время комендантского часа
  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 8 },
  timeField: { flex: 1, gap: 4 },
  timeLabel: { color: '#888', fontSize: 12 },
  timeInput: {
    backgroundColor: '#0f0f23', borderRadius: 8, padding: 10,
    color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#444', textAlign: 'center',
  },
  timeSep: { color: '#888', fontSize: 18, marginTop: 18 },

  // Лимит
  limitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  limitLabel: { color: '#ccc', fontSize: 14, flex: 1 },
  limitInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  limitInput: {
    backgroundColor: '#0f0f23', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#444',
    width: 70, textAlign: 'center',
  },
  limitUnit: { color: '#888', fontSize: 13 },

  // Дни и слоты
  dayLabel: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 10 },
  noSlots: { color: '#555', fontSize: 13, marginBottom: 8 },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0f0f23', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
  },
  slotTime: { color: '#6c63ff', fontSize: 15, fontWeight: '500' },
  removeBtn: { color: '#ef4444', fontSize: 16 },
  addForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  timeInputSlot: {
    flex: 1, backgroundColor: '#0f0f23', borderRadius: 8, padding: 8,
    color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#444', textAlign: 'center',
  },
  confirmBtn: { backgroundColor: '#6c63ff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  confirmBtnText: { color: '#fff', fontSize: 16 },
  addBtn: { marginTop: 4 },
  addBtnText: { color: '#6c63ff', fontSize: 14 },

  saveBtn: {
    backgroundColor: '#6c63ff', borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
