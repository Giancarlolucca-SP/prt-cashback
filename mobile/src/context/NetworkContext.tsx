import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { networkStatus } from '../utils/networkStatus';

interface NetworkContextValue {
  isOnline: boolean;
  lastOnline: Date | null;
  /** Enqueue an action to retry when connection is restored */
  enqueue: (key: string, payload: OfflineAction) => Promise<void>;
  /** Get all queued actions */
  getQueue: () => Promise<OfflineAction[]>;
  /** Clear the queue */
  clearQueue: () => Promise<void>;
}

export interface OfflineAction {
  key:       string;
  type:      string;
  payload:   Record<string, unknown>;
  createdAt: string;
}

const QUEUE_KEY = 'prt_offline_queue';

const NetworkContext = createContext<NetworkContextValue>({
  isOnline:   true,
  lastOnline: null,
  enqueue:    async () => {},
  getQueue:   async () => [],
  clearQueue: async () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  // Start optimistic — no connectivity checks on mount.
  // State is driven solely by axios interceptor outcomes in client.ts.
  const [isOnline,   setIsOnline]   = useState(true);
  const [lastOnline, setLastOnline] = useState<Date | null>(null);

  useEffect(() => {
    // Register the setter so client.ts can update online state
    // without importing React context.
    networkStatus.register((online) => {
      setIsOnline((prev) => {
        if (online && !prev) setLastOnline(new Date());
        return online;
      });
    });
  }, []);

  // ── Offline queue ─────────────────────────────────────────────────────────

  async function enqueue(key: string, payload: OfflineAction) {
    try {
      const raw   = await AsyncStorage.getItem(QUEUE_KEY);
      const queue: OfflineAction[] = raw ? JSON.parse(raw) : [];
      const filtered = queue.filter((a) => a.key !== key);
      filtered.push(payload);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    } catch {}
  }

  async function getQueue(): Promise<OfflineAction[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async function clearQueue() {
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {}
  }

  return (
    <NetworkContext.Provider value={{ isOnline, lastOnline, enqueue, getQueue, clearQueue }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
