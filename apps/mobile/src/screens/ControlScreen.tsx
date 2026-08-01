import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Image,
  Switch,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useDevicesStore } from '../store/devices'
import type { ActiveUser, LocalUser, DiskInfo, ProcessInfo } from '../store/devices'
import { api } from '../api/client'
import type { RootStackParams } from '../navigation'

type Props = NativeStackScreenProps<RootStackParams, 'Control'>
type Nav = NativeStackNavigationProp<RootStackParams>

function UserRow({ user }: { user: ActiveUser }) {
  const isRemote = user.session === 'rdp'
  const isActive = user.state === 'Active'

  return (
    <View style={styles.userRow}>
      <View style={styles.userIcon}>
        <Text style={styles.userIconText}>{isRemote ? '🌐' : '🖥️'}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userMeta}>
          {isRemote ? 'Remote Desktop' : 'Local Session'}
          {' · '}
          {user.logonTime}
        </Text>
      </View>
      <View style={[styles.userStateBadge, { backgroundColor: isActive ? '#4ade8022' : '#88888822' }]}>
        <Text style={[styles.userStateText, { color: isActive ? '#4ade80' : '#888' }]}>
          {isActive ? 'Active' : 'Idle'}
        </Text>
      </View>
    </View>
  )
}

function LocalUserRow({ user }: { user: LocalUser }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userIcon}>
        <Text style={styles.userIconText}>👤</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{user.name}</Text>
        {user.fullName ? (
          <Text style={styles.userMeta}>{user.fullName}</Text>
        ) : null}
      </View>
      <View style={[styles.userStateBadge, { backgroundColor: user.enabled ? '#4ade8022' : '#88888822' }]}>
        <Text style={[styles.userStateText, { color: user.enabled ? '#4ade80' : '#888' }]}>
          {user.enabled ? 'Enabled' : 'Disabled'}
        </Text>
      </View>
    </View>
  )
}

interface CommandButtonProps {
  label: string
  emoji: string
  color: string
  onPress: () => void
}

