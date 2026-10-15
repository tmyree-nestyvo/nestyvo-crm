import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, providersApi, waitlistApi } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';
import { AddToWaitlistModal } from '../../components/AddToWaitlistModal';

// Charlene, Oct 5 2026 — this screen was read-only before (view your
// waitlist, no way to actually add or remove anyone). POST /waitlist
// already existed and already correctly self-scoped a provider's entry to
// their own record — it just had no UI caller here, and no way to remove
// an entry existed anywhere in the app at all. Both now reuse the exact
// same shared waitlist (GET /waitlist/mine already reads the identical
// WaitlistEntry table the agent/admin side uses — see waitlist.service.ts
// getForProvider vs getForProviderById) — one source of truth, not a
// second provider-only waitlist.

function useWaitlist() {
  return useQuery({
    queryKey: ['provider-waitlist'],
    queryFn: () => api.get('/waitlist/mine').then((r) => r.data),
  });
}

function useRoster() {
  return useQuery({
    queryKey: ['provider-roster'],
    queryFn: () => api.get('/patients/roster').then((r) => r.data),
    staleTime: 60_000,
  });
}

// Labels spelled out rather than derived from the stored code — the code is
// still `new_patient`, which used to show as "New Patient" (Full Pass
// recording, Oct 11 2026).
const TYPE_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  urgent: { color: '#dc2626', icon: 'alert-circle', label: 'Urgent' },
  new_patient: { color: '#2563eb', icon: 'person-add', label: 'New Client' },
  followup: { color: '#7c3aed', icon: 'refresh', label: 'Follow-up' },
};

export default function ProviderWaitlistScreen() {
  const { data, isLoading } = useWaitlist();
  const { data: self } = useQuery({ queryKey: ['provider-self'], queryFn: providersApi.getSelf });
  const [addModal, setAddModal] = useState(false);
  const queryClient = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: (id: string) => waitlistApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider-waitlist'] }),
    onError: (err: any) => Alert.alert("Couldn't remove", err?.response?.data?.message || 'Please try again.'),
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">My Waitlist</Text>
          <Text className="text-gray-500 text-sm mt-0.5">
            {data?.length ?? 0} {data?.length === 1 ? 'client' : 'clients'} waiting
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setAddModal(true)}
          className="flex-row items-center gap-1.5 bg-primary-600 px-3 py-2 rounded-full"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text className="text-white text-xs font-semibold">Add</Text>
        </TouchableOpacity>
        <HomeButton href="/(provider)" />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-10"
          ListEmptyComponent={
            <View className="items-center pt-16">
              <Ionicons name="list-outline" size={48} color="#e5e7eb" />
              <Text className="text-gray-400 text-sm mt-3">No clients on waitlist</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cfg = TYPE_CONFIG[item.type] ?? { color: '#6b7280', icon: 'person', label: 'Waiting' };
            return (
              // Tapping an entry opens the client (Full Pass recording: "I want
              // to see what… Jane Doe… I just can't open it").
              <TouchableOpacity
                activeOpacity={0.7}
                disabled={!item.patientId}
                onPress={() => router.push({ pathname: '/(provider)/clients/[id]', params: { id: item.patientId, name: item.patient } })}
                className="bg-white rounded-xl border border-gray-100 px-4 py-4 mb-2"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${cfg.color}18` }}
                  >
                    <Ionicons name={cfg.icon} size={15} color={cfg.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-sm">{item.patient}</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">
                      {item.appointmentType ? `${item.appointmentType} · ` : ''}{item.daysWaiting}d waiting
                    </Text>
                  </View>
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cfg.color}18` }}>
                    <Text className="text-xs font-medium" style={{ color: cfg.color }}>
                      {cfg.label}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeMutation.mutate(item.id)} className="pl-1">
                    <Ionicons name="close-circle" size={18} color="#d1d5db" />
                  </TouchableOpacity>
                </View>

                {(item.preferredDays?.length > 0 || item.preferredTimes) && (
                  <View className="flex-row gap-2 mt-3 flex-wrap">
                    {item.preferredDays?.map((d: number) => (
                      <View key={d} className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                        <Text className="text-gray-600 text-xs">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
                        </Text>
                      </View>
                    ))}
                    {Object.entries(item.preferredTimes ?? {}).filter(([, v]) => v).map(([t]) => (
                      <View key={t} className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                        <Text className="text-gray-600 text-xs capitalize">{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {item.notes ? <Text className="text-gray-500 text-xs mt-2.5 leading-4">{item.notes}</Text> : null}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {self && <AddToWaitlistModal visible={addModal} onClose={() => setAddModal(false)} providerId={self.id} practiceId={self.practiceId} />}
    </SafeAreaView>
  );
}
