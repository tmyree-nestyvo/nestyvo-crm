import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, providersApi, waitlistApi, appointmentTypesApi } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

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

const TYPE_CONFIG: Record<string, { color: string; icon: any }> = {
  urgent: { color: '#dc2626', icon: 'alert-circle' },
  new_patient: { color: '#2563eb', icon: 'person-add' },
  followup: { color: '#7c3aed', icon: 'refresh' },
};

const WAITLIST_TYPES = [
  { id: 'new_patient', label: 'New Patient' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'urgent', label: 'Urgent' },
];

function AddToWaitlistModal({ visible, onClose, providerId }: { visible: boolean; onClose: () => void; providerId: string }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'client' | 'details'>('client');
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [waitlistType, setWaitlistType] = useState('followup');
  const [appointmentTypeId, setAppointmentTypeId] = useState<string | null>(null);

  const { data: roster } = useQuery({
    queryKey: ['provider-roster'],
    queryFn: () => api.get('/patients/roster').then((r) => r.data),
    enabled: visible,
  });
  const { data: types = [] } = useQuery({
    queryKey: ['appointment-types', providerId],
    queryFn: () => appointmentTypesApi.list(providerId),
    enabled: visible,
  });
  const activeClients = [...(roster?.active ?? [])];

  const reset = () => {
    setStep('client');
    setPatient(null);
    setWaitlistType('followup');
    setAppointmentTypeId(null);
  };

  const addMutation = useMutation({
    mutationFn: () =>
      waitlistApi.add({
        patientId: patient!.id,
        waitlistType,
        appointmentTypeId: appointmentTypeId ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-waitlist'] });
      reset();
      onClose();
    },
    onError: (err: any) => Alert.alert("Couldn't add to waitlist", err?.response?.data?.message || 'Please try again.'),
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[80%]">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold text-gray-900">
              {step === 'client' ? 'Add to Waitlist' : patient?.name}
            </Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Ionicons name="close" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {step === 'client' ? (
            <ScrollView>
              {activeClients.length === 0 ? (
                <Text className="text-gray-400 text-sm text-center py-8">No clients yet.</Text>
              ) : (
                activeClients.map((p: any) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => { setPatient({ id: p.id, name: `${p.firstName} ${p.lastName}` }); setStep('details'); }}
                    className="flex-row items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                  >
                    <Text className="text-gray-800 font-medium text-sm">{p.firstName} {p.lastName}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          ) : (
            <ScrollView>
              <Text className="text-gray-500 text-xs font-medium mb-2">Waiting for</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {WAITLIST_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setWaitlistType(t.id)}
                    className={`px-3 py-1.5 rounded-full border ${waitlistType === t.id ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`text-xs font-medium ${waitlistType === t.id ? 'text-white' : 'text-gray-600'}`}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {types.length > 0 && (
                <>
                  <Text className="text-gray-500 text-xs font-medium mb-2">Appointment type (optional)</Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {types.filter((t: any) => t.isActive).map((t: any) => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => setAppointmentTypeId(appointmentTypeId === t.id ? null : t.id)}
                        className={`px-3 py-1.5 rounded-full border ${appointmentTypeId === t.id ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                      >
                        <Text className={`text-xs font-medium ${appointmentTypeId === t.id ? 'text-white' : 'text-gray-600'}`}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity
                onPress={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                className="bg-primary-600 rounded-xl py-3.5 items-center"
              >
                {addMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Add to Waitlist</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

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
            {data?.length ?? 0} patients waiting
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
              <Text className="text-gray-400 text-sm mt-3">No patients on waitlist</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cfg = TYPE_CONFIG[item.type] ?? { color: '#6b7280', icon: 'person' };
            return (
              <View className="bg-white rounded-xl border border-gray-100 px-4 py-4 mb-2">
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
                    <Text className="text-xs font-medium capitalize" style={{ color: cfg.color }}>
                      {item.type?.replace('_', ' ')}
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
              </View>
            );
          }}
        />
      )}

      {self && <AddToWaitlistModal visible={addModal} onClose={() => setAddModal(false)} providerId={self.id} />}
    </SafeAreaView>
  );
}
