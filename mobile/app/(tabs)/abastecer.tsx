import React, { useState } from 'react';
import {
  View, Text, ScrollView, Alert, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';

import * as Haptics from 'expo-haptics';
import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import { customerApi } from '../../src/api/client';
import { formatBRL } from '../../src/utils/formatters';

const FUEL_TYPES = [
  { key: 'gasoline',         label: 'Gasolina',       icon: '🟡' },
  { key: 'ethanol',          label: 'Etanol',          icon: '🟢' },
  { key: 'diesel',           label: 'Diesel',          icon: '🔵' },
  { key: 'gnv',              label: 'GNV',             icon: '⚪' },
  { key: 'carWash',          label: 'Lavagem',         icon: '🚿' },
  { key: 'convenienceStore', label: 'Conveniência',    icon: '🛒' },
];

interface TransactionResult {
  transacao: {
    cashbackGerado:     string;
    percentualCashback: string;
    novoSaldo:          string;
    codigoCupom:        string;
  };
}

export default function AbastecerScreen() {
  const queryClient = useQueryClient();

  const [fuelType, setFuelType]   = useState('gasoline');
  const [amount,   setAmount]     = useState('');
  const [liters,   setLiters]     = useState('');
  const [result,   setResult]     = useState<TransactionResult | null>(null);

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () =>
      customerApi.recordTransaction({
        amount:    parseFloat(amount.replace(',', '.')),
        fuelType,
        liters:    liters ? parseFloat(liters.replace(',', '.')) : undefined,
      }),
    onSuccess: ({ data }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['statement'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      setAmount('');
      setLiters('');
    },
    onError: (err: any) => {
      Alert.alert('Erro', err.response?.data?.erro ?? 'Não foi possível registrar o abastecimento.');
    },
  });

  async function handleSubmit() {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor do abastecimento.');
      return;
    }

    // Biometric confirmation for transactions
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (compatible) {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (enrolled) {
        const bio = await LocalAuthentication.authenticateAsync({
          promptMessage: `Confirmar abastecimento de ${formatBRL(parsed)}`,
          cancelLabel:   'Cancelar',
        });
        if (!bio.success) return;
      }
    }

    submit();
  }

  if (result) {
    const t = result.transacao;
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
        <View className="flex-1 items-center justify-center px-6">
          <View className="bg-white rounded-3xl p-8 w-full items-center shadow-sm border border-slate-100">
            <View className="w-20 h-20 rounded-full bg-green-100 items-center justify-center mb-4">
              <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
            </View>
            <Text className="text-slate-800 text-xl font-bold mb-1">Abastecimento registrado!</Text>
            <Text className="text-slate-500 text-sm mb-6 text-center">
              Seu cashback foi creditado com sucesso.
            </Text>

            <View className="w-full bg-slate-50 rounded-2xl p-4 gap-3">
              <Row label="Cashback gerado"  value={t.cashbackGerado}     highlight />
              <Row label="Percentual"        value={t.percentualCashback} />
              <Row label="Novo saldo"        value={t.novoSaldo}          />
              <Row label="Cupom"             value={t.codigoCupom}        mono />
            </View>

            <Button
              title="Novo abastecimento"
              fullWidth
              variant="secondary"
              onPress={() => setResult(null)}
              className="mt-6"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1 px-4 pt-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Fuel type selector */}
          <Text className="text-slate-700 text-sm font-semibold mb-3">
            Tipo de combustível / serviço
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-5">
            {FUEL_TYPES.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFuelType(f.key)}
                className={[
                  'flex-row items-center gap-1.5 px-3 py-2 rounded-xl border',
                  fuelType === f.key
                    ? 'bg-primary-700 border-primary-700'
                    : 'bg-white border-slate-200',
                ].join(' ')}
              >
                <Text className="text-base">{f.icon}</Text>
                <Text
                  className={`text-sm font-semibold ${
                    fuelType === f.key ? 'text-white' : 'text-slate-600'
                  }`}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Amount */}
          <Input
            label="Valor pago (R$)"
            placeholder="0,00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            prefix="R$"
            hint="Valor total que você pagou no abastecimento ou serviço"
          />

          {/* Liters (optional, only for fuel types) */}
          {['gasoline', 'ethanol', 'diesel', 'gnv'].includes(fuelType) && (
            <Input
              label="Litros abastecidos (opcional)"
              placeholder="0,000"
              value={liters}
              onChangeText={setLiters}
              keyboardType="decimal-pad"
              suffix="L"
              hint="Informe para cálculo mais preciso no modo centavos/litro"
            />
          )}

          <Button
            title="Registrar e ganhar cashback"
            fullWidth
            loading={isPending}
            onPress={handleSubmit}
            className="mt-2 mb-8"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({
  label, value, highlight = false, mono = false,
}: {
  label: string; value: string; highlight?: boolean; mono?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-slate-500 text-sm">{label}</Text>
      <Text
        className={[
          'text-sm font-semibold',
          highlight ? 'text-green-600 text-base' : 'text-slate-700',
          mono ? 'font-mono tracking-wider' : '',
        ].join(' ')}
      >
        {value}
      </Text>
    </View>
  );
}
