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

const PUSH_TOKEN_KEY = 'prt_push_token_sent';

export function usePushNotifications() {
  useEffect(() => {
    registerForPushNotifications();
  }, []);
}

async function registerForPushNotifications() {
  try {
    // Android: create notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:       'PRT Cashback',
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
      projectId: 'prt-cashback', // matches app.json slug
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
