import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Animated,
  TextInput,
  Pressable,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import StatementItem, { StatementEntry } from '../../src/components/StatementItem';
import { customerApi } from '../../src/api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'abastecimentos' | 'extrato';
type FilterPeriod = 'month' | '3months' | 'custom';

interface HistEntry {
  id:                string;
  codigoCupom:       string | null;
  valor:             number | null;
  valorFormatado:    string | null;
  cashbackPercent:   number | null;
  cashbackGerado:    number | null;
  cashbackFormatado: string | null;
  tipoCombustivel:   string | null;
  litros:            number | null;
  data:              string | null;
  dataISO:           string | null;
  status?:           string;
}

interface StmtResumo {
  totalCreditos:          number;
  totalCreditosFormatado: string;
  totalDebitos:           number;
  totalDebitosFormatado:  string;
  saldoPeriodo:           number;
  saldoPeriodoFormatado:  string;
}

interface ActiveFilter {
  label: string;
  from:  Date | null;
  to:    Date | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FUEL_LABELS: Record<string, string> = {
  gasoline:         'Gasolina',
  ethanol:          'Etanol',
  diesel:           'Diesel',
  gnv:              'GNV',
  carWash:          'Lavagem',
  convenienceStore: 'Conveniência',
};

const FUEL_ICONS: Record<string, string> = {
  gasoline:         '🟡',
  ethanol:          '🟢',
  diesel:           '🔵',
  gnv:              '⚪',
  carWash:          '🚿',
  convenienceStore: '🛒',
};

const FILTER_OPTIONS: { key: FilterPeriod; label: string }[] = [
  { key: 'month',    label: 'Último mês'          },
  { key: '3months',  label: 'Últimos 3 meses'      },
  { key: 'custom',   label: 'Data personalizada'   },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseCustomDate(ddmmaaaa: string): Date | null {
  const parts = ddmmaaaa.split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, aaaa] = parts;
  if (!aaaa || aaaa.length < 4) return null;
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
}

function filterByDate<T extends { dataISO?: string | null }>(
  items: T[],
  filter: ActiveFilter | null,
): T[] {
  if (!filter) return items;
  return items.filter((item) => {
    if (!item.dataISO) return true;
    const d = new Date(item.dataISO);
    if (filter.from && d < filter.from) return false;
    if (filter.to   && d > filter.to)   return false;
    return true;
  });
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HistoricoScreen() {
  const [activeTab,     setActiveTab]     = useState<Tab>('abastecimentos');
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterPeriod,  setFilterPeriod]  = useState<FilterPeriod | null>(null);
  const [customFrom,    setCustomFrom]    = useState('');
  const [customTo,      setCustomTo]      = useState('');
  const [activeFilter,  setActiveFilter]  = useState<ActiveFilter | null>(null);

  const slideAnim = useRef(new Animated.Value(500)).current;

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: histData, isFetching: histFetching, refetch: refetchHist,
  } = useQuery({
    queryKey: ['history', 1],
    queryFn:  () => customerApi.getHistory(1).then((r) => r.data),
  });

  const {
    data: stmtData, isFetching: stmtFetching, refetch: refetchStmt,
  } = useQuery({
    queryKey: ['statement', 1],
    queryFn:  () => customerApi.getStatement(1).then((r) => r.data),
  });

  // ── Filter sheet ───────────────────────────────────────────────────────────

  function openFilter() {
    setFilterVisible(true);
    slideAnim.setValue(500);
    Animated.spring(slideAnim, {
      toValue: 0, tension: 80, friction: 13, useNativeDriver: true,
    }).start();
  }

  function closeFilter() {
    Animated.timing(slideAnim, {
      toValue: 500, duration: 220, useNativeDriver: true,
    }).start(() => setFilterVisible(false));
  }

