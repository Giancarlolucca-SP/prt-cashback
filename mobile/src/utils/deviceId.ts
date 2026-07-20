import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'postocash_device_id';

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
 * Explicitly clear the stored device ID. Not called from logout — device
 * binding should survive an ordinary logout/login cycle on the same phone;
 * see the comment in store/auth.ts's logout(). Exists for a genuine
 * reset/support scenario, should one come up; a full reinstall already
 * clears SecureStore automatically.
 */
export async function clearDeviceId(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
}
