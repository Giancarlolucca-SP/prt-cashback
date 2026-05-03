import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, Alert, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { useAuthStore } from '../../src/store/auth';
import { useAppConfig } from '../../src/context/AppConfigContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskCpf(cpf: string): string {
  // "123.456.789-01" → "123.***.***-01"
  return cpf.replace(/(\d{3})\.\d{3}\.\d{3}(-\d{2})/, '$1.***.***$2');
}

function maskPhone(phone: string): string {
  if (phone.length >= 10) {
    return `(${phone.slice(0, 2)}) ****-${phone.slice(-4)}`;
  }
  return phone;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={{
      color: '#64748b',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 8,
    }}>
      {title}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: 'white',
      marginHorizontal: 16,
      borderRadius: 16,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: '#f1f5f9',
    }}>
      {children}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
    }}>
      <Text style={{ color: '#64748b', fontSize: 14 }}>{label}</Text>
      <Text style={{ color: '#1e293b', fontSize: 14, fontWeight: '600', maxWidth: '60%', textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

function ActionRow({
  emoji, label, sublabel, onPress,
}: {
  emoji: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 }}
      activeOpacity={0.7}
    >
      <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#1e293b', fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {sublabel ? (
          <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 1 }}>{sublabel}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConfiguracoesScreen() {
  const { user, logout } = useAuthStore();
  const { config } = useAppConfig();
  const queryClient = useQueryClient();

  const [notificacoes, setNotificacoes] = useState(true);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const cpfMascarado   = user?.cpf      ? maskCpf(user.cpf)       : '—';
  const telefoneMask   = user?.telefone ? maskPhone(user.telefone) : '—';

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleLogout() {
    Alert.alert(
      'Sair da conta',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await logout();
            queryClient.clear();
            router.replace('/(auth)/login');
          },
        },
      ],
    );
  }

  function handlePrivacidade() {
    Alert.alert(
      'Privacidade — LGPD',
      'Seus dados pessoais (nome, CPF, telefone) são coletados exclusivamente para identificação e geração de cashback, conforme a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).\n\nSeus dados não são compartilhados com terceiros sem seu consentimento.\n\nPara solicitar exclusão da conta, entre em contato com o suporte.',
      [{ text: 'Entendi' }],
    );
  }

  function handleSuporte() {
    const numero = config.supportWhatsApp;
    if (!numero) {
      Alert.alert('Suporte', 'Número de suporte não configurado neste estabelecimento.');
      return;
    }
    Linking.openURL(`https://wa.me/${numero}`).catch(() =>
      Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.')
    );
  }

  function handleTermos() {
    if (!config.termsUrl) return;
    Linking.openURL(config.termsUrl).catch(() =>
      Alert.alert('Erro', 'Não foi possível abrir os termos de uso.')
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={{
        backgroundColor: '#1e3a5f',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', flex: 1 }}>
          Configurações
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Meus dados ───────────────────────────────────────────────── */}
        <SectionTitle title="👤  Meus dados" />
        <Card>
          <InfoRow label="Nome"     value={user?.nome ?? '—'} />
          <Divider />
          <InfoRow label="CPF"      value={cpfMascarado} />
          <Divider />
          <InfoRow label="Telefone" value={telefoneMask} />
          <Divider />
          <InfoRow label="Posto"    value={config.postoName} />
        </Card>

        {/* ── Notificações ──────────────────────────────────────────────── */}
        <SectionTitle title="🔔  Notificações" />
        <Card>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#1e293b', fontSize: 14, fontWeight: '600' }}>
                Notificações push
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                Cashback creditado, resgates e alertas
              </Text>
            </View>
            <Switch
              value={notificacoes}
              onValueChange={setNotificacoes}
              trackColor={{ false: '#e2e8f0', true: '#1e3a5f' }}
              thumbColor={notificacoes ? '#F59E0B' : '#f4f3f4'}
            />
          </View>
        </Card>

        {/* ── Privacidade ───────────────────────────────────────────────── */}
        <SectionTitle title="🔒  Privacidade" />
        <Card>
          <ActionRow
            emoji="📋"
            label="Política de privacidade (LGPD)"
            sublabel="Como seus dados são usados"
            onPress={handlePrivacidade}
          />
          {config.termsUrl ? (
            <>
              <Divider />
              <ActionRow
                emoji="📄"
                label="Termos de uso"
                sublabel="Leia os termos do programa"
                onPress={handleTermos}
              />
            </>
          ) : null}
        </Card>

        {/* ── Sobre o app ───────────────────────────────────────────────── */}
        <SectionTitle title="ℹ️  Sobre o app" />
        <Card>
          <InfoRow label="Versão"    value={`v${appVersion}`} />
          <Divider />
          <InfoRow label="Aplicativo" value={config.appName} />
          {config.supportWhatsApp ? (
            <>
              <Divider />
              <ActionRow
                emoji="💬"
                label="Suporte via WhatsApp"
                sublabel="Fale com o posto"
                onPress={handleSuporte}
              />
            </>
          ) : null}
        </Card>

        {/* ── Sair ──────────────────────────────────────────────────────── */}
        <View style={{ marginHorizontal: 16, marginTop: 32 }}>
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.8}
            style={{
              backgroundColor: 'white',
              borderRadius: 16,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderColor: '#fee2e2',
            }}
          >
            <Text style={{ fontSize: 20 }}>🚪</Text>
            <Text style={{ color: '#dc2626', fontSize: 15, fontWeight: '700', flex: 1 }}>
              Sair da conta
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#fca5a5" />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
