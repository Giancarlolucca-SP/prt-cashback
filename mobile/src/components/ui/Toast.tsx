import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
}

const CONFIG: Record<ToastType, { icon: string; bg: string; text: string }> = {
  success: { icon: 'checkmark-circle',  bg: '#16a34a', text: '#fff' },
  error:   { icon: 'close-circle',      bg: '#dc2626', text: '#fff' },
  info:    { icon: 'information-circle', bg: '#1e3a5f', text: '#fff' },
};

export default function Toast({ message, type = 'info', visible }: ToastProps) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0,   useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacity,    { toValue: 1,   duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,   duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const { icon, bg, text } = CONFIG[type];

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 60,
        left: 20,
        right: 20,
        opacity,
        transform: [{ translateY }],
        zIndex: 999,
      }}
      pointerEvents="none"
    >
      <View
        style={{
          backgroundColor: bg,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          gap: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Ionicons name={icon as any} size={22} color={text} />
        <Text style={{ color: text, fontSize: 14, fontWeight: '600', flex: 1, flexWrap: 'wrap' }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
