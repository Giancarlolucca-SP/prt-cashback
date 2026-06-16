import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, Alert, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Location from 'expo-location';

import * as Haptics from 'expo-haptics';
import Input from '../../src/components/ui/Input';
import Button from '../../src/components/ui/Button';
import { customerApi } from '../../src/api/client';
import { formatBRL } from '../../src/utils/formatters';

interface QRData {
  codigo:         string;
  qrData:         string;
  valor:          number;
  valorFormatado: string;
  expiresAt:      string;
  validoPor:      string;
  avisoGeo?:      string | null;
}

export default function ResgatarScreen() {
  const queryClient = useQueryClient();
  const [amount,     setAmount]     = useState('');
  const [qrResult,   setQrResult]   = useState<QRData | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [confirmed,  setConfirmed]  = useState<{ valorFormatado: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn:  () => customerApi.getBalance().then((r) => r.data),
  });

  const saldo          = balanceData?.saldo ?? 0;
  const saldoFormatado = balanceData?.saldoFormatado ?? 'R$ 0,00';

  // ── Get location (best-effort) ────────────────────────────────────────────────
  async function getLocationCoords() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch {
      return null;
    }
  }

  // ── Generate QR mutation ──────────────────────────────────────────────────────

  const { mutate: generate, isPending } = useMutation({
    mutationFn: async () => {
      const coords = await getLocationCoords();
      return customerApi.generateRedemption({
        amount: parseFloat(amount.replace(',', '.')),
        ...(coords ?? {}),
      });
    },
    onSuccess: ({ data }) => {
      // Show geo warning before displaying QR
      if (data.avisoGeo) {
        Alert.alert('Atenção', data.avisoGeo, [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar mesmo assim',
            onPress: () => activateQr(data),
          },
        ]);
      } else {
        activateQr(data);
      }
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
    onError: (err: any) => {
      Alert.alert('Erro', err.response?.data?.erro ?? 'Não foi possível gerar o código.');
    },
  });

  // ── Redemption request (caixa queue) ─────────────────────────────────────────

  const { mutate: requestRedeem, isPending: isRequesting } = useMutation({
    mutationFn: () =>
      customerApi.requestRedemption({ amount: parseFloat(amount.replace(',', '.')) }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRequesting(true);
    },
    onError: (err: any) => {
      Alert.alert('Erro', err.response?.data?.erro ?? 'Não foi possível enviar a solicitação.');
    },
  });

  // Poll the request status while waiting at the caixa
  const { data: reqStatus } = useQuery({
    queryKey: ['redeem-request'],
    queryFn:  () => customerApi.getRedemptionRequest().then((r) => r.data.solicitacao),
    enabled:  requesting,
    refetchInterval: requesting ? 4000 : false,
  });

  useEffect(() => {
    if (!requesting || !reqStatus) return;
    if (reqStatus.status === 'CONFIRMED') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRequesting(false);
      setConfirmed({ valorFormatado: reqStatus.valorFormatado });
      setAmount('');
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['statement'] });
    } else if (reqStatus.status === 'CANCELLED') {
      setRequesting(false);
      Alert.alert('Solicitação encerrada', 'O resgate foi recusado ou cancelado no caixa.');
    }
  }, [reqStatus, requesting, queryClient]);

  async function cancelRequest() {
    try { await customerApi.cancelRedemptionRequest(); } catch {}
    setRequesting(false);
  }

  function handleRequest() {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!amount || isNaN(parsed) || parsed <= 0) { Alert.alert('Valor inválido', 'Informe o valor a resgatar.'); return; }
    if (parsed > saldo) { Alert.alert('Saldo insuficiente', `Seu saldo é de ${saldoFormatado}.`); return; }
    requestRedeem();
  }

  function activateQr(data: QRData) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setQrResult(data);
    const exp = new Date(data.expiresAt).getTime();
    clearInterval(timerRef.current!);
    timerRef.current = setInterval(() => {
      const diff = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) {
        clearInterval(timerRef.current!);
        setQrResult(null);
        Alert.alert('Código expirado', 'O QR code expirou. Gere um novo código.');
      }
    }, 1000);
  }

  useEffect(() => () => clearInterval(timerRef.current!), []);

  function handleGenerate() {
    const parsed = parseFloat(amount.replace(',', '.'));
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor a resgatar.');
      return;
    }
    if (parsed > saldo) {
      Alert.alert('Saldo insuficiente', `Seu saldo é de ${saldoFormatado}.`);
      return;
    }
    generate();
  }

  function handleCancel() {
    clearInterval(timerRef.current!);
    setQrResult(null);
    setAmount('');
    queryClient.invalidateQueries({ queryKey: ['balance'] });
  }

  const mins        = Math.floor(secondsLeft / 60);
  const secs        = secondsLeft % 60;
  const countdown   = `${mins}:${String(secs).padStart(2, '0')}`;
  const urgentExpiry = secondsLeft < 60;

  // ── QR screen ─────────────────────────────────────────────────────────────────

  if (qrResult) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View className="flex-1 items-center px-6 pt-6 pb-8">

            <Text className="text-primary-700 text-xl font-bold mb-1">QR Code de resgate</Text>
            <Text className="text-slate-500 text-sm mb-6 text-center">
              Mostre este QR code ao atendente para resgatar seu cashback.
            </Text>

            <View className="bg-primary-700 px-6 py-3 rounded-2xl mb-6">
              <Text className="text-white/70 text-xs text-center mb-0.5">Valor a resgatar</Text>
              <Text className="text-white text-3xl font-bold text-center">
                {qrResult.valorFormatado}
              </Text>
            </View>

            <View className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-4">
              <QRCode
                value={qrResult.qrData}
                size={220}
                color="#1e3a5f"
                backgroundColor="white"
              />
            </View>

            <View className="bg-slate-100 rounded-xl px-5 py-2.5 mb-2">
              <Text className="text-slate-500 text-xs text-center mb-0.5">Código</Text>
              <Text className="text-primary-700 text-xl font-mono font-bold tracking-widest text-center">
                {qrResult.codigo}
              </Text>
            </View>

            <View className={`flex-row items-center gap-1.5 mb-6`}>
              <Ionicons
                name="time-outline"
                size={14}
                color={urgentExpiry ? '#ef4444' : '#94a3b8'}
              />
              <Text className={`text-sm font-semibold ${urgentExpiry ? 'text-red-500' : 'text-slate-400'}`}>
                Expira em {countdown}
              </Text>
            </View>

            <Button
              title="Cancelar e voltar"
              variant="ghost"
              fullWidth
              onPress={handleCancel}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Confirmed (caixa) ─────────────────────────────────────────────────────────

  if (confirmed) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-6" edges={['bottom']}>
        <View className="bg-white rounded-3xl p-8 w-full items-center shadow-sm border border-slate-100">
          <View className="w-20 h-20 rounded-full bg-green-100 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
          </View>
          <Text className="text-slate-800 text-xl font-bold mb-1">Resgate confirmado!</Text>
          <Text className="text-slate-500 text-sm mb-4 text-center">
            O frentista confirmou seu resgate de {confirmed.valorFormatado}.
          </Text>
          <Button title="Concluir" fullWidth variant="secondary" onPress={() => setConfirmed(null)} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Waiting at the caixa ──────────────────────────────────────────────────────

  if (requesting) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-6" edges={['bottom']}>
        <View className="bg-white rounded-3xl p-8 w-full items-center shadow-sm border border-slate-100">
          <View className="w-20 h-20 rounded-full bg-amber-100 items-center justify-center mb-4">
            <Ionicons name="hourglass-outline" size={44} color="#D97706" />
          </View>
          <Text className="text-slate-800 text-xl font-bold mb-1">Solicitação enviada ao caixa</Text>
          <Text className="text-slate-500 text-sm mb-4 text-center">
            Aguarde o frentista confirmar seu resgate de{' '}
            <Text className="font-bold text-slate-700">{formatBRL(parseFloat(amount.replace(',', '.')) || 0)}</Text>.
          </Text>
          <Button title="Cancelar solicitação" fullWidth variant="ghost" onPress={cancelRequest} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Input screen ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1 px-4 pt-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="bg-primary-700 rounded-2xl p-5 mb-6">
            <Text className="text-white/60 text-xs mb-1">Saldo disponível</Text>
            <Text className="text-white text-3xl font-bold">{saldoFormatado}</Text>
          </View>

          <Text className="text-slate-700 text-sm font-semibold mb-1">
            Quanto deseja resgatar?
          </Text>
          <Text className="text-slate-400 text-xs mb-4">
            Informe o valor e mostre o QR code ao atendente do posto.
          </Text>

          <Input
            label="Valor a resgatar (R$)"
            placeholder="0,00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            prefix="R$"
            hint={`Máximo: ${saldoFormatado}`}
          />

          <Button
            title="Gerar QR Code"
            fullWidth
            loading={isPending}
            disabled={saldo <= 0}
            onPress={handleGenerate}
            className="mt-2 mb-3"
          />

          <Button
            title="Solicitar no caixa (sem QR)"
            fullWidth
            variant="ghost"
            loading={isRequesting}
            disabled={saldo <= 0}
            onPress={handleRequest}
            className="mb-8"
          />

          {saldo <= 0 && (
            <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
              <Text className="text-amber-700 text-sm text-center font-medium">
                Você não tem saldo disponível para resgate.{'\n'}
                Abasteça para acumular cashback! ⛽
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
