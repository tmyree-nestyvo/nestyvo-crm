import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

function useCallbacks() {
  return useQuery({
    queryKey: ['agent-callbacks'],
    queryFn: () => api.get('/dashboard/agent/callbacks').then((r) => r.data),
    staleTime: 30_000,
  });
}

const SOURCE_LABEL: Record<string, string> = {
  missed_call: 'Missed call',
  voicemail: 'Voicemail',
  website: 'Website inquiry',
  rescheduling_request: 'Reschedule request',
  agent_created: 'Agent created',
};

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

export default function CallbacksScreen() {
  const { data = [], isLoading, refetch, isRefetching } = useCallbacks();
  const queryClient = useQueryClient();

  const dismiss = useMutation({
    mutationFn: (id: string) => api.patch(`/dashboard/agent/callbacks/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-callbacks'] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t dismiss callback', err?.response?.data?.message || 'Please try again.');
    },
  });

  const confirmDismiss = (id: string) => {
    Alert.alert('Dismiss callback?', 'This marks the callback as resolved without scheduling anything.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Dismiss', style: 'destructive', onPress: () => dismiss.mutate(id) },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Open Callbacks</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {data.length} patient{data.length !== 1 ? 's' : ''} to call back
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
            <Text className="text-gray-700 font-semibold mt-3">All caught up!</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">No open callbacks right now.</Text>
          </View>
        ) : (
          data.map((cb: any) => (
            <View
              key={cb.id}
              className={`bg-white rounded-2xl border mb-3 overflow-hidden ${
                cb.status === 'overdue' ? 'border-red-200' : 'border-gray-100'
              }`}
            >
              <View className="px-4 py-3.5">
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-base">{cb.patient.name}</Text>
                    {cb.provider ? (
                      <Text className="text-gray-400 text-xs mt-0.5">
                        {cb.provider.name}{cb.provider.credentials ? ` ${cb.provider.credentials}` : ''}
                      </Text>
                    ) : null}
                    <View className="flex-row items-center gap-2 mt-1">
                      <View
                        className={`rounded-full px-2 py-0.5 ${
                          cb.status === 'overdue' ? 'bg-red-50' : 'bg-amber-50'
                        }`}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            cb.status === 'overdue' ? 'text-red-600' : 'text-amber-600'
                          }`}
                        >
                          {cb.status === 'overdue' ? 'Overdue' : 'Open'}
                        </Text>
                      </View>
                      <Text className="text-gray-400 text-xs">
                        {SOURCE_LABEL[cb.source] ?? cb.source} · {daysAgo(cb.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {cb.patient.phone ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${cb.patient.phone.replace(/\D/g, '')}`)}
                      className="bg-primary-600 rounded-full px-4 py-2 flex-row items-center gap-1.5"
                    >
                      <Ionicons name="call" size={14} color="#fff" />
                      <Text className="text-white text-sm font-semibold">Call</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {cb.notes ? (
                  <Text className="text-gray-500 text-sm mt-2 leading-5">{cb.notes}</Text>
                ) : null}

                <View className="flex-row items-center gap-4 mt-3 pt-3 border-t border-gray-50">
                  {cb.patient.phone ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="call-outline" size={12} color="#9ca3af" />
                      <Text className="text-gray-500 text-xs">{cb.patient.phone}</Text>
                    </View>
                  ) : null}
                  {cb.patient.email ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="mail-outline" size={12} color="#9ca3af" />
                      <Text className="text-gray-500 text-xs">{cb.patient.email}</Text>
                    </View>
                  ) : null}
                </View>

                <View className="flex-row items-center gap-2 mt-3">
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(agent)/calendar',
                        params: {
                          bookingPatientId: cb.patient.id,
                          bookingPatientName: cb.patient.name,
                          initialProviderId: cb.provider?.id ?? '',
                          callbackId: cb.id,
                        },
                      })
                    }
                    className="flex-1 bg-primary-50 border border-primary-100 rounded-xl py-2 items-center flex-row justify-center gap-1.5"
                  >
                    <Ionicons name="calendar-outline" size={14} color="#2563eb" />
                    <Text className="text-primary-700 text-xs font-semibold">
                      {cb.source === 'rescheduling_request' ? 'Reschedule' : 'Schedule'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmDismiss(cb.id)}
                    disabled={dismiss.isPending}
                    className="flex-1 bg-gray-50 border border-gray-100 rounded-xl py-2 items-center flex-row justify-center gap-1.5"
                  >
                    <Ionicons name="close-outline" size={14} color="#6b7280" />
                    <Text className="text-gray-600 text-xs font-semibold">Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
