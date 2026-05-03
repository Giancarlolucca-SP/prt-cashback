import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import Button from '../../src/components/ui/Button';
import { authApi } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { maskPhone } from '../../src/utils/formatters';

// Navigate to selfie with full params
function goToSelfie(mode: string, params: Record<string, string>) {
  router.push({
    pathname: '/(auth)/selfie',
    params: {
      mode,
      nome:  params.nome  ?? '',
      cpf:   params.cpf   ?? '',
      phone: params.phone ?? '',
      cnpj:  params.cnpj  ?? '',
    },
  });
}

const CODE_LENGTH = 6;

export default function OtpScreen() {
  const params = useLocalSearchParams<{
    mode:    string;
    nome:    string;
    cpf:     string;
    phone:   string;
    cnpj:    string;
    devCode: string;
  }>();

  const setAuth = useAuthStore((s) => s.setAuth);

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Auto-fill in dev mode when devCode param is provided
  useEffect(() => {
    if (params.devCode && params.devCode.length === CODE_LENGTH) {
      setDigits(params.devCode.split(''));
    }
  }, [params.devCode]);

  const code = digits.join('');
  const maskedPhone = maskPhone(params.phone ?? '');

  // ── Verify OTP ──────────────────────────────────────────────────────────────

  const [isCheckingCpf, setIsCheckingCpf] = useState(false);

  const { mutate: verify, isPending: isVerifying } = useMutation({
    mutationFn: () =>
      authApi.verifyOtp({
        phone:             (params.phone ?? '').replace(/\D/g, ''),
        code,
        establishmentCnpj: (params.cnpj ?? '').replace(/\D/g, ''),
      }),
    onSuccess: async () => {
      if (params.mode === 'recovery') {
        // Recovery always goes to selfie for identity re-verification
        goToSelfie('recovery', params as Record<string, string>);
        return;
      }

      if (params.mode === 'register') {
        // Check if CPF already exists at this establishment (reinstall scenario)
        setIsCheckingCpf(true);
        try {
          const { data } = await authApi.verifyCpf({
            cpf:               params.cpf ?? '',
            establishmentCnpj: params.cnpj ?? '',
          });

          if (data.existe) {
            // Returning user — restore session via selfie (recovery mode)
            Alert.alert(
              'Conta encontrada',
              `Olá, ${data.nome}! Encontramos sua conta. Vamos confirmar sua identidade para restaurar o acesso.`,
              [{
                text: 'Continuar',
                onPress: () => goToSelfie('recovery', { ...params as Record<string, string>, nome: data.nome }),
              }],
            );
          } else {
            // New user — full registration via selfie
            goToSelfie('register', params as Record<string, string>);
          }
        } catch {
          // If check fails, proceed with registration (fail open)
          goToSelfie('register', params as Record<string, string>);
        } finally {
          setIsCheckingCpf(false);
        }
        return;
      }

      // Login mode — complete login after OTP
      completeLogin();
    },
    onError: (err: any) => {
      Alert.alert('Código inválido', err.response?.data?.erro ?? 'Verifique o código e tente novamente.');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    },
  });

  // ── Complete login (after OTP in login mode) ─────────────────────────────────

  const { mutate: completeLogin, isPending: isLoggingIn } = useMutation({
    mutationFn: () =>
      authApi.login({
        cpf:              (params.cpf ?? '').replace(/\D/g, ''),
        establishmentCnpj: (params.cnpj ?? '').replace(/\D/g, ''),
      }),
    onSuccess: ({ data }) => {
      setAuth(data.token, data.cliente, data.estabelecimento?.nome ?? '');
      router.replace('/(tabs)');
    },
    onError: (err: any) => {
      Alert.alert('Erro ao entrar', err.response?.data?.erro ?? 'Tente novamente.');
    },
  });

  // ── Resend OTP ────────────────────────────────────────────────────────────────

  const [resendCooldown, setResendCooldown] = useState(0);

  const { mutate: resend } = useMutation({
    mutationFn: () =>
      authApi.sendOtp({
        phone:            (params.phone ?? '').replace(/\D/g, ''),
        establishmentCnpj: (params.cnpj ?? '').replace(/\D/g, ''),
      }),
    onSuccess: ({ data }) => {
      Alert.alert('Código reenviado', 'Verifique seu celular.');
      if (data.codigo) {
        setDigits(data.codigo.split(''));
      }
      // 60-second cooldown
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) { clearInterval(interval); return 0; }
          return s - 1;
        });
      }, 1000);
    },
    onError: (err: any) => {
      Alert.alert('Erro', err.response?.data?.erro ?? 'Tente novamente.');
    },
  });

  // ── Digit input handlers ──────────────────────────────────────────────────────

  function handleChange(text: string, index: number) {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  const isPending = isVerifying || isLoggingIn || isCheckingCpf;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          className="px-6 pt-6 pb-10"
        >
          {/* Icon */}
          <View className="items-center mb-6 mt-4">
            <View className="w-20 h-20 rounded-full bg-primary-50 items-center justify-center mb-4">
              <Ionicons name="chatbubble-ellipses-outline" size={36} color="#1e3a5f" />
            </View>
            <Text className="text-primary-700 text-2xl font-bold text-center">
              Verificação por SMS
            </Text>
            <Text className="text-slate-500 text-sm mt-2 text-center leading-5">
              Enviamos um código de 6 dígitos{'\n'}para {maskedPhone}
            </Text>
          </View>

          {/* Code input boxes */}
          <View className="flex-row justify-center gap-3 mb-8">
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(r) => { inputRefs.current[i] = r; }}
                value={d}
                onChangeText={(t) => handleChange(t, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                className={[
                  'w-12 h-14 text-center text-2xl font-bold rounded-xl border-2',
                  d
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-slate-300 bg-white text-slate-800',
                ].join(' ')}
              />
            ))}
          </View>

          <Button
            title="Verificar código"
            loadingText="Verificando..."
            fullWidth
            loading={isPending}
            disabled={code.length < CODE_LENGTH}
            onPress={() => verify()}
            style={{ marginBottom: 16 }}
          />

          {/* Resend */}
          <View className="items-center">
            {resendCooldown > 0 ? (
              <Text className="text-slate-400 text-sm">
                Reenviar em {resendCooldown}s
              </Text>
            ) : (
              <TouchableOpacity onPress={() => resend()}>
                <Text className="text-primary-600 text-sm font-semibold">
                  Não recebi o código — reenviar
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
