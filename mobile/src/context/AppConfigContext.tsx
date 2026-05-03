import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppConfig, DEFAULT_CONFIG } from '../../config/appConfig';
import { api } from '../api/client';

interface AppConfigContextValue {
  config: AppConfig;
  loading: boolean;
}

const AppConfigContext = createContext<AppConfigContextValue>({
  config:  DEFAULT_CONFIG,
  loading: true,
});

const CACHE_KEY = 'prt_app_config';

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config,  setConfig]  = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    // Hard 3-second safety deadline — NEVER block app startup regardless of what hangs.
    const safetyTimer = setTimeout(() => setLoading(false), 3000);

    try {
      // 1. Restore cached config instantly (prevents flash of defaults)
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(cached) });
      } catch {}

      // 2. Fetch fresh from backend — 3 s timeout so we never block startup
      try {
        const fetchTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('config-timeout')), 3000)
        );
        const { data } = await Promise.race([api.get('/app/config'), fetchTimeout]);
        const merged   = { ...DEFAULT_CONFIG, ...data };
        setConfig(merged);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(merged));
      } catch {
        // Offline, server error, or timeout — cached / default config stays
      }
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false); // ALWAYS unblock the app
    }
  }

  return (
    <AppConfigContext.Provider value={{ config, loading }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
