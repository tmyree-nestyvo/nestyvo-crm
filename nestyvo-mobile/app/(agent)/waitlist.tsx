import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

function useWaitlist() {
  return useQuery({
    queryKey: ['agent-waitlist'],
    queryFn: () => api.get('/dashboard/agent/waitlist').then((r) => r.data),
    staleTime: 30_000,
  });
}

const TYPE_CONFIG = {
  urgent:      { label: 'Urgent',      color: '#dc2626', bg: '#fef2f2' },
  new_patient: { label: 'New patient', color: '#2563eb', bg: '#eff6ff' },
  followup:    { label: 'Follow-up',   color: '#7c3aed', bg: '#f5f3ff' },
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WaitlistScreen() {
  const { data = [], isLoading, refetch, isRefetching } = useWaitlist();

  // Group by provider
  const byProvider: Record<string, { provider: any; entries: any[] }> = {};
  for (const entry of data) {
    const pid = entry.provider.id;
    if (!byProvider[pid]) byProvider[pid] = { provider: entry.provider, entries: [] };
    byProvider[pid].entries.push(entry);
  }
  const groups = Object.values(byProvider);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Waitlist</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {data.length} patient{data.length !== 1 ? 's' : ''} waiting
          </Text>
        </View>
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
        ) : groups.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Ionicons name="list-outline" size={40} color="#d1d5db" />
            <Text className="text-gray-700 font-semibold mt-3">Waitlist is empty</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">No active waitlist entries.</Text>
          </View>
        ) : (
          groups.map(({ provider, entries }) => (
            <View key={provider.id} className="mb-5">
              {/* Provider header */}
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-6 h-6 rounded-full bg-primary-100 items-center justify-center">
                  <Text className="text-primary-700 text-xs font-bold">
                    {provider.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-gray-700">
                  {provider.name}
                  {provider.credentials ? (
                    <Text className="font-normal text-gray-400"> {provider.credentials}</Text>
                  ) : null}
                </Text>
                <View className="bg-gray-100 rounded-full px-2 py-0.5 ml-auto">
                  <Text className="text-gray-500 text-xs">{entries.length}</Text>
                </View>
              </View>

              {/* Entries */}
              <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {entries.map((entry: any, i: number) => {
                  const cfg = TYPE_CONFIG[entry.waitlistType as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.followup;
                  const preferredDayNames = (entry.preferredDays ?? [])
                    .map((d: number) => DAY_NAMES[d])
                    .join(', ');
                  const preferredTimes = Object.entries(entry.preferredTimes ?? {})
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(', ');

                  return (
                    <View
                      key={entry.id}
                      className={`px-4 py-3.5 ${i < entries.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-gray-900 font-semibold text-sm">{entry.patient.name}</Text>
                            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: cfg.bg }}>
                              <Text className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</Text>
                            </View>
                          </View>
                          <Text className="text-gray-400 text-xs mt-0.5">
                            Waiting {entry.daysWaiting === 0 ? 'since today' : `${entry.daysWaiting}d`}
                            {entry.appointmentType ? ` · ${entry.appointmentType}` : ''}
                          </Text>
                        </View>

                        {entry.patient.phone ? (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(`tel:${entry.patient.phone.replace(/\D/g, '')}`)}
                            className="bg-primary-50 border border-primary-100 rounded-full px-3 py-1.5 flex-row items-center gap-1"
                          >
                            <Ionicons name="call-outline" size={12} color="#2563eb" />
                            <Text className="text-primary-700 text-xs font-semibold">Call</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {(preferredDayNames || preferredTimes) ? (
                        <View className="flex-row items-center gap-3 mt-2">
                          {preferredDayNames ? (
                            <View className="flex-row items-center gap-1">
                              <Ionicons name="calendar-outline" size={11} color="#9ca3af" />
                              <Text className="text-gray-400 text-xs">{preferredDayNames}</Text>
                            </View>
                          ) : null}
                          {preferredTimes ? (
                            <View className="flex-row items-center gap-1">
                              <Ionicons name="time-outline" size={11} color="#9ca3af" />
                              <Text className="text-gray-400 text-xs capitalize">{preferredTimes}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
