import React, { useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Animated,
  useWindowDimensions, ListRenderItemInfo,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';

export const ONBOARDING_KEY = 'prt_onboarding_done';

const SLIDES = [
  {
    key:      '1',
    emoji:    '🚀',
    title:    'Ganhe cashback em todo abastecimento',
    subtitle: 'A cada abastecimento no posto você acumula cashback automaticamente, sem cartões e sem complicação.',
    bg:       'bg-primary-700',
  },
  {
    key:      '2',
    emoji:    '💰',
    title:    'Acompanhe seu saldo em tempo real',
    subtitle: 'Veja seu saldo atualizado, consulte o histórico completo de abastecimentos e cashbacks recebidos.',
    bg:       'bg-slate-800',
  },
  {
    key:      '3',
    emoji:    '🎉',
    title:    'Resgate quando quiser com QR Code',
    subtitle: 'Gere um QR Code e apresente ao atendente. Simples, rápido e seguro.',
    bg:       'bg-primary-700',
  },
] as const;

export default function OnboardingScreen() {
  const { width }     = useWindowDimensions();
  const flatRef       = useRef<FlatList>(null);
  const scrollX       = useRef(new Animated.Value(0)).current;
  const [current, setCurrent] = useState(0);

  async function finish() {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'done');
    router.replace('/(auth)/welcome');
  }

  function next() {
    if (current < SLIDES.length - 1) {
      Haptics.selectionAsync();
      flatRef.current?.scrollToIndex({ index: current + 1 });
    } else {
      finish();
    }
  }

  function renderSlide({ item }: ListRenderItemInfo<typeof SLIDES[number]>) {
    return (
      <View style={{ width }} className={`flex-1 ${item.bg} items-center justify-center px-8`}>
        <Text className="text-8xl mb-6">{item.emoji}</Text>
        <Text className="text-white text-3xl font-bold text-center mb-4 leading-tight">
          {item.title}
        </Text>
        <Text className="text-white/70 text-base text-center leading-6">
          {item.subtitle}
        </Text>
      </View>
    );
  }

  const isLast = current === SLIDES.length - 1;

  return (
    <SafeAreaView className="flex-1 bg-primary-700">
      {/* Skip */}
      {!isLast && (
        <TouchableOpacity onPress={finish} className="absolute top-14 right-6 z-10 py-1 px-3">
          <Text className="text-white/60 text-sm font-semibold">Pular</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrent(idx);
        }}
        style={{ flex: 1 }}
      />

      {/* Bottom controls */}
      <View className="flex-row items-center justify-between px-8 pb-8 pt-4">
        {/* Dot indicators */}
        <View className="flex-row gap-2">
          {SLIDES.map((_, i) => {
            const opacity = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            const scaleX = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [1, 2.4, 1],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={{ opacity, transform: [{ scaleX }] }}
                className="h-2 w-2 rounded-full bg-white"
              />
            );
          })}
        </View>

        {/* Next / Começar */}
        <TouchableOpacity
          onPress={next}
          className="bg-white px-7 py-3.5 rounded-2xl"
        >
          <Text className="text-primary-700 text-sm font-bold">
            {isLast ? 'Começar' : 'Próximo'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
