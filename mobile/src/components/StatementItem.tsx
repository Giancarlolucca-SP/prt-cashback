import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface StatementEntry {
  id: string;
  tipo: 'credito' | 'debito';
  descricao: string;
  valor: number;
  valorFormatado: string;
  data: string;
  dataISO: string;
}

interface Props {
  item: StatementEntry;
}

export default function StatementItem({ item }: Props) {
  const isCredit = item.tipo === 'credito';
  return (
    <View className="flex-row items-center gap-3 bg-white rounded-xl px-4 py-3.5 mb-2 shadow-sm border border-slate-100">
      {/* Icon */}
      <View
        className={`w-10 h-10 rounded-full items-center justify-center ${
          isCredit ? 'bg-green-100' : 'bg-red-100'
        }`}
      >
        <Ionicons
          name={isCredit ? 'arrow-down' : 'arrow-up'}
          size={18}
          color={isCredit ? '#16a34a' : '#dc2626'}
        />
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text className="text-slate-800 text-sm font-semibold">{item.descricao}</Text>
        <Text className="text-slate-400 text-xs mt-0.5">{item.data}</Text>
      </View>

      {/* Amount */}
      <Text
        className={`text-base font-bold ${isCredit ? 'text-green-600' : 'text-red-500'}`}
      >
        {isCredit ? '+' : '-'}{item.valorFormatado}
      </Text>
    </View>
  );
}
