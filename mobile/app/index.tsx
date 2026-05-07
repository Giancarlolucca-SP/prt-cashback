import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../src/store/auth';
import { customerApi } from '../src/api/client';
import { ONBOARDING_KEY } from './(onboarding)/index';

type State =
  | 'loading'           // hydrating SecureStore
  | 'refreshing'        // silently refreshing token
  | 'biometrics'        // waiting for biometric result
  | 'biometrics-failed' // biometric failed — show retry
  | 'ready'             // go to tabs
  | 'onboarding'        // first launch — show onboarding
  | 'unauthenticated';  // go to login

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

export default function Entry() {
  const { token, biometricsEnabled, hydrated, setAuth, logout } = useAuthStore();
  const [state,        setState]        = useState<State>('loading');
  const [biometricErr, setBiometricErr] = useState('');

  useEffect(() => {
    if (!hydrated) return;
    checkOnboarding();
  }, [hydrated]);

  async function checkOnboarding() {
    const done = await SecureStore.getItemAsync(ONBOARDING_KEY);
    if (!done) {
      setState('onboarding');
      return;
    }
    if (!token) { setState('unauthenticated'); return; }
    init();
  }

  async function init() {
    // 1. Silent token refresh if expiring within 7 days
    try {
      const exp = decodeJwtExp(token!);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const expiresInMs = exp ? exp * 1000 - Date.now() : Infinity;

      if (expiresInMs < sevenDaysMs) {
        setState('refreshing');
        const { data } = await customerApi.refreshToken();
        await SecureStore.setItemAsync('postocash_token', data.token);
        const store = useAuthStore.getState();
        await store.setAuth(data.token, data.cliente, store.establishmentName ?? '');
      }
    } catch {
      // Refresh failed — token may be expired; biometric gate will handle it
    }

    // 2. Biometric gate
    if (biometricsEnabled) {
      await triggerBiometric();
    } else {
      setState('ready');
    }
  }

  async function triggerBiometric() {
    setState('biometrics');
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled   = await LocalAuthentication.isEnrolledAsync();

      if (!compatible || !enrolled) {
        // Hardware not available — skip biometric gate
        setState('ready');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:   'Confirme sua identidade para entrar',
        fallbackLabel:   'Usar código',
        cancelLabel:     'Cancelar',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setState('ready');
      } else {
        const msg = result.error === 'user_cancel'
          ? 'Autenticação cancelada.'
          : 'Biometria não reconhecida.';
        setBiometricErr(msg);
        setState('biometrics-failed');
      }
    } catch (err: any) {
      setBiometricErr('Erro ao verificar biometria.');
      setState('biometrics-failed');
    }
  }

  async function handleLogout() {
    await logout();
    setState('unauthenticated');
  }

  // ── Loading / refreshing ──────────────────────────────────────────────────────

  if (state === 'loading' || state === 'refreshing') {
    return (
      <View className="flex-1 items-center justify-center bg-primary-700">
        <ActivityIndicator color="#F59E0B" size="large" />
        {state === 'refreshing' && (
          <Text className="text-white/60 text-sm mt-3">Atualizando sessão...</Text>
        )}
      </View>
    );
  }

  // ── Biometric in-progress ─────────────────────────────────────────────────────

  if (state === 'biometrics') {
    return (
      <View className="flex-1 items-center justify-center bg-primary-700">
        <ActivityIndicator color="#F59E0B" size="large" />
        <Text className="text-white/60 text-sm mt-3">Verificando identidade...</Text>
      </View>
    );
  }

  // ── Biometric failed — retry screen ───────────────────────────────────────────

  if (state === 'biometrics-failed') {
    return (
      <View className="flex-1 items-center justify-center bg-primary-700 px-8">
        <View className="w-24 h-24 rounded-full bg-white/10 items-center justify-center mb-6">
          <Text className="text-5xl">🔒</Text>
        </View>

        <Text className="text-white text-xl font-bold text-center mb-2">
          Verificação necessária
        </Text>
        <Text className="text-white/60 text-sm text-center leading-5 mb-8">
          {biometricErr || 'Não foi possível verificar sua identidade.'}
        </Text>

        <TouchableOpacity
          onPress={triggerBiometric}
          className="w-full bg-white py-4 rounded-2xl items-center mb-3"
        >
          <Text className="text-primary-700 text-base font-bold">Tentar novamente</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleLogout} className="py-3">
          <Text className="text-white/40 text-sm">Sair da conta</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'onboarding')      return <Redirect href="/(onboarding)" />;
  if (state === 'ready')           return <Redirect href="/(tabs)" />;
  return <Redirect href="/(auth)/welcome" />;
}