  function applyFilter() {
    if (!filterPeriod) {
      setActiveFilter(null);
      closeFilter();
      return;
    }

    const now = new Date();
    let from: Date | null = null;
    let to: Date | null   = null;
    let label             = '';

    if (filterPeriod === 'month') {
      from  = new Date(now.getFullYear(), now.getMonth(), 1);
      to    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      label = 'Último mês';
    } else if (filterPeriod === '3months') {
      from  = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      label = 'Últimos 3 meses';
    } else if (filterPeriod === 'custom') {
      from        = customFrom ? parseCustomDate(customFrom) : null;
      const rawTo = customTo   ? parseCustomDate(customTo)   : null;
      to          = rawTo
        ? new Date(rawTo.getFullYear(), rawTo.getMonth(), rawTo.getDate(), 23, 59, 59)
        : null;
      label = `${customFrom || '?'} – ${customTo || '?'}`;
    }

    setActiveFilter({ label, from, to });
    closeFilter();
  }

  function clearFilter() {
    setActiveFilter(null);
    setFilterPeriod(null);
    setCustomFrom('');
    setCustomTo('');
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const allHist: HistEntry[]      = histData?.transacoes ?? [];
  const allStmt: StatementEntry[] = stmtData?.entradas   ?? [];
  const resumo: StmtResumo | null = stmtData?.resumo     ?? null;

  const histEntries = filterByDate(allHist, activeFilter);
  const stmtEntries = filterByDate(allStmt, activeFilter);

  const isFetching   = activeTab === 'abastecimentos' ? histFetching : stmtFetching;
  const refetchCurr  = activeTab === 'abastecimentos' ? refetchHist  : refetchStmt;
  const isInitialLoad = isFetching && (activeTab === 'abastecimentos' ? !histData : !stmtData);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['bottom']}>

