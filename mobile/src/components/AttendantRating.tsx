import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Image,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Button from './ui/Button';
import { ratingApi, type Attendant } from '../api/client';

const AVATAR_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#06B6D4'];

export interface DetectedAttendant {
  key:      string;
  name:     string;
  code?:    string | null;
  photoUrl?: string | null;
  matched?: boolean;
}

function initials(name?: string) {
  return (name || '?')
    .split(/[\s-]+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function PhotoAvatar({ name, photoUrl, color, size = 72 }: { name?: string; photoUrl?: string | null; color: string; size?: number }) {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="border border-slate-200"
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
      className="items-center justify-center"
    >
      <Text style={{ fontSize: size * 0.34 }} className="text-white font-bold">{initials(name)}</Text>
    </View>
  );
}

/**
 * Customer-facing "Avalie seu atendimento" card.
 * - When `attendant` is provided (auto-detected from the cupom), shows that
 *   frentista's photo + name and lets the customer rate directly.
 * - Otherwise falls back to the manual picker (list from GET /ratings/attendants).
 */
export default function AttendantRating({
  transactionId,
  attendant,
  onDone,
  onSubmitted,
}: {
  transactionId: string;
  attendant?: DetectedAttendant | null;
  onDone: () => void;
  onSubmitted?: () => void;
}) {
  const queryClient = useQueryClient();
  const preDetected = !!attendant?.key;

  const [manualMode, setManualMode] = useState(!preDetected);
  const [selectedKey, setSelectedKey] = useState<string | null>(attendant?.key ?? null);
  const [stars, setStars]       = useState(0);
  const [comment, setComment]   = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['rating-attendants'],
    queryFn:  () => ratingApi.getAttendants().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled:   manualMode,
  });
  const attendants: Attendant[] = data?.atendentes ?? [];

  // The attendant currently selected in manual mode (to show its photo in the header)
  const selectedManual = attendants.find((a) => a.key === selectedKey);

  // isPending only flips after this state update is committed — a fast
  // double-tap before that re-render can still fire submit() twice, same gap
  // fixed elsewhere this session (e.g. mobile/app/(tabs)/abastecer.tsx).
  const submittingRef = useRef(false);

  const { mutate: submit, isPending } = useMutation({
    mutationFn: () =>
      ratingApi.submit({
        attendantCode: selectedKey!,
        stars,
        comment: comment.trim() || undefined,
        transactionId,
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['history'] });
      onSubmitted?.();
    },
    onError: (err: any) => {
      submittingRef.current = false;
      Alert.alert('Erro', err.response?.data?.erro ?? 'Não foi possível enviar a avaliação.');
    },
  });

  function handleSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    submit();
  }

  // ── Thank-you state ──
  if (submitted) {
    return (
      <View className="bg-white rounded-3xl p-8 w-full items-center shadow-sm border border-slate-100">
        <Text className="text-3xl mb-2">⭐</Text>
        <Text className="text-slate-800 text-lg font-bold mb-1 text-center">
          Obrigado pelo seu feedback!
        </Text>
        <Text className="text-slate-500 text-sm mb-6 text-center">
          Sua avaliação ajuda a melhorar nosso atendimento.
        </Text>
        <Button title="Concluir" fullWidth variant="secondary" onPress={onDone} />
      </View>
    );
  }

  // Manual mode with no attendants at all → nothing to rate
  if (manualMode && !isLoading && attendants.length === 0 && !preDetected) {
    return (
      <View className="bg-white rounded-3xl p-6 w-full items-center shadow-sm border border-slate-100">
        <Text className="text-slate-500 text-sm text-center mb-4">
          Nenhum atendente disponível para avaliação.
        </Text>
        <Button title="Fechar" fullWidth variant="secondary" onPress={onDone} />
      </View>
    );
  }

  const canSubmit = !!selectedKey && stars > 0;

  // Header attendant (detected, or the one picked in manual mode)
  const headerAttendant: DetectedAttendant | null = !manualMode
    ? (attendant ?? null)
    : (selectedManual
        ? { key: selectedManual.key, name: selectedManual.name, code: selectedManual.code, photoUrl: selectedManual.photoUrl }
        : null);

  return (
    <View className="bg-white rounded-3xl p-6 w-full shadow-sm border border-slate-100">
      <Text className="text-slate-800 text-lg font-bold text-center mb-1">
        Avalie seu atendimento
      </Text>

      {/* Detected / selected attendant header */}
      {headerAttendant ? (
        <View className="items-center mb-4 mt-2">
          <PhotoAvatar name={headerAttendant.name} photoUrl={headerAttendant.photoUrl} color={AVATAR_COLORS[0]} />
          <Text className="text-slate-800 text-base font-bold mt-2">{headerAttendant.name}</Text>
          {!!headerAttendant.code && <Text className="text-xs text-slate-400">#{headerAttendant.code}</Text>}
          {!manualMode && (
            <TouchableOpacity onPress={() => setManualMode(true)} className="mt-1.5">
              <Text className="text-primary-600 text-xs font-semibold">Não é este atendente?</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <Text className="text-slate-500 text-sm text-center mb-4">Escolha o frentista e dê sua nota.</Text>
      )}

      {/* Manual picker */}
      {manualMode && (
        isLoading ? (
          <Text className="text-slate-400 text-sm text-center mb-4">Carregando atendentes…</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 px-1 pb-2"
            className="mb-4"
          >
            {attendants.map((att, idx) => {
              const active = selectedKey === att.key;
              const color  = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              return (
                <TouchableOpacity
                  key={att.key}
                  onPress={() => setSelectedKey(att.key)}
                  className="items-center w-[72px]"
                  activeOpacity={0.8}
                >
                  <View className={['rounded-full', active ? 'border-4 border-primary-600' : 'border-4 border-transparent'].join(' ')}>
                    <PhotoAvatar name={att.name} photoUrl={att.photoUrl} color={color} size={56} />
                  </View>
                  <Text numberOfLines={1} className={`text-xs mt-1.5 text-center ${active ? 'text-primary-700 font-bold' : 'text-slate-600'}`}>
                    {att.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )
      )}

      {/* Stars */}
      <View className="flex-row items-center justify-center gap-2 mb-5">
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => { setStars(n); Haptics.selectionAsync(); }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={n <= stars ? 'star' : 'star-outline'}
              size={38}
              color={n <= stars ? '#F59E0B' : '#CBD5E1'}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* Optional comment */}
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Quer deixar um comentário? (opcional)"
        placeholderTextColor="#94a3b8"
        multiline
        maxLength={1000}
        className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-slate-700 text-sm min-h-[88px] mb-5"
        textAlignVertical="top"
      />

      <Button
        title="Enviar avaliação"
        fullWidth
        loading={isPending}
        disabled={!canSubmit}
        onPress={handleSubmit}
      />

      <TouchableOpacity onPress={onDone} className="mt-3 py-2" activeOpacity={0.7}>
        <Text className="text-slate-400 text-sm text-center font-medium">Agora não</Text>
      </TouchableOpacity>
    </View>
  );
}
