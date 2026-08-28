import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, patientsApi } from '../../lib/api';

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

const LOGGABLE_SOURCES = ['missed_call', 'voicemail', 'website', 'agent_created'];

function LogCallbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [source, setSource] = useState('missed_call');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['patients', query],
    queryFn: () => patientsApi.search(query),
    enabled: query.length >= 2 && !patient,
  });

  const reset = () => {
    setQuery('');
    setPatient(null);
    setSource('missed_call');
    setNotes('');
    onClose();
  };

  const logCallback = useMutation({
    mutationFn: () => api.post('/dashboard/agent/callbacks', { patientId: patient!.id, source, notes: notes || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-callbacks'] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      reset();
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t log callback', err?.response?.data?.message || 'Please try again.');
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]">
          <Text className="text-base font-bold text-gray-900 mb-1">Log a Callback</Text>
          <Text className="text-gray-400 text-sm mb-4">For a missed call, voicemail, or inquiry that came in outside the app.</Text>

          {!patient ? (
            <>
              <Text className="text-gray-500 text-xs font-medium mb-2">Client</Text>
              <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 mb-2">
                <Ionicons name="search" size={16} color="#9ca3af" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search by name, phone, or email…"
                  placeholderTextColor="#9ca3af"
                  className="flex-1 py-2.5 px-2 text-sm text-gray-900"
                  autoCapitalize="none"
                />
              </View>
              {query.length >= 2 ? (
                <ScrollView className="max-h-48 mb-4">
                  {isLoading ? (
                    <ActivityIndicator color="#2563eb" style={{ marginVertical: 12 }} />
                  ) : results.length === 0 ? (
                    <Text className="text-gray-400 text-sm text-center py-3">No clients found</Text>
                  ) : (
                    results.map((p: any) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setPatient({ id: p.id, name: p.name })}
                        className="px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 mb-1.5"
                      >
                        <Text className="text-gray-800 font-medium text-sm">{p.name}</Text>
                        <Text className="text-gray-400 text-xs mt-0.5">{p.phone}{p.practiceName ? ` · ${p.practiceName}` : ''}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              ) : (
                <View className="mb-4" />
              )}
            </>
          ) : (
            <>
              <Text className="text-gray-500 text-xs font-medium mb-2">Client</Text>
              <View className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-4">
                <Text className="text-gray-900 text-sm font-medium">{patient.name}</Text>
                <TouchableOpacity onPress={() => setPatient(null)}>
                  <Text className="text-primary-600 text-xs font-medium">Change</Text>
                </TouchableOpacity>
              </View>

              <Text className="text-gray-500 text-xs font-medium mb-2">Source</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {LOGGABLE_SOURCES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSource(s)}
                    className={`px-3 py-1.5 rounded-full border ${source === s ? 'bg-primary-600 border-primary-600' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <Text className={`text-xs font-medium ${source === s ? 'text-white' : 'text-gray-600'}`}>{SOURCE_LABEL[s]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-gray-500 text-xs font-medium mb-2">Notes (optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="What do they need?"
                multiline
                numberOfLines={2}
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 mb-5"
                style={{ textAlignVertical: 'top', minHeight: 56 }}
              />

              <TouchableOpacity
                onPress={() => logCallback.mutate()}
                disabled={logCallback.isPending}
                className="bg-primary-600 rounded-xl py-3 items-center"
              >
                {logCallback.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-sm">Log Callback</Text>
                )}
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={reset} className="mt-3 items-center py-1">
            <Text className="text-gray-400 text-sm">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

export default function CallbacksScreen() {
  const { data = [], isLoading, refetch, isRefetching } = useCallbacks();
  const queryClient = useQueryClient();
  const [logModal, setLogModal] = useState(false);

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
        <TouchableOpacity
          onPress={() => setLogModal(true)}
          className="flex-row items-center gap-1.5 bg-primary-600 px-3 py-1.5 rounded-full"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text className="text-white text-xs font-semibold">Log Callback</Text>
        </TouchableOpacity>
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

      <LogCallbackModal visible={logModal} onClose={() => setLogModal(false)} />
    </SafeAreaView>
  );
}
