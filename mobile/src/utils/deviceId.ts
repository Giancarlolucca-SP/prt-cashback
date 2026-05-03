import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'prt_device_id';

/**
 * Returns a stable unique device identifier.
 * Generated once per installation and persisted in SecureStore.
 * Cleared on app reinstall — triggering the recovery flow.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  // Generate a UUID v4-style ID
  const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

/**
 * Explicitly clear device ID (used on logout to force re-binding on next login).
 * Note: on a full reinstall SecureStore is cleared automatically.
 */
export async function clearDeviceId(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
}
