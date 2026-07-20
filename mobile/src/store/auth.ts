import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

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
    // Write under both key sets — postocash_* primary, auth_*/customer_*/establishment_* for compatibility
    await Promise.all([
      SecureStore.setItemAsync('postocash_token',          token),
      SecureStore.setItemAsync('postocash_user',           userJson),
      SecureStore.setItemAsync('postocash_establishment',  establishmentName),
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
    SecureStore.setItemAsync('postocash_user', JSON.stringify(updated));
  },

  logout: async () => {
    // Deliberately does NOT clear the device ID. It did previously ("so the
    // next login re-binds"), but device binding is meant to be a property of
    // this physical installation, not the session — clearing it here meant
    // getOrCreateDeviceId() minted a brand-new random ID on the very next
    // login, which the backend's deviceMiddleware then saw as a mismatch
    // against the one still stored on the customer's row (login itself never
    // updates it), triggering a false WRONG_DEVICE block + fraud alert for
    // the completely ordinary case of a customer logging out and back into
    // their own phone. The device ID should only ever change via a real
    // reinstall (SecureStore is wiped automatically) or the explicit
    // selfie-verified recovery flow — not a routine logout.
    await Promise.all([
      SecureStore.deleteItemAsync('postocash_token'),
      SecureStore.deleteItemAsync('postocash_user'),
      SecureStore.deleteItemAsync('postocash_establishment'),
      SecureStore.deleteItemAsync('auth_token'),
      SecureStore.deleteItemAsync('customer_data'),
      SecureStore.deleteItemAsync('establishment_data'),
    ]);
    set({ token: null, user: null, establishmentName: null });
  },

  setBiometrics: async (enabled) => {
    await SecureStore.setItemAsync('postocash_biometrics', enabled ? 'true' : 'false');
    set({ biometricsEnabled: enabled });
  },

  hydrate: async () => {
    try {
      const [token, userRaw, estab, biometrics] = await Promise.all([
        SecureStore.getItemAsync('postocash_token'),
        SecureStore.getItemAsync('postocash_user'),
        SecureStore.getItemAsync('postocash_establishment'),
        SecureStore.getItemAsync('postocash_biometrics'),
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
