import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

function useCancellations() {
  return useQuery({
    queryKey: ['agent-cancellations'],
    queryFn: () => api.get('/dashboard/agent/cancellations').then((r) => r.data),
    staleTime: 30_000,
  });
}

const TZ = 'America/Los_Angeles';
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
}
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CancellationsScreen() {
  const { data = [], isLoading, refetch, isRefetching } = useCancellations();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Cancellations</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {data.length} open slot{data.length !== 1 ? 's' : ''} to fill
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
        ) : data.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Ionicons name="checkmark-circle-outline" size={40} color="#16a34a" />
            <Text className="text-gray-700 font-semibold mt-3">No open cancellations</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">All slots are filled.</Text>
          </View>
        ) : (
          data.map((opp: any) => (
            <View key={opp.id} className="bg-white rounded-2xl border border-gray-100 mb-3 overflow-hidden">
              <View className="px-4 py-3.5">
                {/* Provider + time */}
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-base">
                      {opp.provider.name}
                      {opp.provider.credentials ? (
                        <Text className="text-gray-400 font-normal text-sm">
                          {' '}{opp.provider.credentials}
                        </Text>
                      ) : null}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-1">
                      <Ionicons name="time-outline" size={13} color="#16a34a" />
                      <Text className="text-green-700 text-sm font-medium">
                        {fmtDate(opp.slotStartAt)} · {fmtTime(opp.slotStartAt)} – {fmtTime(opp.slotEndAt)}
                      </Text>
                    </View>
                    {opp.appointmentType ? (
                      <Text className="text-gray-400 text-xs mt-0.5">{opp.appointmentType}</Text>
                    ) : null}
                    {opp.waitlistCount > 0 ? (
                      <View className="flex-row items-center gap-1 mt-1.5">
                        <Ionicons name="list-outline" size={12} color="#7c3aed" />
                        <Text className="text-purple-700 text-xs font-medium">
                          {opp.waitlistCount} on waitlist for this provider
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(agent)/fill-slot',
                        params: {
                          providerId: opp.provider.id,
                          providerName: opp.provider.name,
                          slotStartAt: opp.slotStartAt,
                          slotEndAt: opp.slotEndAt,
                        },
                      })
                    }
                    className="bg-primary-600 rounded-full px-4 py-2 flex-row items-center gap-1.5"
                  >
                    <Ionicons name="people-outline" size={14} color="#fff" />
                    <Text className="text-white text-sm font-semibold">Fill</Text>
                  </TouchableOpacity>
                </View>

                {/* Cancellation context */}
                {opp.cancelledPatient || opp.cancellationReason ? (
                  <View className="mt-3 pt-3 border-t border-gray-50">
                    {opp.cancelledPatient ? (
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="person-remove-outline" size={13} color="#9ca3af" />
                        <Text className="text-gray-500 text-xs">
                          {opp.cancelledPatient.name} cancelled
                          {opp.cancelledAt ? ` · ${timeAgo(opp.cancelledAt)}` : ''}
                        </Text>
                      </View>
                    ) : null}
                    {opp.cancellationReason ? (
                      <Text className="text-gray-400 text-xs mt-1 ml-5 italic">
                        "{opp.cancellationReason}"
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