      {/* ── Tab bar + filter button ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8,
      }}>
        <View style={{
          flex: 1, flexDirection: 'row',
          backgroundColor: '#e2e8f0', borderRadius: 13, padding: 3,
        }}>
          {(['abastecimentos', 'extrato'] as Tab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
                style={{
                  flex: 1, paddingVertical: 8,
                  borderRadius: 10, alignItems: 'center',
                  backgroundColor: isActive ? 'white' : 'transparent',
                }}
              >
                <Text style={{
                  fontSize: 13, fontWeight: '600',
                  color: isActive ? '#1e3a5f' : '#64748b',
                }}>
                  {tab === 'abastecimentos' ? 'Abastecimentos' : 'Extrato Cashback'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={openFilter}
          hitSlop={8}
          activeOpacity={0.8}
          style={{
            width: 40, height: 40, borderRadius: 13,
            backgroundColor: activeFilter ? '#1e3a5f' : '#f1f5f9',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeFilter ? 'white' : '#64748b'}
          />
        </TouchableOpacity>
      </View>

      {/* ── Active filter pill ── */}
      {activeFilter ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
            backgroundColor: '#dbeafe', paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 20, gap: 6,
          }}>
            <Ionicons name="calendar-outline" size={13} color="#1d4ed8" />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#1d4ed8' }}>
              {activeFilter.label}
            </Text>
            <TouchableOpacity onPress={clearFilter} hitSlop={6}>
              <Ionicons name="close-circle" size={16} color="#1d4ed8" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* ── Content ── */}
      {isInitialLoad ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#1e3a5f" size="large" />
        </View>
      ) : activeTab === 'abastecimentos' ? (
        <FlatList
          data={histEntries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FuelItem item={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 }}
          refreshControl={
            <RefreshControl refreshing={histFetching} onRefresh={refetchHist} tintColor="#1e3a5f" />
          }
          ListHeaderComponent={
            <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>
              {histEntries.length}{' '}
              {histEntries.length === 1 ? 'abastecimento' : 'abastecimentos'}
            </Text>
          }
          ListEmptyComponent={
            !histFetching ? (
              <EmptyState
                message={
                  activeFilter
                    ? 'Nenhum abastecimento neste período.'
                    : 'Nenhum abastecimento registrado ainda.'
                }
              />
            ) : null
          }
        />
      ) : (
        <FlatList
          data={stmtEntries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <StatementItem item={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 4 }}
          refreshControl={
            <RefreshControl refreshing={stmtFetching} onRefresh={refetchStmt} tintColor="#1e3a5f" />
          }
          ListHeaderComponent={
            resumo ? <ExtratoHeader resumo={resumo} count={stmtEntries.length} /> : null
          }
          ListEmptyComponent={
            !stmtFetching ? (
              <EmptyState
                message={
                  activeFilter
                    ? 'Nenhum lançamento neste período.'
                    : 'Nenhuma movimentação registrada ainda.'
                }
              />
            ) : null
          }
        />
      )}

      {/* ── Filter bottom sheet ── */}
      <Modal
        visible={filterVisible}
        transparent
        animationType="none"
        onRequestClose={closeFilter}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
            onPress={closeFilter}
          />
          <Animated.View style={{
            backgroundColor: 'white',
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: Platform.OS === 'ios' ? 44 : 28,
            transform: [{ translateY: slideAnim }],
          }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', marginBottom: 18 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' }} />
            </View>

            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 20,
            }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>
                Filtrar por período
              </Text>
              <TouchableOpacity onPress={closeFilter} hitSlop={8}>
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Period options */}
            {FILTER_OPTIONS.map(({ key, label }, idx) => (
              <TouchableOpacity
                key={key}
                onPress={() => setFilterPeriod(key)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingVertical: 14,
                  borderBottomWidth: idx < FILTER_OPTIONS.length - 1 ? 1 : 0,
                  borderBottomColor: '#f1f5f9',
                }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  borderWidth: 2,
                  borderColor: filterPeriod === key ? '#1e3a5f' : '#cbd5e1',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {filterPeriod === key && (
                    <View style={{
                      width: 10, height: 10, borderRadius: 5,
                      backgroundColor: '#1e3a5f',
                    }} />
                  )}
                </View>
                <Text style={{ fontSize: 14, color: '#1e293b', fontWeight: '500', flex: 1 }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Custom date inputs */}
            {filterPeriod === 'custom' && (
              <View style={{ marginTop: 16, flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 11, fontWeight: '700', color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
                  }}>
                    De
                  </Text>
                  <TextInput
                    value={customFrom}
                    onChangeText={setCustomFrom}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor="#cbd5e1"
                    keyboardType="numeric"
                    maxLength={10}
                    style={{
                      borderWidth: 1, borderColor: '#e2e8f0',
                      borderRadius: 12, padding: 12,
                      fontSize: 14, color: '#1e293b',
                      backgroundColor: '#f8fafc',
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 11, fontWeight: '700', color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
                  }}>
                    Até
                  </Text>
                  <TextInput
                    value={customTo}
                    onChangeText={setCustomTo}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor="#cbd5e1"
                    keyboardType="numeric"
                    maxLength={10}
                    style={{
                      borderWidth: 1, borderColor: '#e2e8f0',
                      borderRadius: 12, padding: 12,
                      fontSize: 14, color: '#1e293b',
                      backgroundColor: '#f8fafc',
                    }}
                  />
                </View>
              </View>
            )}

            {/* Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
              <TouchableOpacity
                onPress={() => { clearFilter(); closeFilter(); }}
                activeOpacity={0.8}
                style={{
                  flex: 1, paddingVertical: 14,
                  borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 14 }}>Limpar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applyFilter}
                activeOpacity={0.85}
                style={{
                  flex: 1, paddingVertical: 14,
                  borderRadius: 14, backgroundColor: '#1e3a5f',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── ExtratoHeader ──────────────────────────────────────────────────────────────

function ExtratoHeader({ resumo, count }: { resumo: StmtResumo; count: number }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{
        backgroundColor: '#1e3a5f',
        borderRadius: 20, padding: 20, marginBottom: 12,
      }}>
        <Text style={{
          color: 'rgba(255,255,255,0.55)', fontSize: 11,
          textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
        }}>
          Saldo do período
        </Text>
        <Text style={{
          fontSize: 30, fontWeight: '800', marginBottom: 16,
          color: resumo.saldoPeriodo >= 0 ? 'white' : '#fca5a5',
        }}>
          {resumo.saldoPeriodo >= 0 ? '+' : ''}{resumo.saldoPeriodoFormatado}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{
            flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: 14, padding: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: 'rgba(74,222,128,0.25)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="arrow-down" size={10} color="#4ade80" />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
                Cashback recebido
              </Text>
            </View>
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
              {resumo.totalCreditosFormatado}
            </Text>
          </View>

          <View style={{
            flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: 14, padding: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: 'rgba(248,113,113,0.25)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="arrow-up" size={10} color="#f87171" />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
                Total resgatado
              </Text>
            </View>
            <Text style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>
              {resumo.totalDebitosFormatado}
            </Text>
          </View>
        </View>
      </View>

      <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6 }}>
        {count} {count === 1 ? 'lançamento' : 'lançamentos'}
      </Text>
    </View>
  );
}

// ── FuelItem ───────────────────────────────────────────────────────────────────

function FuelItem({ item }: { item: HistEntry }) {
  const fuelKey   = item.tipoCombustivel;
  const fuelLabel = fuelKey ? (FUEL_LABELS[fuelKey] ?? fuelKey) : 'Combustível';
  const fuelIcon  = fuelKey ? (FUEL_ICONS[fuelKey]  ?? '⛽')    : '⛽';
  const isPending = item.status === 'PENDING_VALIDATION';

  const time = item.dataISO
    ? new Date(item.dataISO).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  return (
    <View style={{
      backgroundColor: 'white',
      borderRadius: 18, padding: 16, marginBottom: 10,
      borderWidth: 1,
      borderColor: isPending ? '#fef3c7' : '#f1f5f9',
    }}>
      {/* Top row */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 10,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Text style={{ fontSize: 22 }}>{fuelIcon}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={{ color: '#1e293b', fontSize: 14, fontWeight: '700' }}>{fuelLabel}</Text>
              {isPending && (
                <View style={{
                  backgroundColor: '#fef3c7', paddingHorizontal: 8,
                  paddingVertical: 2, borderRadius: 20,
                }}>
                  <Text style={{
                    color: '#92400e', fontSize: 10, fontWeight: '700',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    Pendente
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 1 }}>
              {item.data ?? 'N/A'} às {time}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: '#1e293b', fontSize: 15, fontWeight: '700' }}>
            {item.valorFormatado ?? '—'}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 11 }}>pago</Text>
        </View>
      </View>

      {/* Pills */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill
          icon="leaf-outline"
          label={`${item.cashbackFormatado ?? 'R$ 0,00'} cashback`}
          color="green"
        />
        {item.cashbackPercent != null && (
          <Pill
            icon="stats-chart-outline"
            label={`${item.cashbackPercent.toFixed(1)}%`}
            color="blue"
          />
        )}
        {item.litros != null && item.litros > 0 && (
          <Pill
            icon="water-outline"
            label={`${item.litros.toFixed(2)} L`}
            color="slate"
          />
        )}
      </View>

      {/* Coupon */}
      {item.codigoCupom ? (
        <View style={{
          marginTop: 10, paddingTop: 10,
          borderTopWidth: 1, borderTopColor: '#f1f5f9',
          flexDirection: 'row', alignItems: 'center', gap: 5,
        }}>
          <Ionicons name="receipt-outline" size={12} color="#94a3b8" />
          <Text style={{
            color: '#94a3b8', fontSize: 11,
            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
          }}>
            {item.codigoCupom}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Pill ───────────────────────────────────────────────────────────────────────

function Pill({
  icon, label, color,
}: { icon: string; label: string; color: 'green' | 'blue' | 'slate' }) {
  const bg        = { green: '#f0fdf4', blue: '#eff6ff', slate: '#f1f5f9'  }[color];
  const textColor = { green: '#15803d', blue: '#1d4ed8', slate: '#475569'  }[color];
  const iconColor = { green: '#16a34a', blue: '#2563eb', slate: '#64748b'  }[color];
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: 20,
    }}>
      <Ionicons name={icon as any} size={11} color={iconColor} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: textColor }}>{label}</Text>
    </View>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <View style={{
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 60, paddingHorizontal: 32,
    }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
      <Text style={{
        color: '#64748b', fontSize: 14,
        textAlign: 'center', fontWeight: '500',
      }}>
        {message}
      </Text>
      <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
        Puxe para baixo para atualizar.
      </Text>
    </View>
  );
}
