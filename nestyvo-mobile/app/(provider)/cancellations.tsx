import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

function useProviderCancellations() {
  return useQuery({
    queryKey: ['provider-cancellations'],
    queryFn: () => api.get('/dashboard/provider/cancellations').then((r) => r.data),
    staleTime: 30_000,
  });
}

const TZ = 'America/Los_Angeles';
function fmtSlot(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ProviderCancellationsScreen() {
  const { data = [], isLoading, refetch, isRefetching } = useProviderCancellations();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <HomeButton href="/(provider)" />
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Cancellations</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {data.length} this week
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
            <Text className="text-gray-700 font-semibold mt-3">No cancellations this week</Text>
          </View>
        ) : (
          data.map((c: any) => (
            <TouchableOpacity
              key={c.id}
              onPress={() =>
                router.push({
                  pathname: '/(provider)/clients/[id]',
                  params: { id: c.patientId, name: c.patient },
                })
              }
              className="bg-white rounded-2xl border border-gray-100 mb-3 px-4 py-3.5"
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-gray-900 font-semibold text-sm">{c.patient}</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    Was {fmtSlot(c.startAt)}{c.type ? ` · ${c.type}` : ''}
                  </Text>
                </View>
                <Text className="text-gray-300 text-xs">{timeAgo(c.cancelledAt)}</Text>
              </View>
              {c.cancellationReason ? (
                <Text className="text-gray-400 text-xs mt-2 italic">"{c.cancellationReason}"</Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
