import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { maskName } from '../utils/formatters';

interface BalanceCardProps {
  saldo: number;
  saldoFormatado: string;
  nome: string;
  establishmentName?: string | null;
  loading?: boolean;
  onRefresh?: () => void;
}

export default function BalanceCard({
  saldo,
  saldoFormatado,
  nome,
  establishmentName,
  loading = false,
  onRefresh,
}: BalanceCardProps) {
  return (
    <View className="bg-primary-700 rounded-2xl p-5 mx-4 shadow-lg">
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-3">
        <View>
          <Text className="text-white/60 text-xs font-medium uppercase tracking-wide">
            Saldo disponível
          </Text>
          {establishmentName && (
            <Text className="text-white/50 text-xs mt-0.5">{establishmentName}</Text>
          )}
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#F59E0B" size="small" />
          ) : (
            <Ionicons name="refresh-outline" size={20} color="rgba(255,255,255,0.6)" />
          )}
        </TouchableOpacity>
      </View>

      {/* Balance */}
      <Text className="text-white text-3xl font-bold tracking-tight mb-1">
        {saldoFormatado}
      </Text>
      <Text className="text-white/50 text-sm">{maskName(nome)}</Text>

      {/* Divider */}
      <View className="border-t border-white/10 mt-4 pt-4">
        <View className="flex-row items-center gap-1.5">
          <View
            className={`w-2 h-2 rounded-full ${saldo > 0 ? 'bg-green-400' : 'bg-slate-400'}`}
          />
          <Text className="text-white/60 text-xs">
            {saldo > 0 ? 'Saldo disponível para resgate' : 'Nenhum saldo no momento'}
          </Text>
        </View>
      </View>
    </View>
  );
}
