import React, { useState } from 'react';
import {
  View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import BrandLogo from '../../src/components/BrandLogo';
import { authApi } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { maskCpfInput, isValidCpf, stripCpf, maskCnpj, maskPhone } from '../../src/utils/formatters';
import { useBranding } from '../../src/hooks/useBranding';

type Step = 'credentials' | 'phone';

export default function LoginScreen() {
  const [step,  setStep]  = useState<Step>('credentials');
  const [cpf,   setCpf]   = useState('');
  const [cnpj,  setCnpj]  = useState('');
  const [phone, setPhone] = useState('');
  const setAuth  = useAuthStore((s) => s.setAuth);
  const { primaryColor, tagline } = useBranding();

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
    <SafeAreaView style={{ flex: 1, backgroundColor: primaryColor }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 48, paddingBottom: 32, paddingHorizontal: 24 }}>
            <BrandLogo size="lg" variant="white" />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 6 }}>{tagline}</Text>
          </View>

          {/* Card */}
          <View style={{ flex: 1, backgroundColor: '#f8fafc', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 }}>

            {step === 'credentials' ? (
              <>
                <Text style={{ color: '#1e293b', fontSize: 22, fontWeight: '700', marginBottom: 4 }}>Entrar</Text>
                <Text style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
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
                  style={{ marginTop: 8, backgroundColor: primaryColor }}
                />
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setStep('credentials')}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}
                >
                  <Text style={{ color: primaryColor, fontSize: 14, fontWeight: '600' }}>← Voltar</Text>
                </TouchableOpacity>

                <Text style={{ color: '#1e293b', fontSize: 22, fontWeight: '700', marginBottom: 4 }}>Verificação</Text>
                <Text style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
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
                  style={{ marginTop: 8, backgroundColor: primaryColor }}
                />
              </>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 4 }}>
              <Text style={{ color: '#64748b', fontSize: 14 }}>Não tem conta?</Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                <Text style={{ color: primaryColor, fontSize: 14, fontWeight: '700' }}> Cadastre-se</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/recovery')}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 4 }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>Reinstalou o app?</Text>
              <Text style={{ color: primaryColor, fontSize: 12, fontWeight: '600' }}> Recuperar acesso</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
