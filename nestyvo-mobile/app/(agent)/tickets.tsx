import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { hasRole, PRACTICE_MANAGEMENT } from '../../lib/role-groups';
import { HomeButton } from '../../components/HomeButton';
import { TicketHistory, ClientLine, LastActivity, ResolvedBanner } from '../../components/tickets/TicketParts';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#d97706', bg: '#fffbeb' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  resolved: { label: 'Resolved', color: '#16a34a', bg: '#f0fdf4' },
  closed: { label: 'Closed', color: '#6b7280', bg: '#f9fafb' },
};

// Charlene, Phase 8 item 22 — see the identical note in (provider)/tickets.tsx.
// The no-filter view returns Open + In Progress together, but the subtitle
// and this filter's own chip were both separately hardcoded to 'Open' —
// same literal label as the adjacent true-open-only chip right next to it.
const DEFAULT_FILTER_LABEL = 'All Active';

// Charlene, Phase 8 item 22 — selectable categories (see the create flow in
// patients/[id].tsx) are now exactly these 4; legacy values stay valid for
// historical tickets, hence the extra entries in this label map.
const CATEGORY_LABEL: Record<string, string> = {
  outbound_call: 'Outbound Call',
  reschedule_request: 'Reschedule Request',
  technical: 'Technical',
  other: 'Other',
  scheduling: 'Scheduling',
  billing: 'Billing',
  clinical: 'Clinical',
};

const PRIORITY_COLOR: Record<string, string> = { low: '#9ca3af', normal: '#6b7280', high: '#dc2626' };

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'Today'; // <= : a just-created row can read a hair in the future (clock skew)
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

export default function TicketsScreen() {
  const { role } = useAuthStore();
  const isOffice = hasRole(role, PRACTICE_MANAGEMENT);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [active, setActive] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  // Confirmation shown above the list after a reply/status change closes the ticket.
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const { data = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tickets', filter],
    queryFn: () => ticketsApi.list(filter),
  });

  const updateTicket = useMutation({
    mutationFn: (updates: { status?: string; replyText?: string }) =>
      ticketsApi.update(active.id, updates),
    // Charlene, Oct 11 Full Pass (P1 09:48) — "once you reply or resolve or
    // close that maybe this just closes without having to hit close and then
    // you can see it here." Closes the ticket and confirms above the list;
    // the row's preview shows the new note (see LastActivity).
    onSuccess: (updated: any, updates) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['tickets-attention'] });
      setActive(null);
      setNotes('');
      setFlash(
        updates.status === 'resolved' ? `#T-${updated.ticketNumber} resolved`
          : updates.status === 'in_progress' ? `#T-${updated.ticketNumber} marked In Progress`
            : `Reply added to #T-${updated.ticketNumber}`,
      );
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t update ticket', err?.response?.data?.message || 'Please try again.');
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Tickets</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {isOffice ? 'All tickets for your practice' : 'Tickets you filed'} · {data.length} ticket{data.length !== 1 ? 's' : ''} · {filter ? STATUS_CONFIG[filter]?.label : DEFAULT_FILTER_LABEL}
          </Text>
        </View>
        <HomeButton href="/(agent)" />
      </View>

      <View className="flex-row gap-2 px-5 pb-3">
        {[undefined, 'open', 'in_progress', 'resolved'].map((s) => (
          <TouchableOpacity
            key={s ?? 'active'}
            onPress={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full border ${filter === s ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
          >
            <Text className={`text-xs font-medium ${filter === s ? 'text-white' : 'text-gray-600'}`}>
              {s ? STATUS_CONFIG[s].label : DEFAULT_FILTER_LABEL}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {flash ? (
          <View className="flex-row items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 mb-3">
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text className="text-green-800 text-sm font-medium">{flash}</Text>
          </View>
        ) : null}
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
                // Oct 11 2026 — see provider/tickets.tsx's identical fix:
                // pre-filling with the existing history meant replying
                // required deleting whatever the provider had already
                // written. Starts empty now; full history shown read-only.
                onPress={() => { setActive(t); setNotes(''); }}
                className="bg-white rounded-2xl border border-gray-100 mb-3 px-4 py-3.5"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="text-gray-300 text-[10px] font-semibold tracking-wide mb-0.5">#T-{t.ticketNumber}</Text>
                    <Text className="text-gray-900 font-semibold text-sm">{t.subject}</Text>
                    <ClientLine patient={t.patient} />
                  </View>
                  <View className="items-end gap-1">
                    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: cfg.bg }}>
                      <Text className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</Text>
                    </View>
                    {t.awaitingOffice ? (
                      <View className="rounded-full px-2 py-0.5 bg-red-50">
                        <Text className="text-xs font-semibold text-red-600">Needs reply</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text className="text-gray-500 text-sm mt-2 leading-5" numberOfLines={2}>{t.description}</Text>
                <LastActivity notes={t.resolutionNotes} />
                <View className="flex-row items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[t.priority] }} />
                  <Text className="text-gray-400 text-xs capitalize">{t.priority}</Text><Text className="text-gray-400 text-xs"> · {CATEGORY_LABEL[t.category] ?? t.category}</Text>
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
            <Text className="text-gray-400 text-xs font-semibold tracking-wide mb-1">#T-{active?.ticketNumber}</Text>
            <Text className="text-base font-bold text-gray-900 mb-1">{active?.subject}</Text>
            <ClientLine patient={active?.patient} size="md" />
            <Text className="text-gray-400 text-sm mt-1 mb-3">
              <Text className="capitalize">{active?.priority}</Text> priority · {CATEGORY_LABEL[active?.category] ?? active?.category}
              {active?.createdByUser ? ` · from ${active.createdByUser.firstName} ${active.createdByUser.lastName}` : ''}
            </Text>
            <Text className="text-gray-600 text-sm leading-5 mb-4">{active?.description}</Text>

            <ResolvedBanner ticket={active} />
            {/* Every reply and status change from either side, in order —
                appended server-side, never overwritten. */}
            <Text className="text-gray-500 text-xs font-medium mb-2">History</Text>
            <TicketHistory notes={active?.resolutionNotes} />

            <Text className="text-gray-500 text-xs font-medium mb-2">Add a note</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="What was done, or what's needed next?"
              multiline
              numberOfLines={3}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 mb-4"
              style={{ textAlignVertical: 'top', minHeight: 64 }}
            />

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => updateTicket.mutate({ replyText: notes })}
                disabled={!notes.trim() || updateTicket.isPending}
                className={`flex-1 rounded-xl py-2.5 items-center border ${notes.trim() ? 'border-primary-600' : 'border-gray-200'}`}
              >
                <Text className={`text-sm font-medium ${notes.trim() ? 'text-primary-600' : 'text-gray-300'}`}>Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updateTicket.mutate({ status: 'in_progress', replyText: notes })}
                className="flex-1 bg-gray-100 rounded-xl py-2.5 items-center"
              >
                <Text className="text-gray-700 text-sm font-medium">In Progress</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updateTicket.mutate({ status: 'resolved', replyText: notes })}
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
