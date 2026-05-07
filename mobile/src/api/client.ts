import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { getOrCreateDeviceId } from '../utils/deviceId';
import { networkStatus } from '../utils/networkStatus';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.15.10:3000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

console.log('[API] Base URL:', api.defaults.baseURL);

// ── JWT helpers (client-side, no verification) ────────────────────────────────

export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * Returns true when the stored token is missing, unparseable, or expires
 * within the next 60 seconds — meaning a fresh token is needed.
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Date.now() / 1000 > payload.exp - 60;
}

// ── Request interceptor — inject token + device ID ────────────────────────────

api.interceptors.request.use(async (config) => {
  const [token, deviceId] = await Promise.all([
    SecureStore.getItemAsync('postocash_token'),
    getOrCreateDeviceId(),
  ]);
  if (token)    config.headers.Authorization = `Bearer ${token}`;
  if (deviceId) config.headers['X-Device-Id']  = deviceId;
  return config;
});

// ── Response interceptor — handle 401 / token expiry ─────────────────────────

let isRefreshing = false;
let pendingResolve: (() => void) | null = null;

async function tryRefreshToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync('postocash_token');
    if (!token) return null;
    // Backend accepts expired tokens on this endpoint (ignoreExpiration: true)
    const { data } = await api.post('/app/token/refresh', {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const newToken: string = data.token;
    await SecureStore.setItemAsync('postocash_token', newToken);
    return newToken;
  } catch {
    return null;
  }
}

async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync('postocash_token'),
    SecureStore.deleteItemAsync('postocash_user'),
    SecureStore.deleteItemAsync('postocash_establishment'),
    SecureStore.deleteItemAsync('auth_token'),
    SecureStore.deleteItemAsync('customer_data'),
    SecureStore.deleteItemAsync('establishment_data'),
  ]).catch(() => {});
}

api.interceptors.response.use(
  (response) => {
    networkStatus.setOnline();
    return response;
  },
  async (error) => {
    if (!error.response) {
      networkStatus.setOffline();
    } else {
      networkStatus.setOnline();
    }

    const status = error.response?.status;
    const code   = error.response?.data?.codigo;

    // Device mismatch — don't retry, let the UI handle it
    if (status === 403 && code === 'WRONG_DEVICE') {
      return Promise.reject(error);
    }

    // Only intercept 401 once per request (prevent loops)
    if (status !== 401 || error.config._retry) {
      return Promise.reject(error);
    }

    error.config._retry = true;

    // If another request is already refreshing, wait for it
    if (isRefreshing) {
      await new Promise<void>((resolve) => { pendingResolve = resolve; });
      const newToken = await SecureStore.getItemAsync('postocash_token');
      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return api(error.config);
      }
      return Promise.reject(Object.assign(error, { requiresReauth: true }));
    }

    isRefreshing = true;

    try {
      // ── Step 1: silent token refresh ─────────────────────────────────────────
      // The backend endpoint accepts expired tokens, so this works even when
      // the token has already expired.
      const newToken = await tryRefreshToken();

      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`;
        pendingResolve?.();
        return api(error.config);
      }

      // ── Step 2: biometric re-auth gate ────────────────────────────────────────
      const biometricsEnabled = await SecureStore.getItemAsync('postocash_biometrics');
      if (biometricsEnabled === 'true') {
        const [compatible, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);

        if (compatible && enrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirme sua identidade para continuar',
            cancelLabel:   'Cancelar',
          });

          if (result.success) {
            // Try one more refresh after successful biometric
            const refreshed = await tryRefreshToken();
            if (refreshed) {
              error.config.headers.Authorization = `Bearer ${refreshed}`;
              pendingResolve?.();
              return api(error.config);
            }
          }
        }
      }

      // ── Step 3: all recovery failed — clear session ────────────────────────────
      await clearSession();
      pendingResolve?.();
      return Promise.reject(Object.assign(error, { requiresReauth: true }));

    } finally {
      isRefreshing = false;
      pendingResolve = null;
    }
  },
);

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: {
    cpf:              string;
    name:             string;
    phone:            string;
    establishmentCnpj: string;
    deviceId?:        string;
    selfieThumb?:     string;
    selfieFull?:      string;
    selfieBase64?:    string;
  }) => api.post('/app/register', data),

  login: (data: { cpf: string; establishmentCnpj: string }) =>
    api.post('/app/login', data),

  sendOtp: (data: { phone: string; establishmentCnpj: string }) =>
    api.post('/app/otp/send', data),

  verifyOtp: (data: { phone: string; code: string; establishmentCnpj: string }) =>
    api.post('/app/otp/verify', data),

  recoveryLookup: (data: { cpf: string; establishmentCnpj: string }) =>
    api.post('/app/recovery/lookup', data),

  recoveryComplete: (data: {
    cpf:              string;
    establishmentCnpj: string;
    deviceId:         string;
    selfieThumb?:     string;
    selfieFull?:      string;
    selfieBase64?:    string;
  }) => api.post('/app/recovery/complete', data),

  verifyCpf: (data: { cpf: string; establishmentCnpj: string }) =>
    api.post('/app/verify-cpf', data),

  registerSelfie: (data: { selfie: string }) =>
    api.post('/app/register-selfie', data, { timeout: 120_000 }),

  verifyFace: (data: {
    selfieThumb?:  string;
    selfieFull?:   string;
    selfieBase64?: string;
    cnpj:          string;
    cpf?:          string;
    deviceId:      string;
  }) => api.post('/app/verify-face', data, { timeout: 30_000 }),
};

// ── Customer API ──────────────────────────────────────────────────────────────

export const customerApi = {
  getBalance: () => api.get('/app/balance'),

  recordTransaction: (data: { amount: number; fuelType?: string; liters?: number }) =>
    api.post('/app/transaction', data),

  generateRedemption: (data: { amount: number; latitude?: number; longitude?: number }) =>
    api.post('/app/redeem/generate', data),

  validateRedemption: (data: { code: string; latitude?: number; longitude?: number }) =>
    api.post('/app/redeem/validate', data),

  getHistory: (page = 1) =>
    api.get('/app/history', { params: { page } }),

  getStatement: (page = 1) =>
    api.get('/app/statement', { params: { page } }),

  validateNfce: (data: { qrCodeUrl: string }) =>
    api.post('/app/validate-nfce', data),

  validatePhoto: (data: { photo: string }) =>
    api.post('/app/validate-photo', data, { timeout: 120_000 }),

  refreshToken: () =>
    api.post('/app/token/refresh'),
};
