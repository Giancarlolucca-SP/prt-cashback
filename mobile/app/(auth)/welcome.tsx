import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { useAppConfig } from '../../src/context/AppConfigContext';

const LOGO_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="rgba(255,255,255,0.15)"/>
  <rect x="18" y="28" width="38" height="48" rx="5" fill="white" opacity="0.9"/>
  <rect x="22" y="22" width="30" height="12" rx="4" fill="white" opacity="0.9"/>
  <rect x="22" y="34" width="30" height="18" rx="2" fill="#fff7ed"/>
  <rect x="25" y="38" width="14" height="2" rx="1" fill="#FF6B00"/>
  <rect x="25" y="42" width="10" height="2" rx="1" fill="#FF6B00" opacity="0.5"/>
  <rect x="25" y="46" width="12" height="2" rx="1" fill="#FF6B00" opacity="0.3"/>
  <rect x="18" y="71" width="38" height="5" rx="2.5" fill="white" opacity="0.5"/>
  <path d="M56 34 Q68 34 68 46 Q68 60 62 62" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="58" y="59" width="8" height="5" rx="2" fill="rgba(255,255,255,0.5)"/>
  <circle cx="65" cy="72" r="20" fill="white" stroke="#FF6B00" stroke-width="2"/>
  <circle cx="65" cy="72" r="16" fill="#FF6B00"/>
  <text x="65" y="79" text-anchor="middle" fill="white" font-size="14" font-weight="900" font-family="system-ui">$</text>
</svg>`;

export default function WelcomeScreen() {
  const { config } = useAppConfig();

  return (
    <SafeAreaView className="flex-1 bg-primary-700">
      {/* Hero */}
      <View className="flex-1 items-center justify-center px-8">
        <SvgXml xml={LOGO_ICON_SVG} width={96} height={96} style={{ marginBottom: 24 }} />

        <Text className="text-white text-3xl font-bold text-center mb-2">
          Bem-vindo ao PostoCash!
        </Text>
        <Text className="text-white/60 text-base text-center leading-6 mt-2">
          Seu programa de cashback inteligente
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
