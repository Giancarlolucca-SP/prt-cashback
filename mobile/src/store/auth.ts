import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { clearDeviceId } from '../utils/deviceId';

export interface CustomerUser {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  saldo: number;
  saldoFormatado: string;
}

interface AuthState {
  token: string | null;
  user: CustomerUser | null;
  establishmentName: string | null;
  biometricsEnabled: boolean;
  hydrated: boolean;

  setAuth: (token: string, user: CustomerUser, establishmentName: string) => Promise<void>;
  updateBalance: (saldo: number, saldoFormatado: string) => void;
  logout: () => Promise<void>;
  setBiometrics: (enabled: boolean) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token:             null,
  user:              null,
  establishmentName: null,
  biometricsEnabled: false,
  hydrated:          false,

  setAuth: async (token, user, establishmentName) => {
    const userJson  = JSON.stringify(user);
    // Write under both key sets — prt_* used internally, auth_*/customer_*/establishment_* for compatibility
    await Promise.all([
      SecureStore.setItemAsync('prt_token',          token),
      SecureStore.setItemAsync('prt_user',           userJson),
      SecureStore.setItemAsync('prt_establishment',  establishmentName),
      SecureStore.setItemAsync('auth_token',         token),
      SecureStore.setItemAsync('customer_data',      userJson),
      SecureStore.setItemAsync('establishment_data', establishmentName),
    ]);
    set({ token, user, establishmentName });
  },

  updateBalance: (saldo, saldoFormatado) => {
    const user = get().user;
    if (!user) return;
    const updated = { ...user, saldo, saldoFormatado };
    set({ user: updated });
    SecureStore.setItemAsync('prt_user', JSON.stringify(updated));
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync('prt_token'),
      SecureStore.deleteItemAsync('prt_user'),
      SecureStore.deleteItemAsync('prt_establishment'),
      SecureStore.deleteItemAsync('auth_token'),
      SecureStore.deleteItemAsync('customer_data'),
      SecureStore.deleteItemAsync('establishment_data'),
    ]);
    // Clear device binding so the next login re-binds to this device
    await clearDeviceId();
    set({ token: null, user: null, establishmentName: null });
  },

  setBiometrics: async (enabled) => {
    await SecureStore.setItemAsync('prt_biometrics', enabled ? 'true' : 'false');
    set({ biometricsEnabled: enabled });
  },

  hydrate: async () => {
    try {
      const [token, userRaw, estab, biometrics] = await Promise.all([
        SecureStore.getItemAsync('prt_token'),
        SecureStore.getItemAsync('prt_user'),
        SecureStore.getItemAsync('prt_establishment'),
        SecureStore.getItemAsync('prt_biometrics'),
      ]);
      set({
        token:             token ?? null,
        user:              userRaw ? JSON.parse(userRaw) : null,
        establishmentName: estab ?? null,
        biometricsEnabled: biometrics === 'true',
        hydrated:          true,
      });
    } catch {
      // SecureStore unavailable (e.g. first boot on some Android devices) —
      // start fresh but ALWAYS unblock the app.
      set({ hydrated: true });
    }
  },
}));
