import React, { useState } from 'react';
import {
  View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import { authApi } from '../../src/api/client';
import { maskCpfInput, isValidCpf, stripCpf, maskCnpj } from '../../src/utils/formatters';

export default function RecoveryScreen() {
  const [cpf,  setCpf]  = useState('');
  const [cnpj, setCnpj] = useState('');

  const { mutate: lookup, isPending } = useMutation({
    mutationFn: () =>
      authApi.recoveryLookup({
        cpf:              stripCpf(cpf),
        establishmentCnpj: cnpj.replace(/\D/g, ''),
      }),
    onSuccess: ({ data }) => {
      // data.telefoneRaw is the actual phone — used to send OTP
      // data.telefoneMascarado is shown to the user for confirmation
      Alert.alert(
        'Número encontrado',
        `Enviaremos um código para ${data.telefoneMascarado}`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Enviar código',
            onPress: () => sendOtp(data.telefoneRaw),
          },
        ],
      );
    },
    onError: (err: any) => {
      Alert.alert('Conta não encontrada', err.response?.data?.erro ?? 'Verifique o CPF e o CNPJ do posto.');
    },
  });

  const { mutate: sendOtp, isPending: isSending } = useMutation({
    mutationFn: (phone: string) =>
      authApi.sendOtp({
        phone,
        establishmentCnpj: cnpj.replace(/\D/g, ''),
      }),
    onSuccess: ({ data }, phone) => {
      router.push({
        pathname: '/(auth)/otp',
        params: {
          mode:    'recovery',
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

  function handleSubmit() {
    if (!isValidCpf(cpf)) {
      Alert.alert('CPF inválido', 'Verifique o CPF informado.');
      return;
    }
    if (cnpj.replace(/\D/g, '').length < 14) {
      Alert.alert('CNPJ inválido', 'Informe o CNPJ do posto.');
      return;
    }
    lookup();
  }

  const loading = isPending || isSending;

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
          {/* Header */}
          <View className="items-center mb-8 mt-2">
            <View className="w-20 h-20 rounded-full bg-amber-50 items-center justify-center mb-4">
              <Ionicons name="shield-outline" size={36} color="#D97706" />
            </View>
            <Text className="text-primary-700 text-2xl font-bold text-center">
              Recuperar acesso
            </Text>
            <Text className="text-slate-500 text-sm mt-2 text-center leading-5">
              Informe seu CPF e o posto para verificar{'\n'}sua identidade e restaurar o acesso.
            </Text>
          </View>

          <Input
            label="CPF"
            placeholder="000.000.000-00"
            value={cpf}
            onChangeText={(t) => setCpf(maskCpfInput(t))}
            keyboardType="number-pad"
            maxLength={14}
          />

          <Input
            label="CNPJ do posto"
            placeholder="00.000.000/0000-00"
            value={cnpj}
            onChangeText={(t) => setCnpj(maskCnpj(t))}
            keyboardType="number-pad"
            maxLength={18}
            hint="Mesmo posto onde você se cadastrou"
          />

          <Button
            title="Verificar minha conta"
            fullWidth
            loading={loading}
            onPress={handleSubmit}
            className="mt-2"
          />

          {/* Info box */}
          <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-6">
            <View className="flex-row items-start gap-2">
              <Ionicons name="information-circle-outline" size={16} color="#D97706" />
              <Text className="text-amber-700 text-xs leading-4 flex-1">
                Você receberá um SMS no celular cadastrado. Em seguida será necessário tirar uma selfie para confirmar sua identidade.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.back()}
            className="flex-row items-center justify-center gap-1 mt-6"
          >
            <Ionicons name="arrow-back" size={14} color="#64748b" />
            <Text className="text-slate-500 text-sm">Voltar para o login</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
