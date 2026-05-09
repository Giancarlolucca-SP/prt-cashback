import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Alert, Animated, StyleSheet,
  ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { customerApi, isTokenExpired } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import Button from '../../src/components/ui/Button';
import { useBranding } from '../../src/hooks/useBranding';

// ── Result types ───────────────────────────────────────────────────────────────

interface RedemptionResult {
  mensagem:       string;
  valorResgatado: string;
  novoSaldo:      string;
  nomeCliente:    string;
}

interface NfceResult {
  sucesso?:    boolean;
  pendente?:   boolean;
  mensagem:    string;
  codigoCupom?: string;
  dadosExtraidos?: {
    data:            string | null;
    tipoCombustivel: string | null;
    litros:          number | null;
    total:           number;
  };
  nota?: {
    emitente:        string;
    dataEmissao:     string;
    valorTotal:      string;
    tipoCombustivel: string | null;
    litros:          string | null;
  };
  transacao?: {
    cashbackGerado: string;
    percentual:     string;
    novoSaldo:      string;
    novoSaldoNum:   number;
    codigoCupom:    string;
  };
}

type ScanResult =
  | { kind: 'redeem'; data: RedemptionResult }
  | { kind: 'nfce';   data: NfceResult; via?: 'qr' | 'photo' };

type PhotoStep = null | 'instructions' | 'capture' | 'preview' | 'uploading';

const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// ── Expo Go gate ───────────────────────────────────────────────────────────────

function ExpoGoGate() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#1e293b', borderRadius: 20, padding: 28, alignItems: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="warning-outline" size={40} color="#D97706" />
          </View>
          <Text style={{ color: 'white', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
            Câmera indisponível no Expo Go
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
            A leitura de QR Code foi removida do Expo Go a partir do SDK 53.{'\n\n'}
            Para usar esta funcionalidade é necessário instalar o{' '}
            <Text style={{ color: '#F59E0B', fontWeight: '600' }}>aplicativo de desenvolvimento (APK)</Text>
            {' '}gerado pelo EAS Build.
          </Text>
          <View style={{ width: '100%', backgroundColor: '#0f172a', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Como instalar o APK
            </Text>
            {[
              '1. Solicite o link do APK ao administrador',
              '2. No Android, acesse Configurações → Segurança → Fontes desconhecidas',
              '3. Abra o link recebido e instale o arquivo .apk',
              '4. Abra o app "PostoCash" instalado',
            ].map((step) => (
              <Text key={step} style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 22 }}>{step}</Text>
            ))}
          </View>
          <Text style={{ color: '#475569', fontSize: 12, textAlign: 'center' }}>
            Para gerar o APK: {'\n'}
            <Text style={{ color: '#64748b', fontFamily: 'monospace' }}>
              eas build --profile development --platform android
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function ValidarScreen() {
  if (IS_EXPO_GO) return <ExpoGoGate />;

  const queryClient = useQueryClient();
  const logout      = useAuthStore((s) => s.logout);
  const { primaryColor, secondaryColor } = useBranding();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,        setScanning]       = useState(false);
  const [result,          setResult]         = useState<ScanResult | null>(null);
  const [locCoords,       setLocCoords]      = useState<{ latitude: number; longitude: number } | null>(null);
  const [sefazPendingData, setSefazPendingData] = useState<NfceResult | null>(null);
  const [photoStep,       setPhotoStep]      = useState<PhotoStep>(null);
  const [photoData,       setPhotoData]      = useState<string | null>(null);
  const [tokenStatus,     setTokenStatus]    = useState<'checking' | 'valid' | 'expired'>('checking');

  const photoCameraRef = useRef<CameraView>(null);
  const scanLock       = useRef(false);

  // Pre-flight: check token
  useEffect(() => {
    SecureStore.getItemAsync('postocash_token').then((token) => {
      setTokenStatus(isTokenExpired(token) ? 'expired' : 'valid');
    }).catch(() => setTokenStatus('expired'));
  }, []);

  // Animated corner brackets for QR scanner
  const cornerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(cornerAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(cornerAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Location
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {}
    })();
  }, []);

  const cornerOpacity = cornerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1, 0.6] });

  async function handleSessionExpired() {
    await logout();
    router.replace('/(auth)/login');
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const { mutate: redeem, isPending: isRedeemPending } = useMutation({
    mutationFn: (code: string) =>
      customerApi.validateRedemption({ code, ...(locCoords ?? {}) }),
    onSuccess: ({ data }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({ kind: 'redeem', data });
      scanLock.current = false;
    },
    onError: (err: any) => {
      const codigo = err.response?.data?.codigo;
      const msg    = err.response?.data?.erro ?? 'Código inválido ou expirado.';
      if (codigo === 'WRONG_DEVICE') {
        Alert.alert(
          'Dispositivo não autorizado',
          'Este dispositivo não está vinculado a esta conta. Realize a recuperação de conta.',
          [
            { text: 'Cancelar',        style: 'cancel', onPress: () => { scanLock.current = false; } },
            { text: 'Recuperar conta', onPress: () => router.push('/(auth)/recovery') },
          ],
        );
        return;
      }
      Alert.alert('Erro ao validar', msg, [
        { text: 'OK', onPress: () => { scanLock.current = false; } },
      ]);
    },
  });

  const { mutate: validateNfce, isPending: isNfcePending } = useMutation({
    mutationFn: (qrCodeUrl: string) => customerApi.validateNfce({ qrCodeUrl }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['statement'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      if (data.pendente) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setSefazPendingData(data);
        setScanning(false);
        scanLock.current = false;
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setResult({ kind: 'nfce', data, via: 'qr' });
        scanLock.current = false;
      }
    },
    onError: (err: any) => {
      if (err?.requiresReauth) {
        setTokenStatus('expired');
        scanLock.current = false;
        return;
      }
      const msg = err.response?.data?.erro ?? 'Não foi possível validar o cupom fiscal.';
      Alert.alert('Erro ao validar cupom', msg, [
        { text: 'OK', onPress: () => { scanLock.current = false; } },
      ]);
    },
  });

  const { mutate: validatePhoto } = useMutation({
    mutationFn: (base64Photo: string) =>
      customerApi.validatePhoto({ photo: base64Photo }),
    onSuccess: ({ data }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['statement'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
      setPhotoStep(null);
      setPhotoData(null);
      setSefazPendingData(null);
      setResult({ kind: 'nfce', data, via: 'photo' });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.erro ?? 'Não foi possível processar a foto do cupom.';
      Alert.alert(
        'Erro ao processar foto',
        msg,
        [
          { text: 'Tentar novamente', onPress: () => setPhotoStep('preview') },
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => { setPhotoStep(null); setPhotoData(null); },
          },
        ],
      );
    },
  });

  const isPending = isRedeemPending || isNfcePending;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function handleScan({ data }: BarcodeScanningResult) {
    if (scanLock.current || isPending) return;
    if (tokenStatus === 'expired') { handleSessionExpired(); return; }

    scanLock.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (data.startsWith('http://') || data.startsWith('https://')) {
      validateNfce(data.trim());
      return;
    }

    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'PostoCash_REDEEM' && parsed.code) {
        redeem(parsed.code);
        return;
      }
    } catch {}

    redeem(data.trim());
  }

  async function handleCapture() {
    if (!photoCameraRef.current) return;
    try {
      const photo = await photoCameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      if (!photo?.base64) {
        Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
        return;
      }
      setPhotoData(photo.base64);
      setPhotoStep('preview');
    } catch {
      Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
    }
  }

