import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import { maskCpfInput, isValidCpf, maskPhone } from '../../src/utils/formatters';
import { useAppConfig } from '../../src/context/AppConfigContext';
import { useBranding } from '../../src/hooks/useBranding';
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
  const { primaryColor } = useBranding();

  const [nome,  setNome]  = useState('');
  const [cpf,   setCpf]   = useState('');
  const [phone, setPhone] = useState('');

  const [touchedCpf,   setTouchedCpf]   = useState(false);
  const [touchedPhone, setTouchedPhone] = useState(false);

  const [preselected,        setPreselected]        = useState<EstablishmentPreview | null>(null);
  const [loadingPreselected, setLoadingPreselected] = useState(true);

  useEffect(() => {
    async function checkPreselected() {
      try {
        const id = await SecureStore.getItemAsync(PRESELECTED_EST_KEY);
        if (!id) return;
        const { data } = await api.get<EstablishmentPreview>(`/app/establishment/${id}/qrcode-data`);
        setPreselected(data);
      } catch {
        // No pre-selected establishment or network error
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ paddingHorizontal: 24, paddingTop: 24 }}
        >
          <Text style={{ color: primaryColor, fontSize: 22, fontWeight: '700', marginBottom: 4 }}>Criar conta</Text>
          <Text style={{ color: '#64748b', fontSize: 14, marginBottom: 24, lineHeight: 20 }}>
            Preencha seus dados para começar a acumular cashback no posto.
          </Text>

          {/* Pre-selected establishment card (from QR Code deep link) */}
          {!loadingPreselected && preselected && (
            <View style={{
              marginBottom: 20, backgroundColor: '#eff6ff',
              borderWidth: 1, borderColor: '#bfdbfe',
              borderRadius: 16, padding: 16,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                {preselected.logoUrl ? (
                  <Image
                    source={{ uri: preselected.logoUrl }}
                    style={{ width: 40, height: 40, borderRadius: 8, resizeMode: 'contain' }}
                  />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20 }}>⛽</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                    Posto selecionado
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e3a8a' }}>{preselected.name}</Text>
                  {preselected.city ? (
                    <Text style={{ fontSize: 13, color: '#1d4ed8', marginTop: 1 }}>{preselected.city}</Text>
                  ) : null}
                </View>
              </View>
              <Text style={{ fontSize: 13, color: '#1d4ed8' }}>
                Cashback: <Text style={{ fontWeight: '700' }}>{preselected.cashbackPercent}%</Text> por abastecimento
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
            style={{ marginTop: 24, marginBottom: 40, backgroundColor: isFormValid ? primaryColor : undefined }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
