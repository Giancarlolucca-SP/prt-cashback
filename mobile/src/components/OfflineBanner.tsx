import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../context/NetworkContext';

export default function OfflineBanner() {
  const { isOnline } = useNetwork();
  const translateY   = useRef(new Animated.Value(-60)).current;
  const opacity      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue:        isOnline ? -60 : 0,
        useNativeDriver: true,
        tension:         80,
        friction:        12,
      }),
      Animated.timing(opacity, {
        toValue:        isOnline ? 0 : 1,
        duration:       250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOnline]);

  return (
    <Animated.View
      style={{ transform: [{ translateY }], opacity }}
      className="absolute top-0 left-0 right-0 z-50 bg-red-500 flex-row items-center justify-center gap-2 py-2.5 px-4"
      pointerEvents="none"
    >
      <Ionicons name="wifi-outline" size={14} color="white" />
      <Text className="text-white text-xs font-semibold">
        Você está sem internet. Algumas funções podem não estar disponíveis.
      </Text>
    </Animated.View>
  );
}