function handleSendPhoto() {
    if (!photoData) return;
    setPhotoStep('uploading');
    validatePhoto(photoData);
  }

  // ── Render order ──────────────────────────────────────────────────────────────

  // 1. Result
  if (result) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          {result.kind === 'redeem' ? (
            <RedemptionResultCard
              data={result.data}
              onNew={() => { setResult(null); setScanning(false); }}
            />
          ) : (
            <NfceResultCard
              data={result.data}
              via={result.via}
              onNew={() => { setResult(null); setScanning(false); }}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 2. SEFAZ pending → offer photo fallback
  if (sefazPendingData && photoStep === null) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="bg-white rounded-3xl p-8 items-center shadow-sm border border-slate-100">
            <View className="w-20 h-20 rounded-full bg-orange-100 items-center justify-center mb-4">
              <Ionicons name="warning-outline" size={44} color="#EA580C" />
            </View>
            <Text className="text-slate-800 text-xl font-bold mb-2 text-center">
              SEFAZ temporariamente indisponível
            </Text>
            <Text className="text-slate-500 text-sm text-center leading-6 mb-8">
              Não foi possível validar o cupom fiscal agora.{'\n'}
              Deseja fotografar o cupom para validação?
            </Text>
            <Button
              title="🖼️ Fotografar cupom"
              fullWidth
              onPress={() => setPhotoStep('instructions')}
              className="mb-3"
            />
            <TouchableOpacity
              onPress={() => {
                setSefazPendingData(null);
                setResult({ kind: 'nfce', data: sefazPendingData });
              }}
              className="py-3 px-6"
            >
              <Text className="text-slate-500 text-sm font-semibold">Tentar mais tarde</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 3. Photo instructions
  if (photoStep === 'instructions') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#f1f5f9' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 20, alignSelf: 'center' }}>
              <Ionicons name="camera-outline" size={34} color="#1d4ed8" />
            </View>

            <Text style={{ color: '#1e293b', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 20 }}>
              📸 Como fotografar o cupom:
            </Text>

            <View style={{ backgroundColor: '#f8fafc', borderRadius: 16, padding: 20, marginBottom: 28, gap: 14 }}>
              {[
                'Coloque o cupom em superfície plana',
                'Boa iluminação, sem sombras',
                'Enquadre o cupom inteiro na foto',
                'Mantenha o celular paralelo ao cupom',
              ].map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: '#475569', fontSize: 14, flex: 1, lineHeight: 20 }}>{tip}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => setPhotoStep('capture')}
              activeOpacity={0.85}
              style={{
                backgroundColor: secondaryColor, borderRadius: 16,
                padding: 16, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 12,
              }}
            >
              <Ionicons name="camera" size={20} color="white" />
              <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>📷 Tirar foto agora</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPhotoStep(null)}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 14, fontWeight: '600' }}>Voltar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 4. Camera capture
  if (photoStep === 'capture') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['bottom']}>
        <View style={{ flex: 1, position: 'relative' }}>
          <CameraView
            ref={photoCameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
          />
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center',
          }}>
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>
              Enquadre o cupom fiscal inteiro
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Superfície plana • Sem sombras • Cupom inteiro visível
            </Text>
          </View>

          <View style={{ position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center', gap: 16 }}>
            <TouchableOpacity
              onPress={handleCapture}
              style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: 'white', borderWidth: 5, borderColor: '#F59E0B',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="camera" size={36} color="#1e3a5f" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPhotoStep('instructions')}
              style={{ paddingVertical: 8, paddingHorizontal: 20 }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 5. Photo preview
  if (photoStep === 'preview' && photoData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom']}>
        {/* Header */}
        <View style={{
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <TouchableOpacity
            onPress={() => setPhotoStep('instructions')}
            hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '700', flex: 1 }}>
            Pré-visualização
          </Text>
        </View>

        {/* Image */}
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          <Image
            source={{ uri: `data:image/jpeg;base64,${photoData}` }}
            style={{ flex: 1, borderRadius: 16 }}
            resizeMode="contain"
          />
        </View>

        {/* Tip */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
          <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center' }}>
            Verifique se o cupom está legível e bem enquadrado.
          </Text>
        </View>

        {/* Actions */}
        <View style={{ padding: 20, gap: 10 }}>
          <TouchableOpacity
            onPress={handleSendPhoto}
            activeOpacity={0.85}
            style={{
              backgroundColor: secondaryColor, borderRadius: 16,
              padding: 16, alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 10,
            }}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="white" />
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>Enviar para validação</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setPhotoData(null); setPhotoStep('instructions'); }}
            activeOpacity={0.8}
            style={{
              borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
              padding: 14, alignItems: 'center',
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>Tirar outra foto</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 6. Uploading
  if (photoStep === 'uploading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }} edges={['bottom']}>
        <View style={{ alignItems: 'center', gap: 20, paddingHorizontal: 32 }}>
          <ActivityIndicator size="large" color="#F59E0B" />
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
            🔍 Lendo cupom fiscal...
          </Text>
          <Text style={{ color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
            Estamos extraindo os dados do cupom.{'\n'}Aguarde um momento.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 7. Token check spinner
  if (tokenStatus === 'checking') {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center" edges={['bottom']}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </SafeAreaView>
    );
  }

  // 8. Session expired
  if (tokenStatus === 'expired') {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-8" edges={['bottom']}>
        <View className="bg-white rounded-3xl p-8 w-full items-center shadow-sm border border-slate-100">
          <View className="w-20 h-20 rounded-full bg-red-100 items-center justify-center mb-4">
            <Ionicons name="lock-closed-outline" size={44} color="#DC2626" />
          </View>
          <Text className="text-slate-800 text-xl font-bold mb-2 text-center">Sessão expirada</Text>
          <Text className="text-slate-500 text-sm text-center leading-6 mb-8">
            Sua sessão expirou ou você foi desconectado.{'\n'}Faça login novamente para continuar.
          </Text>
          <Button title="Fazer login" fullWidth onPress={handleSessionExpired} />
        </View>
      </SafeAreaView>
    );
  }

  // 9. Camera permission gate (QR scanner)
  if (!permission?.granted && scanning) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 items-center justify-center px-8">
        <Ionicons name="qr-code-outline" size={64} color="#94a3b8" />
        <Text className="text-slate-800 text-xl font-bold mt-4 text-center">
          Câmera necessária para escanear
        </Text>
        <Text className="text-slate-500 text-sm mt-2 text-center leading-5">
          Permita o acesso à câmera para ler o QR Code do cupom fiscal.
        </Text>
        <Button title="Permitir câmera" fullWidth onPress={requestPermission} className="mt-6" />
        <TouchableOpacity className="mt-4" onPress={() => { setScanning(false); setPhotoStep('instructions'); }}>
          <Text className="text-primary-600 text-sm font-semibold">Usar foto do cupom</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // 10. Active QR scanner
  if (scanning) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom']}>
        {/* Back button + location indicator */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 }}>
          <TouchableOpacity
            onPress={() => setScanning(false)}
            hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={locCoords ? 'location' : 'location-outline'}
              size={12}
              color={locCoords ? '#4ade80' : '#64748b'}
            />
            <Text style={{ fontSize: 12, color: locCoords ? '#4ade80' : '#64748b' }}>
              {locCoords ? 'Localização obtida' : 'GPS não disponível'}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1, position: 'relative' }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />

          {/* Dark overlay */}
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            <View style={{ flexDirection: 'row', height: 240 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              <View style={{ width: 240 }} />
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            </View>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
          </View>

          {/* Animated corner brackets */}
          <View
            style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
            pointerEvents="none"
          >
            <Animated.View style={{ opacity: cornerOpacity }}>
              <View style={{ width: 240, height: 240 }}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>
            </Animated.View>
          </View>

          {/* Bottom overlay */}
          <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 }}>
            {isPending ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 }}>
                <ActivityIndicator color="white" size="small" />
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Validando cupom...</Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
                  Aponte para o QR Code do cupom
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center' }}>
                  Posicione o QR Code dentro da área demarcada
                </Text>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 11. Landing — two option cards
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 36 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: secondaryColor, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="receipt-outline" size={36} color={primaryColor} />
          </View>
          <Text style={{ color: '#1e293b', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 6 }}>
            Validar Cupom Fiscal
          </Text>
          <Text style={{ color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
            Escolha como deseja validar seu cupom para ganhar cashback
          </Text>
        </View>

        {/* Option 1: QR Code */}
        <TouchableOpacity
          onPress={() => setScanning(true)}
          activeOpacity={0.85}
          style={{
            backgroundColor: secondaryColor,
            borderRadius: 20, padding: 24, marginBottom: 14,
            flexDirection: 'row', alignItems: 'center', gap: 18,
          }}
        >
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="qr-code-outline" size={28} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'white', fontSize: 17, fontWeight: '700', marginBottom: 4 }}>
              📷 Escanear QR Code
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 18 }}>
              Aponte a câmera para o QR Code impresso no cupom fiscal
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>

        {/* Option 2: Foto */}
        <TouchableOpacity
          onPress={() => setPhotoStep('instructions')}
          activeOpacity={0.85}
          style={{
            backgroundColor: 'white',
            borderRadius: 20, padding: 24,
            flexDirection: 'row', alignItems: 'center', gap: 18,
            borderWidth: 1.5, borderColor: '#e2e8f0',
          }}
        >
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="images-outline" size={28} color="#1d4ed8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#1e293b', fontSize: 17, fontWeight: '700', marginBottom: 4 }}>
              🖼️ Fotografar Cupom
            </Text>
            <Text style={{ color: '#64748b', fontSize: 13, lineHeight: 18 }}>
              Use quando o QR Code não funcionar
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Result cards ───────────────────────────────────────────────────────────────

