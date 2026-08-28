import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi, api } from '../../lib/api';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#d97706', bg: '#fffbeb' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  resolved: { label: 'Resolved', color: '#16a34a', bg: '#f0fdf4' },
  closed: { label: 'Closed', color: '#6b7280', bg: '#f9fafb' },
};

const TICKET_CATEGORIES = ['scheduling', 'billing', 'clinical', 'technical', 'other'];

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function useRoster() {
  return useQuery({
    queryKey: ['provider-roster'],
    queryFn: () => api.get('/patients/roster').then((r) => r.data),
    staleTime: 60_000,
  });
}

export default function ProviderTicketsScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [active, setActive] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [newRequest, setNewRequest] = useState(false);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tickets', filter],
    queryFn: () => ticketsApi.list(filter),
  });

  const updateTicket = useMutation({
    mutationFn: (updates: { status?: string; resolutionNotes?: string }) =>
      ticketsApi.update(active.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setActive(null);
      setNotes('');
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t update', err?.response?.data?.message || 'Please try again.');
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Requests</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {data.length} ticket{data.length !== 1 ? 's' : ''}{filter ? ` · ${STATUS_CONFIG[filter]?.label}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setNewRequest(true)}
          className="flex-row items-center gap-1.5 bg-primary-600 px-3 py-1.5 rounded-full"
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text className="text-white text-xs font-semibold">New</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row gap-2 px-5 pb-3">
        {[undefined, 'open', 'in_progress', 'resolved'].map((s) => (
          <TouchableOpacity
            key={s ?? 'all'}
            onPress={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full border ${filter === s ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
          >
            <Text className={`text-xs font-medium ${filter === s ? 'text-white' : 'text-gray-600'}`}>
              {s ? STATUS_CONFIG[s].label : 'All'}
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
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : data.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Ionicons name="checkmark-circle-outline" size={40} color="#16a34a" />
            <Text className="text-gray-700 font-semibold mt-3">Nothing here</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">No requests match this filter.</Text>
          </View>
        ) : (
          data.map((t: any) => {
            const cfg = STATUS_CONFIG[t.status];
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => { setActive(t); setNotes(t.resolutionNotes ?? ''); }}
                className="bg-white rounded-2xl border border-gray-100 mb-3 px-4 py-3.5"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-sm">{t.subject}</Text>
                    {t.patient ? (
                      <Text className="text-gray-400 text-xs mt-0.5">{t.patient.firstName} {t.patient.lastName}</Text>
                    ) : null}
                  </View>
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: cfg.bg }}>
                    <Text className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</Text>
                  </View>
                </View>
                <Text className="text-gray-500 text-sm mt-2 leading-5" numberOfLines={2}>{t.description}</Text>
                <View className="flex-row items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
                  <Text className="text-gray-400 text-xs capitalize">{t.category}</Text>
                  <Text className="text-gray-300 text-xs ml-auto">
                    {t.createdByUser ? `${t.createdByUser.firstName} · ` : ''}{daysAgo(t.createdAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Reply / resolve modal */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <Text className="text-base font-bold text-gray-900 mb-1">{active?.subject}</Text>
            {active?.patient ? (
              <Text className="text-gray-400 text-sm mb-1">{active.patient.firstName} {active.patient.lastName}</Text>
            ) : null}
            <Text className="text-gray-400 text-sm mb-4 capitalize">{active?.category}</Text>
            <Text className="text-gray-600 text-sm leading-5 mb-4">{active?.description}</Text>

            <Text className="text-gray-500 text-xs font-medium mb-2">Your reply / next action</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="What should the agent do next, or what did you handle?"
              multiline
              numberOfLines={3}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 mb-4"
              style={{ textAlignVertical: 'top', minHeight: 64 }}
            />

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => updateTicket.mutate({ status: 'in_progress', resolutionNotes: notes })}
                className="flex-1 bg-gray-100 rounded-xl py-2.5 items-center"
              >
                <Text className="text-gray-700 text-sm font-medium">Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updateTicket.mutate({ status: 'resolved', resolutionNotes: notes })}
                className="flex-1 bg-primary-600 rounded-xl py-2.5 items-center"
              >
                {updateTicket.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white text-sm font-semibold">Resolve</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setActive(null)} className="mt-3 items-center py-1">
              <Text className="text-gray-400 text-sm">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <NewRequestModal visible={newRequest} onClose={() => setNewRequest(false)} />
    </SafeAreaView>
  );
}

function NewRequestModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [category, setCategory] = useState('scheduling');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: roster } = useRoster();
  const patients: any[] = roster?.active ?? [];

  const reset = () => {
    setPatient(null);
    setCategory('scheduling');
    setSubject('');
    setDescription('');
    setPickerOpen(false);
    onClose();
  };

  const createTicket = useMutation({
    mutationFn: () => ticketsApi.create({ patientId: patient?.id, category, subject, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      reset();
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t send request', err?.response?.data?.message || 'Please try again.');
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[85%]">
          <Text className="text-base font-bold text-gray-900 mb-1">New Request</Text>
          <Text className="text-gray-400 text-sm mb-4">Ask the call center to call a client or help with something.</Text>

          <Text className="text-gray-500 text-xs font-medium mb-2">Client (optional)</Text>
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-4"
          >
            <Text className={patient ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>
              {patient ? patient.name : 'Not tied to a specific client'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9ca3af" />
          </TouchableOpacity>

          <Text className="text-gray-500 text-xs font-medium mb-2">Category</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {TICKET_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full border ${category === c ? 'bg-primary-600 border-primary-600' : 'bg-gray-50 border-gray-200'}`}
              >
                <Text className={`text-xs font-medium capitalize ${category === c ? 'text-white' : 'text-gray-600'}`}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-gray-500 text-xs font-medium mb-2">Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Short summary"
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 mb-4"
          />

          <Text className="text-gray-500 text-xs font-medium mb-2">Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What do you need?"
            multiline
            numberOfLines={3}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 mb-5"
            style={{ textAlignVertical: 'top', minHeight: 72 }}
          />

          <TouchableOpacity
            onPress={() => createTicket.mutate()}
            disabled={!subject || !description || createTicket.isPending}
            className={`rounded-xl py-3 items-center ${!subject || !description ? 'bg-gray-200' : 'bg-primary-600'}`}
          >
            {createTicket.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-sm">Send Request</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} className="mt-3 items-center py-1">
            <Text className="text-gray-400 text-sm">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[70%]">
            <Text className="text-base font-bold text-gray-900 mb-4">Select Client</Text>
            <ScrollView>
              {patients.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setPatient({ id: p.id, name: `${p.firstName} ${p.lastName}` }); setPickerOpen(false); }}
                  className="px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                >
                  <Text className="text-gray-800 font-medium text-sm">{p.firstName} {p.lastName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {patient ? (
              <TouchableOpacity onPress={() => { setPatient(null); setPickerOpen(false); }} className="mt-2 items-center py-2">
                <Text className="text-red-500 text-sm">Clear</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setPickerOpen(false)} className="mt-1 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}
