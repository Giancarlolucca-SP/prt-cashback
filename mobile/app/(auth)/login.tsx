import React, { useState } from 'react';
import {
  View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import { authApi } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { maskCpfInput, isValidCpf, stripCpf, maskCnpj, maskPhone } from '../../src/utils/formatters';

type Step = 'credentials' | 'phone';

export default function LoginScreen() {
  const [step,  setStep]  = useState<Step>('credentials');
  const [cpf,   setCpf]   = useState('');
  const [cnpj,  setCnpj]  = useState('');
  const [phone, setPhone] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);

  // ── Step 1: verify CPF exists, then collect phone ──────────────────────────
  // We do a lightweight login first — if the customer exists, ask for phone to send OTP.
  // If they registered without OTP flow (legacy), we fall back to a direct login check.

  const { mutate: checkAndSendOtp, isPending: isSending } = useMutation({
    mutationFn: () =>
      authApi.sendOtp({
        phone:             phone.replace(/\D/g, ''),
        establishmentCnpj: cnpj.replace(/\D/g, ''),
      }),
    onSuccess: ({ data }) => {
      router.push({
        pathname: '/(auth)/otp',
        params: {
          mode:    'login',
          cpf,
          phone,
          cnpj,
          devCode: data.codigo ?? '',
        },
      });
    },
    onError: (err: any) => {
      Alert.alert('Erro', err.response?.data?.erro ?? 'Não foi possível enviar o código.');
    },
  });

  function handleCredentialsSubmit() {
    if (!isValidCpf(cpf)) {
      Alert.alert('CPF inválido', 'Verifique o CPF informado.');
      return;
    }
    if (cnpj.replace(/\D/g, '').length < 14) {
      Alert.alert('CNPJ inválido', 'Informe o CNPJ do posto.');
      return;
    }
    setStep('phone');
  }

  function handlePhoneSubmit() {
    if (phone.replace(/\D/g, '').length < 10) {
      Alert.alert('Telefone inválido', 'Informe seu número de celular.');
      return;
    }
    checkAndSendOtp();
  }

  return (
    <SafeAreaView className="flex-1 bg-primary-700">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View className="items-center justify-center pt-16 pb-10 px-6">
            <Text className="text-5xl mb-3">⛽</Text>
            <Text className="text-white text-3xl font-bold">PostoCash</Text>
            <Text className="text-white/60 text-sm mt-1">Seu cashback no posto de gasolina</Text>
          </View>

          {/* Card */}
          <View className="flex-1 bg-slate-50 rounded-t-3xl px-6 pt-8 pb-6">

            {step === 'credentials' ? (
              <>
                <Text className="text-primary-700 text-2xl font-bold mb-1">Entrar</Text>
                <Text className="text-slate-500 text-sm mb-6">
                  Acesse sua conta com CPF e o CNPJ do posto.
                </Text>

                <Input
                  label="CPF"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChangeText={(t) => setCpf(maskCpfInput(t))}
                  keyboardType="number-pad"
                  maxLength={14}
                  autoComplete="off"
                />

                <Input
                  label="CNPJ do posto"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChangeText={(t) => setCnpj(maskCnpj(t))}
                  keyboardType="number-pad"
                  maxLength={18}
                  hint="Peça ao atendente ou procure na fachada do posto"
                />

                <Button
                  title="Continuar"
                  fullWidth
                  onPress={handleCredentialsSubmit}
                  className="mt-2"
                />
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setStep('credentials')}
                  className="flex-row items-center gap-1 mb-4"
                >
                  <Text className="text-primary-600 text-sm font-semibold">← Voltar</Text>
                </TouchableOpacity>

                <Text className="text-primary-700 text-2xl font-bold mb-1">Verificação</Text>
                <Text className="text-slate-500 text-sm mb-6">
                  Informe seu celular para receber o código de verificação.
                </Text>

                <Input
                  label="Celular"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChangeText={(t) => setPhone(maskPhone(t))}
                  keyboardType="phone-pad"
                  maxLength={15}
                  hint="Deve ser o mesmo número cadastrado na sua conta"
                />

                <Button
                  title="Enviar código"
                  fullWidth
                  loading={isSending}
                  onPress={handlePhoneSubmit}
                  className="mt-2"
                />
              </>
            )}

            <View className="flex-row items-center justify-center mt-6 gap-1">
              <Text className="text-slate-500 text-sm">Não tem conta?</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text className="text-primary-700 text-sm font-bold"> Cadastre-se</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/recovery')}
              className="flex-row items-center justify-center mt-3 gap-1"
            >
              <Text className="text-slate-400 text-xs">Reinstalou o app?</Text>
              <Text className="text-primary-500 text-xs font-semibold"> Recuperar acesso</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
