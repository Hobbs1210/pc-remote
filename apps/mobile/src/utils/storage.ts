import * as SecureStore from 'expo-secure-store'

export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key)
      }
      return null
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      return await SecureStore.setItemAsync(key, value)
    } catch {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value)
      }
    }
  },

  async deleteItem(key: string): Promise<void> {
    try {
      return await SecureStore.deleteItemAsync(key)
    } catch {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key)
      }
    }
  },
}