function RedemptionResultCard({ data, onNew }: { data: RedemptionResult; onNew: () => void }) {
  return (
    <View className="mx-4 bg-white rounded-3xl p-8 items-center shadow-sm border border-slate-100">
      <View className="w-20 h-20 rounded-full bg-green-100 items-center justify-center mb-4">
        <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
      </View>
      <Text className="text-slate-800 text-xl font-bold mb-1 text-center">Resgate validado!</Text>
      <Text className="text-slate-500 text-sm mb-6 text-center">Cashback resgatado com sucesso.</Text>

      <View className="w-full bg-slate-50 rounded-2xl p-4 gap-3">
        <InfoRow label="Cliente"         value={data.nomeCliente} />
        <InfoRow label="Valor resgatado" value={data.valorResgatado} highlight />
        <InfoRow label="Novo saldo"      value={data.novoSaldo} />
      </View>

      <Button
        title="Validar outro código"
        fullWidth
        variant="secondary"
        onPress={onNew}
        className="mt-6"
      />
    </View>
  );
}

function NfceResultCard({ data, via, onNew }: { data: NfceResult; via?: 'qr' | 'photo'; onNew: () => void }) {
  const isPendente = data.pendente === true;
  const isPhoto    = via === 'photo';

  return (
    <View className="mx-4 bg-white rounded-3xl p-8 items-center shadow-sm border border-slate-100">
      {isPendente ? (
        <>
          <View className="w-20 h-20 rounded-full bg-yellow-100 items-center justify-center mb-4">
            <Ionicons name={isPhoto ? 'image-outline' : 'time-outline'} size={48} color="#D97706" />
          </View>
          <Text className="text-slate-800 text-xl font-bold mb-1 text-center">
            {isPhoto ? 'Foto enviada para análise' : 'Salvo para validação'}
          </Text>
          <Text className="text-slate-500 text-sm mb-6 text-center leading-5">
            {data.mensagem}
          </Text>
          {(data.codigoCupom || data.transacao?.codigoCupom) && (
            <View className="w-full bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4">
              <Text className="text-yellow-700 text-xs mb-1 text-center">Código de acompanhamento</Text>
              <Text className="text-yellow-900 font-mono font-bold text-center text-base">
                {data.codigoCupom ?? data.transacao?.codigoCupom}
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View className="w-20 h-20 rounded-full bg-green-100 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
          </View>
          <Text className="text-slate-800 text-xl font-bold mb-1 text-center">
            {isPhoto ? 'Cashback gerado via foto!' : 'Cashback gerado!'}
          </Text>
          <Text className="text-slate-500 text-sm mb-6 text-center">
            {isPhoto ? 'Cupom validado com sucesso via fotografia.' : 'Cupom fiscal validado com sucesso.'}
          </Text>

          {data.nota && (
            <View className="w-full bg-slate-50 rounded-2xl p-4 gap-3 mb-3">
              <InfoRow label="Emitente"    value={data.nota.emitente} />
              <InfoRow label="Data"        value={data.nota.dataEmissao} />
              <InfoRow label="Valor total" value={data.nota.valorTotal} />
              {data.nota.litros ? <InfoRow label="Litros" value={data.nota.litros} /> : null}
            </View>
          )}

          {isPhoto && data.dadosExtraidos && (
            <View className="w-full bg-slate-50 rounded-2xl p-4 gap-3 mb-3">
              {data.dadosExtraidos.data && (
                <InfoRow label="Data" value={data.dadosExtraidos.data} />
              )}
              {data.dadosExtraidos.tipoCombustivel && (
                <InfoRow label="Combustível" value={data.dadosExtraidos.tipoCombustivel} />
              )}
              {data.dadosExtraidos.litros != null && (
                <InfoRow label="Litros" value={`${data.dadosExtraidos.litros.toFixed(2)} L`} />
              )}
              <InfoRow
                label="Valor total"
                value={`R$ ${data.dadosExtraidos.total?.toFixed(2).replace('.', ',')}`}
              />
            </View>
          )}

          {data.transacao && (
            <View className="w-full bg-green-50 border border-green-200 rounded-2xl p-4 gap-3">
              <InfoRow label="Cashback gerado" value={data.transacao.cashbackGerado} highlight />
              <InfoRow label="Percentual"      value={data.transacao.percentual} />
              <InfoRow label="Novo saldo"      value={data.transacao.novoSaldo} />
              <InfoRow label="Cupom"           value={data.transacao.codigoCupom} mono />
            </View>
          )}
        </>
      )}

      <Button
        title={isPhoto ? 'Início' : 'Escanear outro cupom'}
        fullWidth
        variant="secondary"
        onPress={onNew}
        className="mt-6"
      />
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function InfoRow({
  label, value, highlight = false, mono = false,
}: {
  label: string; value: string; highlight?: boolean; mono?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-slate-500 text-sm">{label}</Text>
      <Text className={[
        'text-sm font-semibold',
        highlight ? 'text-green-600 text-base' : 'text-slate-700',
        mono ? 'font-mono tracking-wider' : '',
      ].join(' ')}>
        {value}
      </Text>
    </View>
  );
}

const CORNER_SIZE  = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  corner: {
    position:    'absolute',
    width:       CORNER_SIZE,
    height:      CORNER_SIZE,
    borderColor: '#F59E0B',
    borderWidth: 0,
  },
  topLeft: {
    top: 0, left: 0,
    borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 6,
  },
  topRight: {
    top: 0, right: 0,
    borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 6,
  },
  bottomLeft: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: 6,
  },
  bottomRight: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: 6,
  },
});
