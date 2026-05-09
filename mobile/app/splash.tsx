import { useEffect, useRef } from 'react';
import { View, Image, Text, Animated, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppConfig } from '../src/context/AppConfigContext';

const SPLASH_MS    = 2500;
const FADE_IN_MS   = 600;
const FADE_OUT_MS  = 400;
const LOADING_MS   = SPLASH_MS - FADE_OUT_MS; // bar fills just before fade-out

interface Props {
  onComplete?: () => void;
}

export default function DynamicSplash({ onComplete }: Props) {
  const { config } = useAppConfig();
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue:         1,
        duration:        FADE_IN_MS,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue:         1,
        tension:         50,
        friction:        7,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue:         0,
        duration:        FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => {
        if (onComplete) {
          onComplete();
        } else {
          router.replace('/');
        }
      });
    }, SPLASH_MS);

    return () => clearTimeout(timer);
  }, []);

  const displayName =
    config.postoName && config.postoName !== 'Posto'
      ? config.postoName
      : config.appName;

  return (
    <View style={[styles.container, { backgroundColor: config.primaryColor }]}>
      <StatusBar style="light" />

      <Animated.View
        style={[
          styles.logoContainer,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {config.logoUrl ? (
          <>
            <Image
              source={{ uri: config.logoUrl }}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.establishmentName}>{displayName}</Text>
          </>
        ) : (
          <Text style={styles.appName}>{displayName}</Text>
        )}
        <Text style={styles.tagline}>Cashback inteligente</Text>
      </Animated.View>

      <View style={styles.loadingContainer}>
        <LoadingBar />
      </View>

      <Text style={styles.poweredBy}>powered by PostoCash</Text>
    </View>
  );
}

function LoadingBar() {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue:         1,
      duration:        LOADING_MS,
      useNativeDriver: false,
    }).start();
  }, []);

  return (
    <View style={styles.loadingTrack}>
      <Animated.View
        style={[
          styles.loadingFill,
          {
            width: widthAnim.interpolate({
              inputRange:  [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
  },
  logoContainer: {
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 32,
  },
  logo: {
    width:        200,
    height:       100,
    marginBottom: 16,
  },
  establishmentName: {
    fontSize:     24,
    fontWeight:   '700',
    color:        'white',
    marginBottom: 8,
    textAlign:    'center',
  },
  appName: {
    fontSize:      48,
    fontWeight:    '800',
    color:         'white',
    letterSpacing: -1,
    marginBottom:  8,
    textAlign:     'center',
  },
  tagline: {
    fontSize:      16,
    color:         'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginTop:     4,
  },
  loadingContainer: {
    position: 'absolute',
    bottom:   80,
    left:     40,
    right:    40,
  },
  loadingTrack: {
    height:          3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius:    2,
    overflow:        'hidden',
  },
  loadingFill: {
    height:          '100%',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius:    2,
  },
  poweredBy: {
    position:      'absolute',
    bottom:        44,
    fontSize:      11,
    color:         'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
});
