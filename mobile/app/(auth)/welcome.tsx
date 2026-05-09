import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBranding } from '../../src/hooks/useBranding';
import BrandLogo from '../../src/components/BrandLogo';

export default function WelcomeScreen() {
  const { primaryColor, tagline, appName } = useBranding();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: primaryColor }}>
      {/* Hero */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View style={{
          width: 100, height: 100, borderRadius: 50,
          backgroundColor: 'rgba(255,255,255,0.2)',
          alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        }}>
          <BrandLogo size="md" variant="white" />
        </View>

        <Text style={{ color: 'white', fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
          Bem-vindo ao {appName}!
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, textAlign: 'center', lineHeight: 24, marginTop: 8 }}>
          {tagline}
        </Text>
      </View>

      {/* Actions */}
      <View style={{ paddingHorizontal: 32, paddingBottom: 40, gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/(auth)/register')}
          style={{ backgroundColor: 'white', paddingVertical: 16, borderRadius: 16, alignItems: 'center' }}
          activeOpacity={0.85}
        >
          <Text style={{ color: primaryColor, fontSize: 16, fontWeight: '700' }}>Criar minha conta</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            paddingVertical: 16, borderRadius: 16, alignItems: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
          }}
          activeOpacity={0.8}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Já tenho conta</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/recovery')}
          style={{ alignItems: 'center', paddingVertical: 8 }}
          activeOpacity={0.7}
        >
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Reinstalou o app? Recuperar acesso</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
