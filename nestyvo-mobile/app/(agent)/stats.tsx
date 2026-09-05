import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

type Period = 'month' | '30d' | '7d';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '30d',   label: 'Last 30d' },
  { key: '7d',    label: 'Last 7d' },
];

function useStats(period: Period) {
  return useQuery({
    queryKey: ['agent-stats', period],
    queryFn: () => api.get(`/dashboard/agent/stats?period=${period}`).then((r) => r.data),
    staleTime: 60_000,
  });
}

function fmt$(n: number) {
  return n >= 1000
    ? `$${(n / 1000).toFixed(1)}k`
    : `$${n}`;
}

function MetricBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <View className="flex-1 bg-white rounded-2xl border border-gray-100 p-3.5">
      <Text className="text-xs text-gray-400 font-medium mb-1">{label}</Text>
      <Text className="text-2xl font-bold" style={{ color }}>{value}</Text>
      {sub ? <Text className="text-xs text-gray-400 mt-0.5">{sub}</Text> : null}
    </View>
  );
}

export default function StatsScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const { data, isLoading, refetch, isRefetching } = useStats(period);

  const summary = data?.summary ?? {};
  const providers: any[] = data?.providers ?? [];

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <HomeButton href="/(agent)" />
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Stats & Reports</Text>
          {data?.periodLabel ? (
            <Text className="text-xs text-gray-400 mt-0.5">{data.periodLabel}</Text>
          ) : null}
        </View>
      </View>

      {/* Period selector */}
      <View className="flex-row gap-2 px-5 mb-4">
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => setPeriod(p.key)}
            className={`px-4 py-1.5 rounded-full border ${
              period === p.key
                ? 'bg-primary-600 border-primary-600'
                : 'bg-white border-gray-200'
            }`}
          >
            <Text className={`text-sm font-medium ${period === p.key ? 'text-white' : 'text-gray-600'}`}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <View className="items-center py-16">
            <Text className="text-gray-400">Loading…</Text>
          </View>
        ) : (
          <>
            {/* Revenue recovered hero */}
            <View className="bg-primary-600 rounded-2xl p-5 mb-4">
              <Text className="text-white/70 text-sm font-medium mb-1">Est. Revenue Recovered</Text>
              <Text className="text-white text-4xl font-bold tracking-tight">
                {fmt$(summary.revenueRecovered ?? 0)}
              </Text>
              <Text className="text-white/50 text-xs mt-1">
                {summary.filled ?? 0} filled slot{summary.filled !== 1 ? 's' : ''} × $150/session
              </Text>
            </View>

            {/* Summary metrics row */}
            <View className="flex-row gap-3 mb-3">
              <MetricBox
                label="Scheduled"
                value={summary.scheduled ?? 0}
                sub="appts booked"
                color="#16a34a"
              />
              <MetricBox
                label="Cancellations"
                value={summary.cancellations ?? 0}
                sub="this period"
                color="#dc2626"
              />
            </View>
            <View className="flex-row gap-3 mb-6">
              <MetricBox
                label="Contacts Made"
                value={summary.contactsMade ?? 0}
                sub="call attempts"
                color="#2563eb"
              />
              <MetricBox
                label="Slots Filled"
                value={summary.filled ?? 0}
                sub="from cancellations"
                color="#7c3aed"
              />
            </View>

            {/* Per-provider breakdown */}
            <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              By Provider
            </Text>

            {providers.length === 0 ? (
              <View className="bg-white rounded-2xl border border-gray-100 p-6 items-center">
                <Text className="text-gray-400 text-sm">No data for this period</Text>
              </View>
            ) : (
              providers.map((p: any) => (
                <View key={p.id} className="bg-white rounded-2xl border border-gray-100 mb-3 overflow-hidden">
                  {/* Provider header */}
                  <View className="px-4 pt-4 pb-3 flex-row items-center justify-between border-b border-gray-50">
                    <View className="flex-row items-center gap-3">
                      <View className="w-9 h-9 rounded-full bg-primary-100 items-center justify-center">
                        <Text className="text-primary-700 text-xs font-bold">
                          {p.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text className="text-gray-900 font-semibold text-sm">{p.name}</Text>
                        {p.credentials ? (
                          <Text className="text-gray-400 text-xs">{p.credentials}</Text>
                        ) : null}
                      </View>
                    </View>
                    {/* Revenue chip */}
                    <View className="bg-green-50 border border-green-200 rounded-full px-3 py-1">
                      <Text className="text-green-700 text-xs font-semibold">{fmt$(p.revenueRecovered)}</Text>
                    </View>
                  </View>

                  {/* Metrics grid */}
                  <View className="px-4 py-3 flex-row flex-wrap gap-y-3">
                    <View className="w-1/2">
                      <Text className="text-xs text-gray-400">Scheduled</Text>
                      <Text className="text-gray-900 font-semibold text-base mt-0.5">{p.scheduled}</Text>
                    </View>
                    <View className="w-1/2">
                      <Text className="text-xs text-gray-400">Cancellations</Text>
                      <Text className="text-gray-900 font-semibold text-base mt-0.5">{p.cancellations}</Text>
                    </View>
                    <View className="w-1/2">
                      <Text className="text-xs text-gray-400">Contacts made</Text>
                      <Text className="text-gray-900 font-semibold text-base mt-0.5">{p.contactsMade}</Text>
                    </View>
                    <View className="w-1/2">
                      <Text className="text-xs text-gray-400">Fill rate</Text>
                      <Text className="text-gray-900 font-semibold text-base mt-0.5">
                        {p.fillRate !== null ? `${p.fillRate}%` : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}

            <Text className="text-xs text-gray-300 text-center mt-2">
              Revenue estimate based on $150/session · Configurable per provider soon
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