function CommandButton({ label, emoji, color, onPress }: CommandButtonProps) {
  const bgAlphaColor = color + '12' // ~7% opacity for subtle colored backing
  return (
    <TouchableOpacity
      style={[styles.cmdButton, { borderColor: 'rgba(255, 255, 255, 0.03)' }]}
      onPress={onPress}
    >
      <View style={[styles.emojiBg, { backgroundColor: bgAlphaColor }]}>
        <Text style={styles.cmdEmoji}>{emoji}</Text>
      </View>
      <Text style={[styles.cmdLabel, { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function ProcessRow({ proc, onKill }: { proc: ProcessInfo; onKill: () => void }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userIcon}>
        <Text style={styles.userIconText}>⚡</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{proc.name}</Text>
        <Text style={styles.userMeta}>PID: {proc.pid} {proc.memMb ? `· ${proc.memMb} MB RAM` : ''}</Text>
      </View>
      <TouchableOpacity style={styles.killBtn} onPress={onKill}>
        <Text style={styles.killBtnText}>End Task</Text>
      </TouchableOpacity>
    </View>
  )
}

function DiskRow({ disk }: { disk: DiskInfo }) {
  const usedPct = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0
  const freeGb = (disk.free / 1073741824).toFixed(1)
  const totalGb = (disk.total / 1073741824).toFixed(1)
  return (
    <View style={styles.diskRow}>
      <Text style={styles.diskMount}>{disk.mount}</Text>
      <View style={styles.diskBarBg}>
        <View style={[styles.diskBarFill, { width: `${usedPct}%`, backgroundColor: usedPct > 85 ? '#ef4444' : '#6c63ff' }]} />
      </View>
      <Text style={styles.diskText}>{freeGb} / {totalGb} GB</Text>
    </View>
  )
}

export default function ControlScreen({ route }: Props) {
  const { deviceId, deviceName } = route.params
  const { sendCommand, showMessage, wakeOnLan, execTerminal, setVolumeLevel, triggerAgentUpdate, devices, localUsers, fetchLocalUsers, fetchScreenshot } = useDevicesStore()
  const navigation = useNavigation<Nav>()
  const device = devices.find((d) => d.id === deviceId)
  const deviceLocalUsers = localUsers[deviceId] ?? []

  useEffect(() => {
    void fetchLocalUsers(deviceId)
  }, [deviceId, fetchLocalUsers])

  const [delayModal, setDelayModal] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
  const [delaySeconds, setDelaySeconds] = useState('0')
  const [screenshotModal, setScreenshotModal] = useState(false)
  const [screenshotData, setScreenshotData] = useState<string | null>(null)
  const [screenshotLoading, setScreenshotLoading] = useState(false)
  const [messageModal, setMessageModal] = useState(false)
  const [customMessage, setCustomMessage] = useState('')
  const [terminalModal, setTerminalModal] = useState(false)
  const [terminalCommand, setTerminalCommand] = useState('')
  const [terminalLogs, setTerminalLogs] = useState<string[]>(['PS > Connected to PC Remote Console'])
  const [terminalRunning, setTerminalRunning] = useState(false)
  const screenshotPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [schedule, setSchedule] = useState<any | null>(null)
  const [lockModal, setLockModal] = useState(false)
  const [lockDurationEnabled, setLockDurationEnabled] = useState(true)
  const [lockDurationMinutes, setLockDurationMinutes] = useState('120')

  const loadSchedule = async () => {
    try {
      const { data } = await api.get<{ schedule?: any | null }>(`/devices/${deviceId}`)
      if (data.schedule) {
        setSchedule(data.schedule)
      } else {
        setSchedule(null)
      }
    } catch (e) {
      console.warn('Failed to load schedule', e)
    }
  }

  useEffect(() => {
    void loadSchedule()
  }, [deviceId])

  const handleToggleScheduleRestrictions = async (enable: boolean) => {
    try {
      const { data } = await api.get<{ schedule?: any }>(`/devices/${deviceId}`)
      const s = data.schedule || {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        days: {},
        blockedApps: []
      }

      // Bug #18 fix: preserve existing sub-feature enable states rather than overwriting them with master toggle
      const updatedDowntime = s.downtime 
        ? { ...s.downtime } 
        : { enabled: true, start: '23:00', end: '07:00' }
      const updatedDailyLimit = s.dailyLimit 
        ? { ...s.dailyLimit } 
        : { enabled: true, minutesWeekday: 120, minutesWeekend: 240 }

      const payload = {
        enabled: enable,
        timezone: s.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        days: s.days || {},
        downtime: updatedDowntime,
        dailyLimit: updatedDailyLimit,
        blockedApps: s.blockedApps || [],
        lockUntil: enable ? s.lockUntil : null // clear lockUntil when disabling
      }

      await api.put(`/devices/${deviceId}/schedule`, payload)
      
      Alert.alert(
        enable ? '✓ Schedule Enabled' : '✓ Schedule Disabled',
        enable ? 'All configured schedule restrictions are now active.' : 'All schedule limits, curfews, and temporary locks are disabled.'
      )
      
      void loadSchedule()
    } catch {
      Alert.alert('Error', 'Failed to update schedule')
    }
  }

  const handleLockPC = async () => {
    setLockModal(false)
    
    let lockUntilStr: string | null = null
    if (lockDurationEnabled) {
      const mins = parseInt(lockDurationMinutes)
      if (isNaN(mins) || mins <= 0) {
        Alert.alert('Error', 'Please enter a valid lock duration in minutes.')
        return
      }
      lockUntilStr = new Date(Date.now() + mins * 60 * 1000).toISOString()
    }

    try {
      // 1. Send the lock command
      await sendCommand(deviceId, 'LOCK', 0)

      // 2. If duration is enabled, update the schedule with lockUntil
      if (lockDurationEnabled && lockUntilStr) {
        const { data } = await api.get<{ schedule?: any }>(`/devices/${deviceId}`)
        const s = data.schedule || {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          days: {},
          blockedApps: []
        }

        const payload = {
          enabled: s.enabled ?? false,
          timezone: s.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          days: s.days || {},
          downtime: s.downtime || { enabled: false, start: '23:00', end: '07:00' },
          dailyLimit: s.dailyLimit || { enabled: false, minutesWeekday: 120, minutesWeekend: 240 },
          blockedApps: s.blockedApps || [],
          lockUntil: lockUntilStr
        }

        await api.put(`/devices/${deviceId}/schedule`, payload)
        Alert.alert('✓ Command Sent', `PC will lock immediately and remain restricted for ${lockDurationMinutes} minutes.`)
      } else {
        Alert.alert('✓ Command Sent', 'PC will lock immediately.')
      }

      void loadSchedule()
    } catch {
      Alert.alert('Error', 'Failed to send lock command')
    }
  }

  const handleUpdateAgent = () => {
    Alert.alert(
      'Update Agent',
      `Check GitHub Releases and update agent on "${deviceName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update Now',
          onPress: async () => {
            try {
              const res = await triggerAgentUpdate(deviceId)
              Alert.alert(
                res.delivered ? '✓ Update Signal Sent' : '⚠ Agent Offline',
                `Target Version: ${res.version}`
              )
            } catch {
              Alert.alert('Error', 'Failed to trigger agent update')
            }
          },
        },
      ]
    )
  }


  const runTerminalCommand = async () => {
    if (!terminalCommand.trim() || terminalRunning) return
    const cmd = terminalCommand.trim()
    setTerminalLogs((prev) => [...prev, `PS > ${cmd}`])
    setTerminalCommand('')
    setTerminalRunning(true)
    try {
      const res = await execTerminal(deviceId, cmd)
      if (res.delivered) {
        setTerminalLogs((prev) => [...prev, `[Command sent - Output will appear in history]`])
      } else {
        setTerminalLogs((prev) => [...prev, `[Device Offline - Queued]`])
      }
    } catch {
      setTerminalLogs((prev) => [...prev, `[Error sending command]`])
    } finally {
      setTerminalRunning(false)
    }
  }

  const sendCustomMessage = async () => {
    if (!customMessage.trim()) return
    try {
      await showMessage(deviceId, customMessage.trim())
      Alert.alert('✓ Message Sent', 'Banner sent to target PC screen')
      setMessageModal(false)
      setCustomMessage('')
    } catch {
      Alert.alert('Error', 'Failed to send message banner')
    }
  }

  const triggerWol = async () => {
    try {
      const res = await wakeOnLan(deviceId)
      Alert.alert('Wake-on-LAN Sent', `Magic packet sent to ${res.macAddress}`)
    } catch {
      Alert.alert('Error', 'Failed to send Wake-on-LAN packet')
    }
  }



  const handleKillProcess = (pid: number, name: string) => {
    Alert.alert(
      'End Process',
      `Are you sure you want to terminate "${name}" (PID: ${pid})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Task',
          style: 'destructive',
          onPress: async () => {
            try {
              await sendCommand(deviceId, 'KILL_PROCESS', 0, pid)
              Alert.alert('✓ Command Sent', `Termination signal sent to ${name}`)
            } catch {
              Alert.alert('Error', 'Failed to send kill command')
            }
          },
        },
      ]
    )
  }

  const takeScreenshot = async () => {
    setScreenshotLoading(true)
    setScreenshotData(null)
    setScreenshotModal(true)
    const before = new Date().toISOString()
    try {
      await sendCommand(deviceId, 'SCREENSHOT', 0)
    } catch {
      setScreenshotLoading(false)
      return
    }
    let attempts = 0
    screenshotPollRef.current = setInterval(async () => {
      attempts++
      const result = await fetchScreenshot(deviceId)
      if (result && result.capturedAt > before) {
        clearInterval(screenshotPollRef.current!)
        screenshotPollRef.current = null
        setScreenshotData(result.image)
        setScreenshotLoading(false)
      } else if (attempts >= 15) {
        clearInterval(screenshotPollRef.current!)
        screenshotPollRef.current = null
        setScreenshotLoading(false)
        Alert.alert('Timeout', 'Screenshot not received')
        setScreenshotModal(false)
      }
    }, 2000)
  }

  const addBonusTime = async (minutes: number) => {
    try {
      await api.post(`/devices/${deviceId}/schedule/bonus`, { minutes })
      Alert.alert('✓ Bonus Added', `+${minutes} min added to daily limit`)
      void loadSchedule()
    } catch {
      Alert.alert('Error', 'Failed to add bonus time')
    }
  }

  const executeCommand = async (type: string, delay = 0) => {
    try {
      const result = await sendCommand(deviceId, type, delay)
      Alert.alert(
        result.delivered ? '✓ Command Sent' : '⚠ Device Offline',
        result.delivered
          ? `${type} will be executed${delay > 0 ? ` in ${delay} seconds` : ''}`
          : 'Command queued and will execute when device connects'
      )
    } catch {
      Alert.alert('Error', 'Failed to send command')
    }
  }

  const confirmCommand = (type: string) => {
    Alert.alert(
      'Confirm Action',
      `Execute ${type} on "${deviceName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'With Delay',
          onPress: () => {
            setPendingCommand(type)
            setDelayModal(true)
          },
        },
        {
          text: 'Now',
          style: 'destructive',
          onPress: () => void executeCommand(type, 0),
        },
      ]
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  device?.status === 'online' ? '#4ade80' :
                  device?.status === 'away'   ? '#facc15' : '#ef4444',
              },
            ]}
          />
          <Text style={styles.statusText}>
            {device?.status ?? 'unknown'}
          </Text>
        </View>

        {device?.status === 'online' && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{device.cpuPercent}%</Text>
                <Text style={styles.statLbl}>CPU</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{device.ramPercent}%</Text>
                <Text style={styles.statLbl}>RAM</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>
                  {Math.floor((device.uptime ?? 0) / 3600)}h
                </Text>
                <Text style={styles.statLbl}>Uptime</Text>
              </View>
            </View>

            {(() => {
              const activeWin = device.activeWindow
              if (!activeWin || !activeWin.title) return null
              return (
                <View style={styles.activeWindowBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeWindowLbl}>ACTIVE APP</Text>
                    <Text style={styles.activeWindowVal} numberOfLines={1}>
                      🖥 {activeWin.title}
                    </Text>
                    {activeWin.processName ? (
                      <Text style={styles.activeWindowSubVal}>
                        {activeWin.processName} {activeWin.pid ? `(PID: ${activeWin.pid})` : ''}
                      </Text>
                    ) : null}
                  </View>
                  {activeWin.pid ? (
                    <TouchableOpacity
                      style={styles.activeWindowKillBtn}
                      onPress={() => handleKillProcess(activeWin.pid!, activeWin.processName || 'Active App')}
                    >
                      <Text style={styles.activeWindowKillBtnText}>End Task</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )
            })()}
          </>
        )}
      </View>

      {/* Commands */}
      <Text style={styles.sectionTitle}>Controls</Text>
      <View style={styles.cmdGrid}>
        <CommandButton
          label="Shutdown"
          emoji="⏻"
          color="#ef4444"
          onPress={() => confirmCommand('SHUTDOWN')}
        />
        <CommandButton
          label="Restart"
          emoji="↺"
          color="#f97316"
          onPress={() => confirmCommand('REBOOT')}
        />
        <CommandButton
          label="Lock"
          emoji="🔒"
          color="#6c63ff"
          onPress={() => setLockModal(true)}
        />
        <CommandButton
          label="Sleep"
          emoji="💤"
          color="#22d3ee"
          onPress={() => void executeCommand('SLEEP', 0)}
        />
      </View>

      {/* Volume & Utility */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Volume & Tools</Text>
      <View style={styles.cmdGrid}>
        <CommandButton
          label="Vol Down"
          emoji="🔉"
          color="#22d3ee"
          onPress={() => void executeCommand('VOLUME_DOWN', 0)}
        />
        <CommandButton
          label="Vol Up"
          emoji="🔊"
          color="#22d3ee"
          onPress={() => void executeCommand('VOLUME_UP', 0)}
        />
        <CommandButton
          label="Terminal"
          emoji="⌨️"
          color="#4ade80"
          onPress={() => setTerminalModal(true)}
        />
        <CommandButton
          label="Screenshot"
          emoji="📷"
          color="#a78bfa"
          onPress={() => void takeScreenshot()}
        />
        <CommandButton
          label="Message"
          emoji="💬"
          color="#38bdf8"
          onPress={() => setMessageModal(true)}
        />
        <CommandButton
          label="Wake-on-LAN"
          emoji="⚡"
          color="#facc15"
          onPress={() => void triggerWol()}
        />
        <CommandButton
          label="Analytics"
          emoji="📊"
          color="#6c63ff"
          onPress={() => navigation.navigate('Analytics', { deviceId, deviceName })}
        />
        <CommandButton
          label="Update Agent"
          emoji="🚀"
          color="#ec4899"
          onPress={handleUpdateAgent}
        />
      </View>

      {/* Schedule Status & Control */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Schedule Status</Text>
      {schedule && (schedule.enabled || schedule.downtime?.enabled || schedule.dailyLimit?.enabled || (schedule.lockUntil && new Date(schedule.lockUntil) > new Date())) ? (
        <TouchableOpacity
          style={[styles.scheduleToggleBtn, styles.scheduleActiveBtn]}
          onPress={() => void handleToggleScheduleRestrictions(false)}
        >
          <Text style={styles.scheduleToggleEmoji}>🔓</Text>
          <View style={styles.scheduleToggleTextContainer}>
            <Text style={styles.scheduleToggleTitleActive}>Disable Schedule Restrictions</Text>
            <Text style={styles.scheduleToggleSubActive}>
              {schedule.lockUntil && new Date(schedule.lockUntil) > new Date()
                ? `Temporarily locked until ${new Date(schedule.lockUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Schedule rules or limits are currently active'}
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.scheduleToggleBtn, styles.scheduleDisabledBtn]}
          onPress={() => void handleToggleScheduleRestrictions(true)}
        >
          <Text style={styles.scheduleToggleEmoji}>🗓️</Text>
          <View style={styles.scheduleToggleTextContainer}>
            <Text style={styles.scheduleToggleTitle}>Enable Schedule Restrictions</Text>
            <Text style={styles.scheduleToggleSub}>All curfews, daily limits, and hours are inactive</Text>
          </View>
        </TouchableOpacity>
      )}




      {/* Disks */}
      {device?.status === 'online' && (device?.disks?.length ?? 0) > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Disks</Text>
          <View style={styles.usersCard}>
            {device.disks.map((d) => (
              <DiskRow key={d.mount} disk={d} />
            ))}
          </View>
        </>
      )}

      {/* Top Processes */}
      {device?.status === 'online' && (device?.topProcesses?.length ?? 0) > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Top Processes</Text>
          <View style={styles.usersCard}>
            {device.topProcesses!.map((p) => (
              <ProcessRow key={p.pid} proc={p} onKill={() => handleKillProcess(p.pid, p.name)} />
            ))}
          </View>
        </>
      )}

      {/* Active Sessions */}
      {device?.status === 'online' && (device?.activeUsers?.length ?? 0) > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Active Sessions</Text>
          <View style={styles.usersCard}>
            {device.activeUsers.map((u, i) => (
              <UserRow key={u.name + i} user={u} />
            ))}
          </View>
        </>
      )}


      {/* Local PC Accounts */}
      {deviceLocalUsers.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Local PC Accounts</Text>
          <View style={styles.usersCard}>
            {deviceLocalUsers.map((u) => (
              <LocalUserRow key={u.id} user={u} />
            ))}
          </View>
        </>
      )}

      {/* Bonus Time */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Schedule</Text>
      <View style={styles.bonusRow}>
        {[15, 30, 60].map((min) => (
          <TouchableOpacity
            key={min}
            style={styles.bonusBtn}
            onPress={() => void addBonusTime(min)}
          >
            <Text style={styles.bonusEmoji}>⏱</Text>
            <Text style={styles.bonusLabel}>+{min} min</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Schedule Settings */}
      <TouchableOpacity
        style={[styles.scheduleBtn, { marginTop: 8 }]}
        onPress={() => navigation.navigate('Schedule', { deviceId, deviceName })}
      >
        <Text style={styles.scheduleEmoji}>🕐</Text>
        <Text style={styles.scheduleBtnText}>Schedule Settings</Text>
        <Text style={styles.scheduleArrow}>›</Text>
      </TouchableOpacity>

      {/* Lock Duration & Confirmation Modal */}
      <Modal visible={lockModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>🔒 Lock Workstation</Text>
              <TouchableOpacity onPress={() => setLockModal(false)}>
                <Text style={{ color: '#888', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.lockWarningBox}>
              <Text style={styles.lockWarningText}>
                ⚠️ <Text style={{ fontWeight: '700' }}>Important Notice:</Text> Windows security prevents remote unlocking. You must physically enter the password/PIN on the PC to unlock it.
              </Text>
            </View>

            <View style={styles.toggleRow}>
              <Text style={{ color: '#fff', fontSize: 15 }}>Lock for a specific duration</Text>
              <Switch
                value={lockDurationEnabled}
                onValueChange={setLockDurationEnabled}
                trackColor={{ false: '#333', true: '#6c63ff' }}
                thumbColor="#fff"
              />
            </View>

            {lockDurationEnabled && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>DURATION (MINUTES)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={lockDurationMinutes}
                  onChangeText={setLockDurationMinutes}
                  keyboardType="number-pad"
                  placeholder="Minutes (e.g. 120)"
                  placeholderTextColor="#666"
                />
              </View>
            )}

            <View style={[styles.modalButtons, { marginTop: 16 }]}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setLockModal(false)}
              >
                <Text style={{ color: '#888' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: '#ef4444' }]}
                onPress={() => void handleLockPC()}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Lock PC</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Screenshot Modal */}
      <Modal visible={screenshotModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { padding: 0, overflow: 'hidden' }]}>
            {screenshotLoading ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 16 }}>Capturing screenshot...</Text>
              </View>
            ) : screenshotData ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${screenshotData}` }}
                style={{ width: '100%', aspectRatio: 16 / 9 }}
                resizeMode="contain"
              />
            ) : null}
            <TouchableOpacity
              style={[styles.modalCancel, { margin: 12 }]}
              onPress={() => {
                if (screenshotPollRef.current) {
                  clearInterval(screenshotPollRef.current)
                  screenshotPollRef.current = null
                }
                setScreenshotModal(false)
              }}
            >
              <Text style={{ color: '#888' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Terminal Modal */}
      <Modal visible={terminalModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { height: '80%', padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>PowerShell Remote Console</Text>
              <TouchableOpacity onPress={() => setTerminalModal(false)}>
                <Text style={{ color: '#888', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.terminalBox} contentContainerStyle={{ padding: 12 }}>
              {terminalLogs.map((log, i) => (
                <Text key={i} style={styles.terminalLine}>{log}</Text>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0, fontFamily: 'monospace' }]}
                value={terminalCommand}
                onChangeText={setTerminalCommand}
                placeholder="e.g. ipconfig, Get-Service"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => void runTerminalCommand()}
              />
              <TouchableOpacity
                style={[styles.modalConfirm, { width: 70, justifyContent: 'center' }]}
                onPress={() => void runTerminalCommand()}
                disabled={terminalRunning}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Run</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Message Modal */}
      <Modal visible={messageModal} transparent animationType="fade">

        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send Message Banner</Text>
            <TextInput
              style={styles.modalInput}
              value={customMessage}
              onChangeText={setCustomMessage}
              placeholder="e.g. Dinner is ready!"
              placeholderTextColor="#666"
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setMessageModal(false)}
              >
                <Text style={{ color: '#888' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={() => void sendCustomMessage()}
              >
                <Text style={{ color: '#fff' }}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delay Modal */}

      <Modal visible={delayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Delay for {pendingCommand}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={delaySeconds}
              onChangeText={setDelaySeconds}
              keyboardType="number-pad"
              placeholder="Seconds"
              placeholderTextColor="#666"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setDelayModal(false)}
              >
                <Text style={{ color: '#888' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={() => {
                  setDelayModal(false)
                  if (pendingCommand) {
                    void executeCommand(
                      pendingCommand,
                      parseInt(delaySeconds) || 0
                    )
                  }
                }}
              >
                <Text style={{ color: '#fff' }}>Execute</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a16' },
  content: { padding: 16 },
  statusCard: {
    backgroundColor: '#121225',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBox: { alignItems: 'center' },
  statVal: { color: '#7c3aed', fontSize: 20, fontWeight: '700' },
  statLbl: { color: '#666', fontSize: 12, marginTop: 2 },
  activeWindowBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  activeWindowLbl: { color: '#666', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  activeWindowVal: { color: '#fff', fontSize: 13, fontWeight: '500', marginTop: 4 },
  activeWindowSubVal: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  activeWindowKillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginLeft: 12,
  },
  activeWindowKillBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  terminalBox: {
    flex: 1,
    backgroundColor: '#050510',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  terminalLine: { color: '#4ade80', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 },

  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cmdGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cmdButton: {
    width: '47%',
    backgroundColor: '#121225',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  emojiBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cmdEmoji: { fontSize: 22 },
  cmdLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: {
    backgroundColor: '#121225',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0a0a16',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalConfirm: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#7c3aed',
  },
  bonusRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  bonusBtn: {
    flex: 1,
    backgroundColor: '#121225',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.2)',
  },
  bonusEmoji: { fontSize: 18, marginBottom: 4 },
  bonusLabel: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121225',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 12,
  },
  scheduleEmoji: { fontSize: 22, marginRight: 12 },
  scheduleBtnText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
  scheduleArrow: { color: '#666', fontSize: 22 },
  usersCard: {
    backgroundColor: '#121225',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
    gap: 12,
  },
  userIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0a0a16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userIconText: { fontSize: 18 },
  userInfo: { flex: 1 },
  userName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  userMeta: { color: '#666', fontSize: 12, marginTop: 2 },
  userStateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  userStateText: { fontSize: 12, fontWeight: '600' },
  killBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  killBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  diskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
    gap: 10,
  },
  diskMount: { color: '#fff', fontSize: 13, fontWeight: '600', width: 32 },
  diskBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  diskBarFill: { height: '100%', borderRadius: 3 },
  diskText: { color: '#666', fontSize: 12, width: 80, textAlign: 'right' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  scheduleToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  scheduleActiveBtn: {
    backgroundColor: 'rgba(49, 46, 129, 0.4)',
    borderColor: '#4f46e5',
  },
  scheduleDisabledBtn: {
    backgroundColor: '#121225',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  scheduleToggleEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  scheduleToggleTextContainer: {
    flex: 1,
  },
  scheduleToggleTitleActive: {
    color: '#34d399',
    fontSize: 15,
    fontWeight: '600',
  },
  scheduleToggleSubActive: {
    color: '#a5b4fc',
    fontSize: 12,
    marginTop: 2,
  },
  scheduleToggleTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  scheduleToggleSub: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  lockWarningBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  lockWarningText: {
    color: '#fef3c7',
    fontSize: 12,
    lineHeight: 18,
  },
})