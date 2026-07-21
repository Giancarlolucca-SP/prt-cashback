import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from '../api/client';

// Configure how notifications look when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:   true,
    shouldPlaySound:   true,
    shouldSetBadge:    false,
    shouldShowBanner:  true,
    shouldShowList:    true,
  }),
});

const PUSH_TOKEN_KEY = 'postocash_push_token_sent';
export const NOTIFICATIONS_ENABLED_KEY = 'postocash_notifications_enabled';

export function usePushNotifications() {
  useEffect(() => {
    SecureStore.getItemAsync(NOTIFICATIONS_ENABLED_KEY).then((v) => {
      // Default enabled (matches the settings screen's default) — only skip
      // registration if the customer explicitly turned it off before.
      if (v !== 'false') registerForPushNotifications();
    });
  }, []);
}

// Exported so the settings screen can call it immediately when the customer
// flips the toggle back on, instead of waiting for the next app launch.
export async function registerForPushNotifications() {
  try {
    // Android: create notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:       'PostoCash',
        importance:  Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1e3a5f',
        sound:      'default',
      });
    }

    // Request permissions
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'postocash', // matches app.json slug
    });
    const pushToken = tokenData.data;

    // Only send to backend once per install (or if token changed)
    const sent = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (sent === pushToken) return;

    await api.post('/app/push-token', { token: pushToken });
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken);
  } catch {
    // Push registration failing must never crash the app
  }
}

// Called when the customer turns the "Notificações push" switch off — clears
// the token server-side (so no more pushes get sent) and the local "already
// sent" marker (so turning it back on re-registers cleanly).
export async function unregisterPushNotifications() {
  try {
    await api.post('/app/push-token', { token: null });
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {
    // Same non-fatal contract as registration
  }
}
