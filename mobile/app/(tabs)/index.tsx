import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BalanceCard from '../../src/components/BalanceCard';
import StatementItem, { StatementEntry } from '../../src/components/StatementItem';
import { customerApi } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';

const BALANCE_CACHE_KEY = 'postocash_balance_cache';

interface BalanceCache {
  saldo:           number;
  saldoFormatado:  string;
  nome:            string;
  cachedAt:        string; // ISO date
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, establishmentName, logout } = useAuthStore();
  const [cachedBalance, setCachedBalance] = useState<BalanceCache | null>(null);

  // Load cached balance immediately on mount
  useEffect(() => {
    AsyncStorage.getItem(BALANCE_CACHE_KEY).then((raw) => {
      if (raw) {
        try { setCachedBalance(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  // Balance (always fresh)
  const { data: balanceData, isFetching, refetch } = useQuery({
    queryKey: ['balance'],
    queryFn: () => customerApi.getBalance().then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Persist fresh balance to cache
  useEffect(() => {
    if (!balanceData) return;
    const entry: BalanceCache = {
      saldo:          balanceData.saldo,
      saldoFormatado: balanceData.saldoFormatado,
      nome:           balanceData.nome,
      cachedAt:       new Date().toISOString(),
    };
    AsyncStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify(entry));
    setCachedBalance(entry);
  }, [balanceData]);

  // Recent statement (last 5 entries)
  const { data: stmtData } = useQuery({
    queryKey: ['statement', 1],
    queryFn: () => customerApi.getStatement(1).then((r) => r.data),
  });

  function handleLogout() {
    Alert.alert('Sair', 'Deseja sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
          queryClient.clear();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  const balance = balanceData ?? cachedBalance ?? {
    saldo: user?.saldo ?? 0,
    saldoFormatado: user?.saldoFormatado ?? 'R$ 0,00',
    nome: user?.nome ?? '—',
  };

  const lastUpdated = cachedBalance?.cachedAt
    ? new Date(cachedBalance.cachedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const recentEntries = stmtData?.entradas?.slice(0, 5) ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Greeting */}
        <View className="bg-primary-700 px-5 pb-4 pt-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-white/60 text-xs">Bem-vindo de volta</Text>
              <Text className="text-white text-lg font-bold">
                {user?.nome?.split(' ')[0] ?? 'Cliente'} 👋
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleLogout}
              className="w-9 h-9 rounded-full bg-white/10 items-center justify-center"
            >
              <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance card */}
        <View className="mt-4">
          <BalanceCard
            saldo={balance.saldo}
            saldoFormatado={balance.saldoFormatado}
            nome={balance.nome}
            establishmentName={establishmentName}
            loading={isFetching}
            onRefresh={refetch}
          />
          {lastUpdated && !isFetching && (
            <View className="flex-row items-center justify-center gap-1 mt-1 mb-1">
              <Ionicons name="time-outline" size={11} color="#94a3b8" />
              <Text className="text-slate-400 text-xs">Última atualização: {lastUpdated}</Text>
            </View>
          )}
        </View>

        {/* Quick actions */}
        <View className="px-4 mt-5" style={{ marginBottom: 200 }}>
          <View className="flex-row gap-3 mb-3">
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/resgatar')}
              className="flex-1 bg-white rounded-2xl p-4 items-center shadow-sm border border-slate-100"
            >
              <View className="w-12 h-12 rounded-full bg-accent-50 items-center justify-center mb-2">
                <Ionicons name="qr-code" size={24} color="#D97706" />
              </View>
              <Text className="text-accent-600 text-sm font-bold">Resgatar</Text>
              <Text className="text-slate-400 text-xs mt-0.5 text-center">Usar seu cashback</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/(tabs)/historico')}
              className="flex-1 bg-white rounded-2xl p-4 items-center shadow-sm border border-slate-100"
            >
              <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center mb-2">
                <Ionicons name="receipt-outline" size={24} color="#1d4ed8" />
              </View>
              <Text className="text-blue-700 text-sm font-bold">Histórico</Text>
              <Text className="text-slate-400 text-xs mt-0.5 text-center">Suas movimentações</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/validar')}
              className="flex-1 bg-white rounded-2xl p-4 items-center shadow-sm border border-slate-100"
            >
              <View className="w-12 h-12 rounded-full bg-green-50 items-center justify-center mb-2">
                <Ionicons name="scan" size={24} color="#16a34a" />
              </View>
              <Text className="text-green-700 text-sm font-bold">Validar</Text>
              <Text className="text-slate-400 text-xs mt-0.5 text-center">Ler QR do cliente</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/(tabs)/configuracoes')}
              className="flex-1 bg-white rounded-2xl p-4 items-center shadow-sm border border-slate-100"
            >
              <View className="w-12 h-12 rounded-full bg-slate-100 items-center justify-center mb-2">
                <Ionicons name="settings-outline" size={24} color="#64748b" />
              </View>
              <Text
                className="text-slate-600 font-bold text-center"
                style={{ fontSize: 11 }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Configurações
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5 text-center">Conta e app</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent activity */}
        <View className="px-4 mt-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-slate-700 text-base font-bold">Atividade recente</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/historico')}>
              <Text className="text-primary-600 text-sm font-semibold">Ver tudo</Text>
            </TouchableOpacity>
          </View>

          {recentEntries.length === 0 ? (
            <View className="bg-white rounded-2xl p-8 items-center border border-slate-100">
              <Text className="text-3xl mb-2">📋</Text>
              <Text className="text-slate-500 text-sm text-center">
                Nenhuma movimentação ainda.{'\n'}Abasteça para começar!
              </Text>
            </View>
          ) : (
            recentEntries.map((item: StatementEntry) => (
              <StatementItem key={item.id} item={item} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
