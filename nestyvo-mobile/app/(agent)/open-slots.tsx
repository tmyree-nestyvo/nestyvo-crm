import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

const TZ = 'America/Los_Angeles';
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

function useProviders(days: number) {
  return useQuery({
    queryKey: ['agent-dashboard', days],
    queryFn: () => api.get('/dashboard/agent', { params: { days } }).then((r) => r.data),
    staleTime: 60_000,
  });
}

const DAY_OPTIONS = [7, 14, 30] as const;

function initialsFor(name: string) {
  return name
    .split(' ')
    .filter((w: string) => !['Dr.', 'Dr'].includes(w))
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function FillButton({ providerId, providerName, slot }: { providerId: string; providerName: string; slot: any }) {
  return (
    <TouchableOpacity
      onPress={() =>
        router.push({
          pathname: '/(agent)/fill-slot',
          params: {
            providerId,
            providerName,
            slotStartAt: slot.startAt,
            slotEndAt: slot.endAt,
          },
        })
      }
      className="flex-row items-center gap-1 bg-primary-50 border border-primary-100 px-3 py-1.5 rounded-full"
    >
      <Ionicons name="people-outline" size={12} color="#2563eb" />
      <Text className="text-primary-700 text-xs font-semibold">Fill</Text>
    </TouchableOpacity>
  );
}

export default function OpenSlotsScreen() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, refetch, isRefetching } = useProviders(days);
  const providers: any[] = data?.providers ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(providers[0]?.id ?? null);
  const [viewMode, setViewMode] = useState<'provider' | 'chronological'>('provider');

  const totalSlots: number = data?.totalOpenSlots ?? 0;

  // Flatten every provider's slots into one nearest-first list across all partners
  const chronoDays = useMemo(() => {
    const byDate: Record<string, { dateLabel: string; items: any[] }> = {};
    for (const provider of providers) {
      for (const day of provider.slotsByDate ?? []) {
        if (!byDate[day.date]) byDate[day.date] = { dateLabel: day.dateLabel, items: [] };
        for (const slot of day.slots) {
          byDate[day.date].items.push({ slot, providerId: provider.id, providerName: provider.name, credentials: provider.credentials });
        }
      }
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({
        date,
        dateLabel: v.dateLabel,
        items: v.items.sort((a, b) => new Date(a.slot.startAt).getTime() - new Date(b.slot.startAt).getTime()),
      }));
  }, [providers]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Open Slots</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {totalSlots} available · next {days} days
          </Text>
        </View>
        <HomeButton href="/(agent)" />
      </View>

      {/* View toggle */}
      <View className="px-5 pb-2 flex-row">
        <View className="flex-row bg-gray-100 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setViewMode('provider')}
            className={`px-3.5 py-1.5 rounded-lg ${viewMode === 'provider' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`text-xs font-semibold ${viewMode === 'provider' ? 'text-gray-900' : 'text-gray-500'}`}>
              By Provider
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('chronological')}
            className={`px-3.5 py-1.5 rounded-lg ${viewMode === 'chronological' ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`text-xs font-semibold ${viewMode === 'chronological' ? 'text-gray-900' : 'text-gray-500'}`}>
              Nearest First
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Time-frame toggle */}
      <View className="px-5 pb-3 flex-row gap-2">
        {DAY_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => setDays(d)}
            className={`px-3 py-1 rounded-full border ${days === d ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
          >
            <Text className={`text-xs font-medium ${days === d ? 'text-white' : 'text-gray-600'}`}>
              Next {d} days
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <View className="items-center py-12">
            <Text className="text-gray-400">Loading…</Text>
          </View>
        ) : providers.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
            <Text className="text-gray-500 font-semibold mt-3">No open slots</Text>
            <Text className="text-gray-400 text-sm mt-1">All providers are fully booked.</Text>
          </View>
        ) : viewMode === 'chronological' ? (
          chronoDays.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
              <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
              <Text className="text-gray-500 font-semibold mt-3">No open slots</Text>
              <Text className="text-gray-400 text-sm mt-1">All providers are fully booked.</Text>
            </View>
          ) : (
            chronoDays.map((day) => (
              <View key={day.date} className="mb-4">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {day.dateLabel}
                </Text>
                <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {day.items.map((item, i) => (
                    <View
                      key={`${item.providerId}-${item.slot.startAt}`}
                      className={`flex-row items-center px-4 py-3 gap-3 ${
                        i < day.items.length - 1 ? 'border-b border-gray-50' : ''
                      }`}
                    >
                      <View className="w-8 h-8 rounded-full bg-primary-100 items-center justify-center flex-shrink-0">
                        <Text className="text-primary-700 text-xs font-bold">{initialsFor(item.providerName)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-gray-900 font-semibold text-sm">
                          {fmt(item.slot.startAt)} – {fmt(item.slot.endAt)}
                        </Text>
                        <Text className="text-gray-400 text-xs mt-0.5">
                          {item.providerName}{item.credentials ? ` ${item.credentials}` : ''}
                        </Text>
                      </View>
                      <FillButton providerId={item.providerId} providerName={item.providerName} slot={item.slot} />
                    </View>
                  ))}
                </View>
              </View>
            ))
          )
        ) : (
          providers.map((provider: any) => {
            const expanded = expandedId === provider.id;
            const slotsByDate: any[] = provider.slotsByDate ?? [];
            const count: number = provider.openSlotCount ?? 0;
            const initials = initialsFor(provider.name);

            return (
              <View key={provider.id} className="mb-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <TouchableOpacity
                  onPress={() => setExpandedId(expanded ? null : provider.id)}
                  activeOpacity={0.7}
                  className="px-4 py-3.5 flex-row items-center gap-3"
                >
                  <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center flex-shrink-0">
                    <Text className="text-primary-700 text-sm font-bold">{initials}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-sm">{provider.name}</Text>
                    {provider.credentials ? (
                      <Text className="text-gray-400 text-xs mt-0.5">{provider.credentials}</Text>
                    ) : null}
                  </View>
                  <View className="bg-green-50 border border-green-200 rounded-full px-3 py-0.5 flex-row items-center gap-1 mr-1">
                    <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <Text className="text-green-700 text-xs font-semibold">
                      {count} {count === 1 ? 'slot' : 'slots'}
                    </Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
                </TouchableOpacity>

                {expanded && (
                  <View className="border-t border-gray-100">
                    {slotsByDate.length === 0 ? (
                      <View className="px-4 py-4 items-center">
                        <Text className="text-gray-400 text-sm">No open slots in the next {days} days</Text>
                      </View>
                    ) : (
                      slotsByDate.map((day: any) => (
                        <View key={day.date}>
                          <View className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex-row items-center justify-between">
                            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {day.dateLabel}
                            </Text>
                            <Text className="text-xs text-gray-400">
                              {day.slots.length} slot{day.slots.length !== 1 ? 's' : ''}
                            </Text>
                          </View>
                          {day.slots.map((slot: any, i: number) => (
                            <View
                              key={slot.startAt}
                              className={`flex-row items-center px-4 py-3 gap-3 ${
                                i < day.slots.length - 1 ? 'border-b border-gray-50' : ''
                              }`}
                            >
                              <View className="flex-1">
                                <Text className="text-gray-900 font-semibold text-sm">
                                  {fmt(slot.startAt)} – {fmt(slot.endAt)}
                                </Text>
                                <Text className="text-gray-400 text-xs mt-0.5">{slot.durationMin} min</Text>
                              </View>
                              <View className="flex-row items-center gap-1.5 mr-2">
                                <View className="w-2 h-2 rounded-full bg-green-400" />
                                <Text className="text-green-700 text-xs font-medium">Open</Text>
                              </View>
                              <FillButton providerId={provider.id} providerName={provider.name} slot={slot} />
                            </View>
                          ))}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
