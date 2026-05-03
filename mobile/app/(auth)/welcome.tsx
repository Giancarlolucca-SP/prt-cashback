import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppConfig } from '../../src/context/AppConfigContext';

export default function WelcomeScreen() {
  const { config } = useAppConfig();

  return (
    <SafeAreaView className="flex-1 bg-primary-700">
      {/* Hero */}
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-7xl mb-6">⛽</Text>

        <Text className="text-white text-3xl font-bold text-center mb-2">
          Bem-vindo ao{'\n'}{config.postoName}!
        </Text>
        <Text className="text-white/60 text-base text-center leading-6 mt-2">
          Ganhe cashback a cada abastecimento.{'\n'}
          Sem cartões. Sem complicação.
        </Text>
      </View>

      {/* Actions */}
      <View className="px-8 pb-10 gap-3">
        <TouchableOpacity
          onPress={() => router.push('/(auth)/register')}
          className="bg-white py-4 rounded-2xl items-center"
          activeOpacity={0.85}
        >
          <Text className="text-primary-700 text-base font-bold">Criar minha conta</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          className="bg-white/10 py-4 rounded-2xl items-center border border-white/20"
          activeOpacity={0.8}
        >
          <Text className="text-white text-base font-semibold">Já tenho conta</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/recovery')}
          className="items-center py-2"
          activeOpacity={0.7}
        >
          <Text className="text-white/40 text-xs">Reinstalou o app? Recuperar acesso</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
