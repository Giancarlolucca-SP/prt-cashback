import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Animated, StyleSheet, Linking,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';

import { authApi } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { useAppConfig } from '../../src/context/AppConfigContext';
import { getOrCreateDeviceId } from '../../src/utils/deviceId';
import { maskCpfInput, isValidCpf, stripCpf } from '../../src/utils/formatters';
import Toast, { ToastType } from '../../src/components/ui/Toast';
import FaceOvalGuide, { OVAL_TOP } from '../../src/components/FaceOvalGuide';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step =
  | 'face-camera'   // Step 1 — face-only
  | 'face-failed'   // no match found
  | 'cpf-input'     // Step 3 — CPF entry
  | 'cpf-selfie'    // Step 4 — selfie after CPF lookup
  | 'cpf-not-found' // CPF not in system
  | 'match-failed'; // selfie didn't match CPF

const MAX_ATTEMPTS = 3;

// ── Component ─────────────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');

export default function ReinstallScreen() {
  const [step,         setStep]         = useState<Step>('face-camera');
  const [cpfInput,     setCpfInput]     = useState('');
  const [customerName, setCustomerName] = useState('');
  const [capturing,    setCapturing]    = useState(false);
  const [attempts,     setAttempts]     = useState(0);

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const { config, loading: configLoading } = useAppConfig();
  const { setAuth } = useAuthStore();

  const cnpj            = config.cnpj ?? '';
  const supportWhatsApp = config.supportWhatsApp ?? '';

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(message: string, type: ToastType = 'info', ms = 3500) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── Screen-fade transition ────────────────────────────────────────────────

  const screenFade = useRef(new Animated.Value(1)).current;
  function fadeTransition(fn: () => void) {
    Animated.timing(screenFade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      fn();
      Animated.timing(screenFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }

  // Reset state when navigating to a camera step
  useEffect(() => {
    if (step === 'face-camera' || step === 'cpf-selfie') {
      setCapturing(false);
    }
  }, [step]);

  // ── Capture ───────────────────────────────────────────────────────────────

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    if (configLoading) {
      showToast('Carregando configurações...', 'info');
      return;
    }

    setCapturing(true);

    try {
      // Take photo (URI only — ImageManipulator handles base64 encoding)
      const photo = await cameraRef.current.takePictureAsync({
        quality:        1,
        base64:         false,
        exif:           false,
        skipProcessing: true,
      });

      // Create thumbnail (100×100) and full (400×400) versions in parallel
      const [thumb, full] = await Promise.all([
        ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 100, height: 100 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        ),
        ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 400, height: 400 } }],
          { compress: 0.80, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        ),
      ]);

      const payload = { selfieThumb: thumb.base64 ?? '', selfieFull: full.base64 ?? '' };

      if (step === 'cpf-selfie') {
        verifyFaceWithCpf(payload);
      } else {
        verifyFaceOnly(payload);
      }
    } catch {
      showToast('Erro ao capturar foto. Tente novamente.', 'error');
      setCapturing(false);
    }
  }

  // ── Handle failure with retry logic ──────────────────────────────────────

  function handleVerifyFailure(msg: string) {
    showToast(msg, 'error');
    const next = attempts + 1;
    setAttempts(next);
    setCapturing(false);
    if (next >= MAX_ATTEMPTS && step === 'face-camera') {
      setTimeout(() => fadeTransition(() => setStep('cpf-input')), 800);
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  const { mutate: verifyFaceOnly } = useMutation({
    mutationFn: async ({ selfieThumb, selfieFull }: { selfieThumb: string; selfieFull: string }) => {
      const deviceId = await getOrCreateDeviceId();
      return authApi.verifyFace({ selfieThumb, selfieFull, cnpj, deviceId });
    },
    onSuccess: ({ data }) => {
      if (data.match) {
        showToast('Identidade confirmada!', 'success');
        setTimeout(() => {
          setAuth(data.token, data.cliente, data.estabelecimento?.nome ?? '');
          router.replace('/(tabs)');
        }, 700);
      } else {
        handleVerifyFailure('Rosto não reconhecido. Tente novamente.');
      }
    },
    onError: (err: any) => handleVerifyFailure(classifyError(err)),
  });

  const { mutate: verifyCpfExists, isPending: isCheckingCpf } = useMutation({
    mutationFn: () =>
      authApi.verifyCpf({ cpf: stripCpf(cpfInput), establishmentCnpj: cnpj }),
    onSuccess: ({ data }) => {
      if (data.existe) {
        setCustomerName(data.nome ?? '');
        showToast(`Conta encontrada! Olá, ${data.nome}.`, 'success');
        setTimeout(() => setStep('cpf-selfie'), 1000);
      } else {
        fadeTransition(() => setStep('cpf-not-found'));
      }
    },
    onError: (err: any) =>
      showToast(classifyError(err), 'error'),
  });

  const { mutate: verifyFaceWithCpf } = useMutation({
    mutationFn: async ({ selfieThumb, selfieFull }: { selfieThumb: string; selfieFull: string }) => {
      const deviceId = await getOrCreateDeviceId();
      return authApi.verifyFace({
        selfieThumb, selfieFull, cnpj,
        cpf: stripCpf(cpfInput),
        deviceId,
      });
    },
    onSuccess: ({ data }) => {
      if (data.match) {
        showToast('Identidade confirmada!', 'success');
        setTimeout(() => {
          setAuth(data.token, data.cliente, data.estabelecimento?.nome ?? '');
          router.replace('/(tabs)');
        }, 700);
      } else {
        showToast('Selfie não corresponde ao CPF informado.', 'error');
        setTimeout(() => fadeTransition(() => setStep('match-failed')), 700);
      }
    },
    onError: (err: any) => {
      showToast(classifyError(err), 'error');
      setCapturing(false);
    },
  });

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  function openWhatsApp() {
    const n = supportWhatsApp.replace(/\D/g, '');
    if (!n) { showToast('Número de suporte não configurado.', 'info'); return; }
    Linking.openURL(`https://wa.me/${n}`).catch(() =>
      showToast('Não foi possível abrir o WhatsApp.', 'error')
    );
  }

  // ── Camera screens ────────────────────────────────────────────────────────

  const isCameraStep = step === 'face-camera' || step === 'cpf-selfie';

  if (isCameraStep) {
    if (!permission) return <View style={StyleSheet.absoluteFill} className="bg-black" />;

    if (!permission.granted) {
      return (
        <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center px-8">
          <Ionicons name="camera-outline" size={64} color="#94a3b8" />
          <Text className="text-white text-xl font-bold mt-4 text-center">
            Permissão de câmera necessária
          </Text>
          <Text className="text-slate-400 text-sm mt-2 text-center leading-5">
            Precisamos da câmera para verificar sua identidade.
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

    const headerText = step === 'cpf-selfie'
      ? `Confirmar identidade${customerName ? ` — ${customerName}` : ''}`
      : 'Verificar identidade';

    return (
      <View style={{ flex: 1, backgroundColor: 'black', position: 'relative' }}>

        {/* Layer 1 — Camera, full screen */}
        <CameraView
          ref={cameraRef}
          style={{ position: 'absolute', top: 0, left: 0, width: SW, height: SH }}
          facing="front"
        />

        {/* Layer 2 — SVG mask + oval ring */}
        <FaceOvalGuide />

        {/* Layer 3 — Instruction card above oval */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionText}>📸 Posicione seu rosto na oval</Text>
        </View>

        {/* Layer 5 — Header title */}
        <SafeAreaView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}
        >
          <Text style={styles.headerText}>{headerText}</Text>
        </SafeAreaView>

        {/* Layer 6 — Capture button */}
        <View style={styles.captureContainer}>
          <TouchableOpacity
            onPress={handleCapture}
            disabled={capturing}
            style={[styles.captureBtn, capturing && styles.captureBtnDisabled]}
            activeOpacity={0.85}
          >
            {capturing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.captureBtnText}>Tirar foto</Text>
            )}
          </TouchableOpacity>

          {step === 'face-camera' && !capturing && (
            <TouchableOpacity
              onPress={() => fadeTransition(() => setStep('cpf-input'))}
              style={{ marginTop: 16, alignItems: 'center' }}
            >
              <Text style={styles.cpfLink}>Usar CPF</Text>
            </TouchableOpacity>
          )}
        </View>

        <Toast message={toast?.message ?? ''} type={toast?.type} visible={!!toast} />
      </View>
    );
  }

  // ── Face failed ───────────────────────────────────────────────────────────

  if (step === 'face-failed') {
    return (
      <Animated.View style={{ flex: 1, opacity: screenFade }}>
        <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-8">
          <View className="w-24 h-24 rounded-full bg-red-50 items-center justify-center mb-6">
            <Ionicons name="sad-outline" size={52} color="#dc2626" />
          </View>
          <Text className="text-primary-700 text-2xl font-bold text-center mb-2">
            Rosto não reconhecido
          </Text>
          <Text className="text-slate-500 text-sm text-center leading-5 mb-8">
            Não encontramos nenhuma conta vinculada{'\n'}
            a este rosto. Tente novamente ou{'\n'}
            informe seu CPF para continuar.
          </Text>

          <TouchableOpacity
            onPress={() => setStep('face-camera')}
            className="w-full bg-primary-700 py-4 rounded-2xl items-center mb-3"
          >
            <Text className="text-white text-base font-bold">Tentar novamente</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => fadeTransition(() => setStep('cpf-input'))}
            className="w-full border-2 border-primary-700 py-4 rounded-2xl items-center mb-3"
          >
            <Text className="text-primary-700 text-base font-bold">Entrar com CPF</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="py-3">
            <Text className="text-slate-400 text-sm">Ir para o login</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <Toast message={toast?.message ?? ''} type={toast?.type} visible={!!toast} />
      </Animated.View>
    );
  }

  // ── CPF input ─────────────────────────────────────────────────────────────

  if (step === 'cpf-input') {
    const cpfValid = isValidCpf(cpfInput);
    return (
      <Animated.View style={{ flex: 1, opacity: screenFade }}>
        <SafeAreaView className="flex-1 bg-slate-50">
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              className="px-6 pt-10 pb-10"
            >
              <View className="items-center mb-8">
                <View className="w-20 h-20 rounded-full bg-primary-50 items-center justify-center mb-4">
                  <Ionicons name="card-outline" size={36} color="#1e3a5f" />
                </View>
                <Text className="text-primary-700 text-2xl font-bold text-center">
                  Informe seu CPF
                </Text>
                <Text className="text-slate-500 text-sm mt-2 text-center leading-5">
                  Digite o CPF cadastrado para{'\n'}localizar sua conta.
                </Text>
              </View>

              <Text className="text-slate-600 text-sm font-semibold mb-2">CPF</Text>
              <TextInput
                value={maskCpfInput(cpfInput)}
                onChangeText={(t) => setCpfInput(t.replace(/\D/g, '').slice(0, 11))}
                keyboardType="number-pad"
                placeholder="000.000.000-00"
                placeholderTextColor="#94a3b8"
                className="border-2 rounded-xl px-4 py-3.5 text-base text-slate-800 bg-white mb-6"
                style={{
                  borderColor: cpfInput.length > 0 && !cpfValid ? '#dc2626' : '#cbd5e1',
                }}
              />

              <TouchableOpacity
                onPress={() => verifyCpfExists()}
                disabled={!cpfValid || configLoading || !cnpj || isCheckingCpf}
                className={[
                  'w-full py-4 rounded-2xl items-center mb-3',
                  cpfValid && !configLoading && cnpj && !isCheckingCpf
                    ? 'bg-primary-700'
                    : 'bg-slate-300',
                ].join(' ')}
              >
                {isCheckingCpf
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text className={[
                      'text-base font-bold',
                      cpfValid && !configLoading && cnpj ? 'text-white' : 'text-slate-500',
                    ].join(' ')}>Continuar</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setStep('face-camera')}
                className="py-3 items-center"
              >
                <Text className="text-slate-400 text-sm">Voltar para câmera</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        <Toast message={toast?.message ?? ''} type={toast?.type} visible={!!toast} />
      </Animated.View>
    );
  }

  // ── CPF not found ─────────────────────────────────────────────────────────

  if (step === 'cpf-not-found') {
    return (
      <Animated.View style={{ flex: 1, opacity: screenFade }}>
        <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-8">
          <View className="w-24 h-24 rounded-full bg-amber-50 items-center justify-center mb-6">
            <Ionicons name="help-circle-outline" size={52} color="#d97706" />
          </View>
          <Text className="text-primary-700 text-2xl font-bold text-center mb-2">
            Conta não encontrada
          </Text>
          <Text className="text-slate-500 text-sm text-center leading-5 mb-8">
            Não encontramos nenhuma conta com o CPF{'\n'}
            <Text className="font-semibold">{maskCpfInput(cpfInput)}</Text>.{'\n\n'}
            Deseja criar uma nova conta?
          </Text>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            className="w-full bg-primary-700 py-4 rounded-2xl items-center mb-3"
          >
            <Text className="text-white text-base font-bold">Criar nova conta</Text>
          </TouchableOpacity>

          {!!supportWhatsApp && (
            <TouchableOpacity
              onPress={openWhatsApp}
              className="w-full border-2 border-primary-700 py-4 rounded-2xl items-center mb-3"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="logo-whatsapp" size={20} color="#1e3a5f" />
                <Text className="text-primary-700 text-base font-bold">Falar com suporte</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => fadeTransition(() => setStep('cpf-input'))}
            className="py-3"
          >
            <Text className="text-slate-400 text-sm">Tentar outro CPF</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <Toast message={toast?.message ?? ''} type={toast?.type} visible={!!toast} />
      </Animated.View>
    );
  }

  // ── Match failed ──────────────────────────────────────────────────────────

  if (step === 'match-failed') {
    return (
      <Animated.View style={{ flex: 1, opacity: screenFade }}>
        <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-8">
          <View className="w-24 h-24 rounded-full bg-red-50 items-center justify-center mb-6">
            <Ionicons name="shield-outline" size={52} color="#dc2626" />
          </View>
          <Text className="text-primary-700 text-2xl font-bold text-center mb-2">
            Verificação falhou
          </Text>
          <Text className="text-slate-500 text-sm text-center leading-5 mb-8">
            Não foi possível confirmar que você é{'\n'}
            o titular desta conta.{'\n\n'}
            Tente novamente ou entre em contato{'\n'}com o suporte do posto.
          </Text>

          <TouchableOpacity
            onPress={() => setStep('cpf-selfie')}
            className="w-full bg-primary-700 py-4 rounded-2xl items-center mb-3"
          >
            <Text className="text-white text-base font-bold">Tentar novamente</Text>
          </TouchableOpacity>

          {!!supportWhatsApp && (
            <TouchableOpacity
              onPress={openWhatsApp}
              className="w-full border-2 border-primary-700 py-4 rounded-2xl items-center mb-3"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="logo-whatsapp" size={20} color="#1e3a5f" />
                <Text className="text-primary-700 text-base font-bold">Falar com suporte</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="py-3">
            <Text className="text-slate-400 text-sm">Ir para o login</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <Toast message={toast?.message ?? ''} type={toast?.type} visible={!!toast} />
      </Animated.View>
    );
  }

  return null;
}

// ── Error message classifier ──────────────────────────────────────────────────

function classifyError(err: any): string {
  if (!err) return 'Erro ao verificar. Tente novamente.';
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return 'Servidor demorou para responder. Tente novamente.';
  }
  if (err.message?.includes('Network Error') || err.code === 'ERR_NETWORK') {
    return 'Sem conexão. Verifique sua internet.';
  }
  return err.response?.data?.erro ?? 'Erro ao verificar. Tente novamente.';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerText: {
    color:      '#fff',
    fontSize:   18,
    fontWeight: '700',
    textAlign:  'center',
    marginTop:  12,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  captureContainer: {
    position: 'absolute',
    bottom:   80,
    left:     24,
    right:    24,
  },
  captureBtn: {
    backgroundColor: '#ffffff',
    borderRadius:    12,
    paddingVertical: 16,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
    gap:             8,
  },
  captureBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  captureBtnText: {
    color:      '#000000',
    fontSize:   16,
    fontWeight: '700',
  },
  cpfLink: {
    color:      'rgba(255,255,255,0.45)',
    fontSize:   14,
    fontWeight: '500',
  },
  instructionCard: {
    position:        'absolute',
    top:             OVAL_TOP - 120,
    left:            16,
    right:           16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius:    12,
    padding:         12,
    alignItems:      'center',
  },
  instructionText: {
    color:      '#1e3a5f',
    fontSize:   15,
    fontWeight: '600',
    textAlign:  'center',
  },
});
