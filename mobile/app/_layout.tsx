import '../global.css';

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../src/store/auth';
import { AppConfigProvider } from '../src/context/AppConfigContext';
import { NetworkProvider } from '../src/context/NetworkContext';
import OfflineBanner from '../src/components/OfflineBanner';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import DynamicSplash from './splash';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const PRESELECTED_EST_KEY = 'postocash_preselected_establishment';

function parseEstablishmentId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const id = parsed.queryParams?.e;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

async function persistEstablishmentId(id: string | null) {
  if (!id) return;
  try {
    await SecureStore.setItemAsync(PRESELECTED_EST_KEY, id);
  } catch {}
}

function AppShell() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const [splashDone, setSplashDone] = useState(false);
  usePushNotifications();

  // Auth hydration and deep-link capture run in parallel with the splash
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const id = parseEstablishmentId(url);
      if (id) persistEstablishmentId(id);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const id = parseEstablishmentId(url);
      if (id) persistEstablishmentId(id);
    });

    return () => subscription.remove();
  }, []);

  if (!splashDone) {
    return <DynamicSplash onComplete={() => setSplashDone(true)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#1e3a5f" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="splash" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <OfflineBanner />
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider>
        <NetworkProvider>
          <AppShell />
        </NetworkProvider>
      </AppConfigProvider>
    </QueryClientProvider>
  );
}
