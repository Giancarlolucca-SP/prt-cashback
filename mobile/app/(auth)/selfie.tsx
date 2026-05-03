import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Alert,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Ellipse, Defs, Mask, Rect } from 'react-native-svg';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImageManipulator from 'expo-image-manipulator';

import { api, authApi } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { stripCpf } from '../../src/utils/formatters';
import { getOrCreateDeviceId } from '../../src/utils/deviceId';

const { width: W, height: H } = Dimensions.get('window');
const OVAL_W = 300;
const OVAL_H = 400;
const OVAL_CX = W / 2;
const OVAL_CY = H / 2 - 20;
const TIMEOUT_MS = 30_000;

type ScreenState = 'intro' | 'camera' | 'biometric-prompt';

// ── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS, msg?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(msg ?? 'A operação demorou muito. Tente novamente.')),
        ms
      )
    ),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SelfieScreen() {
  const params = useLocalSearchParams<{
    mode:  string; // 'register' | 'recovery'
    nome:  string;
    cpf:   string;
    phone: string;
    cnpj:  string;
  }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [screenState,         setScreenState]         = useState<ScreenState>('intro');
  const [isLoading,           setIsLoading]           = useState(false);
  const [status,              setStatus]              = useState('');
  const [biometricAvailable,  setBiometricAvailable]  = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const { setAuth, setBiometrics } = useAuthStore();

  const isRecovery = params.mode === 'recovery';

  // Check biometric availability
  useEffect(() => {
    (async () => {
      const hw       = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hw && enrolled);
    })();
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────────────

  // Recovery: optionally offer biometrics, then go to tabs
  function proceed() {
    if (biometricAvailable) {
      setScreenState('biometric-prompt');
    } else {
      router.replace('/(tabs)');
    }
  }

  // Register: go to success screen (biometric prompt skipped — success is the last step)
  function proceedRegister() {
    router.replace({
      pathname: '/(auth)/success',
      params:   { nome: params.nome ?? '' },
    });
  }

  // ── Main capture flow ─────────────────────────────────────────────────────

  async function handleCapture() {
    if (isLoading || !cameraRef.current) return;
    setIsLoading(true);

    let accountCreated = false;

    try {
      // Step 1 — Take photo
      console.log('[SELFIE] 1. Iniciando captura...');
      setStatus('1/3  Capturando foto...');
      const photo = await withTimeout(
        cameraRef.current.takePictureAsync({
          quality:        0.7,
          base64:         true,
          exif:           false,
          skipProcessing: true,
        }),
        TIMEOUT_MS,
        'Tempo esgotado ao capturar foto. Tente novamente.'
      );
      console.log('[SELFIE] 2. Foto capturada:', photo?.uri);

      if (!photo?.base64) {
        throw new Error('Foto não capturada. Tente novamente.');
      }

      // Step 2 — Compress (single version; backend cria thumb + full via sharp)
      setStatus('2/3  Processando imagem...');
      let compressed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 400 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      console.log('[SELFIE] 3. Comprimida. Tamanho base64:', compressed?.base64?.length);

      let base64Clean = (compressed.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
      console.log('Selfie size (chars):', base64Clean.length);

      if (base64Clean.length > 50000) {
        console.log('[selfie] tamanho excedeu 50 000 chars — recomprimindo...');
        compressed = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 300 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        base64Clean = (compressed.base64 ?? '').replace(/^data:image\/\w+;base64,/, '');
        console.log('[SELFIE] 3. Recomprimida. Tamanho base64:', compressed?.base64?.length);
        console.log('Selfie size após recompressão (chars):', base64Clean.length);
      }

      if (isRecovery) {
        // ── Recovery — envia selfie para comparação de identidade ─────────
        setStatus('3/3  Verificando identidade...');
        console.log('[SELFIE] 4. Enviando para:', api.defaults.baseURL + '/app/recovery/complete');
        const deviceId = await getOrCreateDeviceId();
        const { data } = await withTimeout(
          authApi.recoveryComplete({
            cpf:               stripCpf(params.cpf ?? ''),
            establishmentCnpj: (params.cnpj ?? '').replace(/\D/g, ''),
            deviceId,
            selfieThumb: base64Clean,
            selfieFull:  base64Clean,
          }),
          TIMEOUT_MS,
          'Servidor demorou para responder. Tente novamente.'
        );
        console.log('[SELFIE] 5. Resposta:', data);
        await setAuth(data.token, data.cliente, data.estabelecimento?.nome ?? '');
        setStatus('Finalizando...');
        proceed();

      } else {
        // ── Register ──────────────────────────────────────────────────────
        setStatus('3/3  Criando sua conta...');
        const deviceId = await getOrCreateDeviceId();
        const { data } = await withTimeout(
          authApi.register({
            cpf:               stripCpf(params.cpf ?? ''),
            name:              params.nome ?? '',
            phone:             (params.phone ?? '').replace(/\D/g, ''),
            establishmentCnpj: (params.cnpj ?? '').replace(/\D/g, ''),
            deviceId,
          }),
          TIMEOUT_MS,
          'Servidor demorou para responder. Tente novamente.'
        );

        accountCreated = true;

        // setAuth é best-effort — não bloqueia navegação se falhar
        try {
          await setAuth(data.token, data.cliente, data.estabelecimento?.nome ?? '');
        } catch (e) {
          console.error('[selfie] setAuth error:', e);
        }

        // Upload em background — nunca bloqueia navegação
        authApi.registerSelfie({ selfie: base64Clean })
          .then((response) => {
            console.log('[SELFIE] 5. Resposta:', response?.data);
          })
          .catch((err: any) => {
            console.log('[SELFIE] ERRO:', err?.message, err?.code, err?.response?.status);
          });

        proceedRegister();
      }

    } catch (error: any) {
      console.log('[SELFIE] ERRO:', error?.message, error?.code, error?.response?.status);
      if (accountCreated) {
        // Account exists — always navigate to success even if a subsequent step failed
        proceedRegister();
        return;
      }

      const message =
        error?.response?.data?.erro ??
        error?.message ??
        'Erro desconhecido';

      Alert.alert(
        'Erro',
        `Não foi possível processar a foto.\n\n${message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setStatus('');
      setIsLoading(false);
    }
  }

  // ── Skip (register mode only) ─────────────────────────────────────────────
  // Creates the account without a selfie and proceeds to the dashboard.

  async function handleSkip() {
    if (isLoading) return;
    setIsLoading(true);
    setStatus('Criando conta...');

    let accountCreated = false;

    try {
      const deviceId = await getOrCreateDeviceId();
      const { data } = await withTimeout(
        authApi.register({
          cpf:               stripCpf(params.cpf ?? ''),
          name:              params.nome ?? '',
          phone:             (params.phone ?? '').replace(/\D/g, ''),
          establishmentCnpj: (params.cnpj ?? '').replace(/\D/g, ''),
          deviceId,
        }),
        TIMEOUT_MS,
        'Servidor demorou para responder. Tente novamente.'
      );
      accountCreated = true;
      try {
        await setAuth(data.token, data.cliente, data.estabelecimento?.nome ?? '');
      } catch (e) {
        console.error('[skip] setAuth error:', e);
      }
      proceedRegister();
    } catch (error: any) {
      if (accountCreated) {
        proceedRegister();
        return;
      }
      Alert.alert(
        'Erro',
        error?.response?.data?.erro ?? error?.message ?? 'Erro ao criar conta.',
      );
    } finally {
      setStatus('');
      setIsLoading(false);
    }
  }

  // ── Biometric prompt ──────────────────────────────────────────────────────

  async function handleEnableBiometrics() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirme para ativar o desbloqueio biométrico',
        cancelLabel:   'Cancelar',
      });
      if (result.success) {
        await setBiometrics(true);
        Alert.alert('Biometria ativada', 'Você entrará com biometria nas próximas vezes.');
      }
    } catch {}
    router.replace('/(tabs)');
  }

  // ── Screens ───────────────────────────────────────────────────────────────

  if (screenState === 'biometric-prompt') {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-8">
        <View className="w-24 h-24 rounded-full bg-primary-50 items-center justify-center mb-6">
          <Ionicons name="finger-print" size={52} color="#1e3a5f" />
        </View>
        <Text className="text-primary-700 text-2xl font-bold text-center mb-2">
          Ativar desbloqueio biométrico?
        </Text>
        <Text className="text-slate-500 text-sm text-center leading-5 mb-8">
          Entre sem digitar CPF ou senha.{'\n'}
          Use Face ID ou impressão digital.
        </Text>
        <TouchableOpacity
          onPress={handleEnableBiometrics}
          className="w-full bg-primary-700 py-4 rounded-2xl items-center mb-3"
        >
          <Text className="text-white text-base font-bold">Sim, ativar biometria</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} className="py-3">
          <Text className="text-slate-400 text-sm font-semibold">Agora não</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Intro screen — shown before camera opens ─────────────────────────────

  if (screenState === 'intro') {
    const firstName = (params.nome ?? '').trim().split(' ')[0];
    const title     = isRecovery ? 'Verificar identidade' : 'Foto de verificação';
    const greeting  = isRecovery
      ? 'Vamos confirmar que é você antes de restaurar o acesso.'
      : firstName
        ? `Quase lá, ${firstName}! Precisamos tirar uma foto para proteger sua conta. É rápido e seguro! 😊`
        : 'Precisamos tirar uma foto para proteger sua conta. É rápido e seguro! 😊';

    return (
      <SafeAreaView className="flex-1 bg-primary-700">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-6xl mb-6">📸</Text>

          <Text className="text-white text-2xl font-bold text-center mb-3">
            {title}
          </Text>

          <Text className="text-white/80 text-base text-center leading-6 mb-8">
            {greeting}
          </Text>

          {/* Instructions */}
          <View className="w-full gap-3 mb-10">
            {[
              '🌞  Escolha um local bem iluminado',
              '👤  Posicione seu rosto no centro da tela',
              '😐  Olhe direto para a câmera',
            ].map((tip) => (
              <View key={tip} style={styles.tipRow}>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="px-8 pb-10 gap-3">
          <TouchableOpacity
            onPress={() => setScreenState('camera')}
            className="bg-white py-4 rounded-2xl items-center"
            activeOpacity={0.85}
          >
            <Text className="text-primary-700 text-base font-bold">Abrir câmera</Text>
          </TouchableOpacity>

          {!isRecovery && (
            <TouchableOpacity
              onPress={handleSkip}
              disabled={isLoading}
              className="bg-white/10 py-4 rounded-2xl items-center border border-white/20"
              activeOpacity={0.75}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-white/70 text-sm font-medium">
                  Pular por agora
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center px-8">
        <Ionicons name="camera-outline" size={64} color="#94a3b8" />
        <Text className="text-white text-xl font-bold mt-4 text-center">
          Permissão de câmera necessária
        </Text>
        <Text className="text-slate-400 text-sm mt-2 text-center leading-5">
          Precisamos da câmera para validar sua identidade.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          className="mt-6 bg-primary-600 px-8 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Permitir câmera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Camera view ───────────────────────────────────────────────────────────

  const title = isRecovery ? 'Verificar identidade' : 'Foto de verificação';

  return (
    <View style={StyleSheet.absoluteFill} className="bg-black">
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
      />

      {/* SVG dark mask with oval cutout — no ring */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={W} height={H}>
          <Defs>
            <Mask id="oval-mask">
              <Rect x={0} y={0} width={W} height={H} fill="white" />
              <Ellipse cx={OVAL_CX} cy={OVAL_CY} rx={OVAL_W / 2} ry={OVAL_H / 2} fill="black" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.60)" mask="url(#oval-mask)" />
        </Svg>
      </View>

      {/* Header */}
      <SafeAreaView className="absolute top-0 left-0 right-0 pt-4 px-4">
        <Text className="text-white text-lg font-bold text-center">{title}</Text>
        <Text className="text-white/70 text-sm text-center mt-1">
          Posicione seu rosto no oval e olhe para a câmera
        </Text>

        {/* Friendly card — register mode only */}
        {!isRecovery && (
          <View style={styles.friendlyCard}>
            <Text style={styles.friendlyText}>
              {params.nome
                ? <>{'📸 Quase lá, '}<Text style={styles.friendlyName}>{(params.nome ?? '').trim().split(' ')[0]}</Text>{'!\n'}</>
                : '📸 '}
              {'Precisamos tirar uma foto para proteger sua conta. É rápido e seguro! 😊'}
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Bottom actions */}
      <SafeAreaView
        className="absolute bottom-0 left-0 right-0 items-center pb-10"
        edges={['bottom']}
      >
        {isLoading ? (
          /* Loading state — show spinner + current step */
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#ffffff" size="small" />
            {!!status && (
              <Text style={styles.statusText}>{status}</Text>
            )}
          </View>
        ) : (
          /* Idle state — capture button + optional skip */
          <>
            <TouchableOpacity
              onPress={handleCapture}
              style={styles.captureBtn}
              activeOpacity={0.85}
            >
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
            <Text style={styles.captureHint}>Toque para capturar</Text>

            {!isRecovery && (
              <TouchableOpacity
                onPress={handleSkip}
                style={styles.skipBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.skipText}>Pular validação facial por agora</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    color:    '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  captureBtn: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: '#ffffff',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    8,
  },
  captureBtnInner: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: '#1e3a5f',
  },
  captureHint: {
    color:    'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  skipBtn: {
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    color:    'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  friendlyCard: {
    marginTop:        12,
    backgroundColor:  'rgba(255,255,255,0.12)',
    borderRadius:     14,
    paddingVertical:  10,
    paddingHorizontal: 14,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.18)',
  },
  friendlyText: {
    color:      'rgba(255,255,255,0.90)',
    fontSize:   13,
    lineHeight: 19,
    textAlign:  'center',
  },
  friendlyName: {
    color:      '#ffffff',
    fontWeight: '700',
  },
  tipRow: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius:    12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.15)',
  },
  tipText: {
    color:      'rgba(255,255,255,0.85)',
    fontSize:   14,
    lineHeight: 20,
  },
});
