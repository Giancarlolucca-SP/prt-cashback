import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  emoji:    string;
  title:    string;
  subtitle?: string;
  action?:  { label: string; onPress: () => void };
}

export function EmptyState({ emoji, title, subtitle, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text className="text-6xl mb-4">{emoji}</Text>
      <Text className="text-slate-700 text-base font-bold text-center mb-2">{title}</Text>
      {subtitle && (
        <Text className="text-slate-400 text-sm text-center leading-5">{subtitle}</Text>
      )}
      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          className="mt-6 bg-primary-700 px-6 py-3 rounded-xl"
        >
          <Text className="text-white text-sm font-semibold">{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface ErrorStateProps {
  type: 'network' | 'server' | 'session';
  onRetry?: () => void;
}

const ERROR_CONFIG = {
  network: {
    emoji: '📡',
    title: 'Sem conexão',
    subtitle: 'Verifique sua internet e tente novamente.',
    action:   'Tentar novamente',
  },
  server: {
    emoji: '🔄',
    title: 'Algo deu errado',
    subtitle: 'Ocorreu um erro no servidor. Tente novamente em instantes.',
    action:   'Tentar novamente',
  },
  session: {
    emoji: '🔒',
    title: 'Sessão expirada',
    subtitle: 'Confirme sua identidade para continuar.',
    action:   'Confirmar identidade',
  },
} as const;

export function ErrorState({ type, onRetry }: ErrorStateProps) {
  const cfg = ERROR_CONFIG[type];
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-6xl mb-4">{cfg.emoji}</Text>
      <Text className="text-slate-700 text-base font-bold text-center mb-2">{cfg.title}</Text>
      <Text className="text-slate-400 text-sm text-center leading-5 mb-6">{cfg.subtitle}</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          className="flex-row items-center gap-2 bg-primary-700 px-6 py-3 rounded-xl"
        >
          <Ionicons name="refresh-outline" size={16} color="white" />
          <Text className="text-white text-sm font-semibold">{cfg.action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
