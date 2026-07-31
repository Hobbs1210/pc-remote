import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text, View, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native'
import { useAuthStore } from '../store/auth'
import { loadServerUrl, setServerUrl, API_URL, DEFAULT_API_URL } from '../api/client'
import LoginScreen from '../screens/LoginScreen'
import DevicesScreen from '../screens/DevicesScreen'
import ControlScreen from '../screens/ControlScreen'
import ScanScreen from '../screens/ScanScreen'
import ScheduleScreen from '../screens/ScheduleScreen'
import AnalyticsScreen from '../screens/AnalyticsScreen'

export type RootStackParams = {
  Main: undefined
  Control: { deviceId: string; deviceName: string }
  Scan: undefined
  Schedule: { deviceId: string; deviceName: string }
  Analytics: { deviceId: string; deviceName: string }
}


export type TabParams = {
  Devices: undefined
  Settings: undefined
}


const Stack = createNativeStackNavigator<RootStackParams>()
const Tab = createBottomTabNavigator<TabParams>()

function SettingsScreen() {
  const { logout } = useAuthStore()
  const [urlInput, setUrlInput] = React.useState(API_URL)
  const [saving, setSaving] = React.useState(false)

  const handleSaveUrl = async () => {
    const trimmed = urlInput.trim().replace(/\/+$/, '')
    if (!trimmed) return
    setSaving(true)
    try {
      await setServerUrl(trimmed)
      Alert.alert('Success', 'Server URL updated. Please log in again.')
    } finally {
      setSaving(false)
    }
  }

  const handleResetUrl = async () => {
    setUrlInput(DEFAULT_API_URL)
    await setServerUrl(DEFAULT_API_URL)
    Alert.alert('Success', 'Server URL reset to default.')
  }

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ])
  }

  return (
    <View style={s.container}>
      <Text style={s.label}>Server Address</Text>
      <TextInput
        style={s.input}
        value={urlInput}
        onChangeText={setUrlInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://..."
        placeholderTextColor="#555"
      />
      <View style={s.row}>
        <TouchableOpacity style={[s.btn, s.btnPrimary, s.flex1]} onPress={handleSaveUrl} disabled={saving}>
          <Text style={s.btnPrimaryText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={handleResetUrl}>
          <Text style={s.btnSecondaryText}>Reset</Text>
        </TouchableOpacity>
      </View>

      <View style={s.spacer} />

      <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={handleLogout}>
        <Text style={s.btnDangerText}>Log out of account</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', padding: 24 },
  label: { color: '#aaa', fontSize: 13, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#333', marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  spacer: { flex: 1 },
  btn: { borderRadius: 12, padding: 14, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#6c63ff' },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnSecondary: { backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#444' },
  btnSecondaryText: { color: '#aaa', fontSize: 15 },
  btnDanger: { backgroundColor: '#3d1a1a', borderWidth: 1, borderColor: '#7f1d1d' },
  btnDangerText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
})

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#1a1a2e', borderTopColor: '#333' },
        tabBarActiveTintColor: '#6c63ff',
        tabBarInactiveTintColor: '#888',
      }}
    >
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{
          title: 'Devices',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💻</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  )
}

export default function Navigation() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()

  React.useEffect(() => {
    void loadServerUrl().then(() => checkAuth())
  }, [])

  if (isLoading) return null

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen
            name="Main"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={TabNavigator}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Control"
              component={ControlScreen}
              options={({ route }) => ({ title: route.params.deviceName })}
            />
            <Stack.Screen
              name="Scan"
              component={ScanScreen}
              options={{ title: 'Scan QR Code' }}
            />
            <Stack.Screen
              name="Schedule"
              component={ScheduleScreen}
              options={({ route }) => ({ title: `Schedule — ${route.params.deviceName}` })}
            />
            <Stack.Screen
              name="Analytics"
              component={AnalyticsScreen}
              options={({ route }) => ({ title: `Analytics — ${route.params.deviceName}` })}
            />
          </>

        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}