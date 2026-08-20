import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#d97706', bg: '#fffbeb' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  resolved: { label: 'Resolved', color: '#16a34a', bg: '#f0fdf4' },
  closed: { label: 'Closed', color: '#6b7280', bg: '#f9fafb' },
};

const PRIORITY_COLOR: Record<string, string> = { low: '#9ca3af', normal: '#6b7280', high: '#dc2626' };

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

export default function TicketsScreen() {
  const { role } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [active, setActive] = useState<any | null>(null);
  const [notes, setNotes] = useState('');

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
  });

  if (role !== 'administrator' && role !== 'practice_manager') {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-6">
        <Text className="text-gray-400 text-sm">You don't have access to this page.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Tickets</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {data.length} ticket{data.length !== 1 ? 's' : ''}{filter ? ` · ${STATUS_CONFIG[filter]?.label}` : ''}
          </Text>
        </View>
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
            <Text className="text-gray-400 text-sm mt-1 text-center">No tickets match this filter.</Text>
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
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[t.priority] }} />
                  <Text className="text-gray-400 text-xs capitalize">{t.priority} · {t.category}</Text>
                  <Text className="text-gray-300 text-xs ml-auto">
                    {t.createdByUser ? `${t.createdByUser.firstName} · ` : ''}{daysAgo(t.createdAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <Text className="text-base font-bold text-gray-900 mb-1">{active?.subject}</Text>
            <Text className="text-gray-400 text-sm mb-4 capitalize">{active?.priority} priority · {active?.category}</Text>
            <Text className="text-gray-600 text-sm leading-5 mb-4">{active?.description}</Text>

            <Text className="text-gray-500 text-xs font-medium mb-2">Resolution notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="What was done?"
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
                <Text className="text-gray-700 text-sm font-medium">In Progress</Text>
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
    </SafeAreaView>
  );
}
