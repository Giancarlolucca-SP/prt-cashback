import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function SuccessScreen() {
  const { nome } = useLocalSearchParams<{ nome: string }>();

  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.spring(scale, {
        toValue:         1,
        tension:         60,
        friction:        6,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue:         1,
        duration:        300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const firstName = (nome ?? '').trim().split(' ')[0] || 'você';

  return (
    <SafeAreaView className="flex-1 bg-primary-700 items-center justify-center px-8">
      {/* Checkmark circle */}
      <Animated.View
        style={{ transform: [{ scale }] }}
        className="w-28 h-28 rounded-full bg-green-500 items-center justify-center mb-8"
      >
        <Ionicons name="checkmark" size={64} color="#ffffff" />
      </Animated.View>

      <Animated.View style={{ opacity }} className="items-center">
        <Text className="text-white text-3xl font-bold text-center mb-3">
          Cadastro realizado!
        </Text>
        <Text className="text-white/70 text-base text-center leading-6">
          Bem-vindo ao programa de cashback,{'\n'}
          <Text className="text-white font-semibold">{firstName}</Text>!{'\n'}
          A partir de agora você acumula cashback{'\n'}
          em cada abastecimento.
        </Text>

        <TouchableOpacity
          onPress={() => router.replace('/(tabs)')}
          className="mt-10 bg-white px-10 py-4 rounded-2xl"
          activeOpacity={0.85}
        >
          <Text className="text-primary-700 text-base font-bold">Ir para meu saldo</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}
