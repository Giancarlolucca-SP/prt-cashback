import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppConfig, DEFAULT_CONFIG } from '../../config/appConfig';
import { api } from '../api/client';

interface AppConfigContextValue {
  config: AppConfig;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigContextValue>({
  config:          DEFAULT_CONFIG,
  loading:         true,
  refreshBranding: async () => {},
});

const CACHE_KEY    = 'postocash_app_config_v2';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEnvelope {
  config:    AppConfig;
  cachedAt:  number;
}

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config,  setConfig]  = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  async function fetchAndCache(): Promise<AppConfig | null> {
    try {
      const fetchTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('config-timeout')), 5000)
      );
      const { data } = await Promise.race([api.get('/app/config'), fetchTimeout]);
      const merged: AppConfig = { ...DEFAULT_CONFIG, ...data };
      const envelope: CacheEnvelope = { config: merged, cachedAt: Date.now() };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
      return merged;
    } catch {
      return null;
    }
  }

  async function loadConfig() {
    const safetyTimer = setTimeout(() => setLoading(false), 3000);

    try {
      // 1. Load cached config instantly (prevents flash of defaults)
      let cacheAge = Infinity;
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const envelope: CacheEnvelope = JSON.parse(raw);
          cacheAge = Date.now() - (envelope.cachedAt ?? 0);
          setConfig({ ...DEFAULT_CONFIG, ...envelope.config });
        }
      } catch {}

      // 2. Fetch fresh if cache is expired or missing
      if (cacheAge >= CACHE_TTL_MS) {
        const fresh = await fetchAndCache();
        if (fresh) setConfig(fresh);
      } else {
        // Cache is still fresh — refresh silently in the background after render
        fetchAndCache().then((fresh) => { if (fresh) setConfig(fresh); });
      }
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
    }
  }

  async function refreshBranding() {
    const fresh = await fetchAndCache();
    if (fresh) setConfig(fresh);
  }

  return (
    <AppConfigContext.Provider value={{ config, loading, refreshBranding }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
