import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import { maskCpfInput, isValidCpf, maskPhone } from '../../src/utils/formatters';
import { useAppConfig } from '../../src/context/AppConfigContext';
import { api } from '../../src/api/client';

const PRESELECTED_EST_KEY = 'postocash_preselected_establishment';

interface EstablishmentPreview {
  establishmentId: string;
  name: string;
  city: string | null;
  cashbackPercent: number;
  logoUrl: string | null;
}

function isValidPhone(masked: string): boolean {
  return masked.replace(/\D/g, '').length === 11;
}

function cpfError(cpf: string, touched: boolean): string | undefined {
  if (!touched || !cpf) return undefined;
  if (!isValidCpf(cpf)) return 'CPF inválido. Verifique os dígitos.';
}

function phoneError(phone: string, touched: boolean): string | undefined {
  if (!touched || !phone) return undefined;
  if (!isValidPhone(phone)) return 'Celular incompleto. Use o formato (00) 00000-0000.';
}

export default function RegisterScreen() {
  const { config } = useAppConfig();

  const [nome,  setNome]  = useState('');
  const [cpf,   setCpf]   = useState('');
  const [phone, setPhone] = useState('');

  const [touchedCpf,   setTouchedCpf]   = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);

  const [preselected,        setPreselected]        = useState<EstablishmentPreview | null>(null);
  const [loadingPreselected, setLoadingPreselected] = useState(true);

  // Check SecureStore for pre-selected establishment from deep link
  useEffect(() => {
    async function checkPreselected() {
      try {
        const id = await SecureStore.getItemAsync(PRESELECTED_EST_KEY);
        if (!id) return;

        const { data } = await api.get<EstablishmentPreview>(`/app/establishment/${id}/qrcode-data`);
        setPreselected(data);
      } catch {
        // No pre-selected establishment or network error — fall back to config.cnpj
      } finally {
        setLoadingPreselected(false);
      }
    }
    checkPreselected();
  }, []);

  const isFormValid =
    nome.trim().length >= 3 &&
    isValidCpf(cpf) &&
    isValidPhone(phone);

  function handleSubmit() {
    setTouchedCpf(true);
    setTouchedPhone(true);

    if (!nome.trim() || nome.trim().length < 3) {
      Alert.alert('Nome inválido', 'Informe seu nome completo (mínimo 3 caracteres).');
      return;
    }
    if (!isValidCpf(cpf)) {
      Alert.alert('CPF inválido', 'Verifique o CPF informado.');
      return;
    }
    if (!isValidPhone(phone)) {
      Alert.alert('Celular inválido', 'Informe um número de celular válido com DDD.');
      return;
    }

    // findEstablishment() on the backend accepts both UUID and CNPJ in the same field
    const cnpj = preselected?.establishmentId ?? config.cnpj ?? '';

    router.push({
      pathname: '/(auth)/selfie',
      params: {
        mode:  'register',
        nome:  nome.trim(),
        cpf,
        phone,
        cnpj,
      },
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          className="px-6 pt-6"
        >
          <Text className="text-primary-700 text-2xl font-bold mb-1">Criar conta</Text>
          <Text className="text-slate-500 text-sm mb-6 leading-5">
            Preencha seus dados para começar a acumular cashback no posto.
          </Text>

          {/* Pre-selected establishment card (from QR Code deep link) */}
          {!loadingPreselected && preselected && (
            <View className="mb-5 bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <Text className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">
                Posto selecionado
              </Text>
              <Text className="text-base font-bold text-blue-900">{preselected.name}</Text>
              {preselected.city ? (
                <Text className="text-sm text-blue-700 mt-0.5">{preselected.city}</Text>
              ) : null}
              <Text className="text-sm text-blue-700 mt-1">
                Cashback:{' '}
                <Text className="font-bold">{preselected.cashbackPercent}%</Text> por abastecimento
              </Text>
            </View>
          )}

          <Input
            label="Nome completo"
            placeholder="João da Silva"
            value={nome}
            onChangeText={setNome}
            autoCapitalize="words"
            autoComplete="name"
            error={
              nome.length > 0 && nome.trim().length < 3
                ? 'Nome muito curto (mínimo 3 caracteres).'
                : undefined
            }
          />

          <Input
            label="CPF"
            placeholder="000.000.000-00"
            value={cpf}
            onChangeText={(t) => setCpf(maskCpfInput(t))}
            onBlur={() => setTouchedCpf(true)}
            keyboardType="number-pad"
            maxLength={14}
            error={cpfError(cpf, touchedCpf)}
          />

          <Input
            label="Celular"
            placeholder="(11) 99999-9999"
            value={phone}
            onChangeText={(t) => setPhone(maskPhone(t))}
            onBlur={() => setTouchedPhone(true)}
            keyboardType="phone-pad"
            maxLength={15}
            error={phoneError(phone, touchedPhone)}
          />

          <Button
            title="Continuar"
            fullWidth
            disabled={!isFormValid}
            onPress={handleSubmit}
            style={{ marginTop: 24, marginBottom: 40 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
