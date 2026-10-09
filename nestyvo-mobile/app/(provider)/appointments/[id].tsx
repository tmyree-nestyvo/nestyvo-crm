import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Alert } from '../../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { providersApi } from '../../../lib/api';
import { HomeButton } from '../../../components/HomeButton';

// Oct 9 2026 — Charlene/Troy call: "the provider login cannot edit,
// reschedule, or manage existing appointments... when you click on any of
// this, none of it does anything." Confirmed the backend already fully
// supports a provider cancelling/rescheding their own appointment (tested
// directly against production with Gloria's own login, both worked) — this
// screen was simply never built. The agent-side equivalent
// (app/(agent)/appointments/[id].tsx) reschedules by sending the provider
// to the agent calendar in a tap-a-new-slot mode; the provider's own
// calendar has no such interaction built at all (a separate, bigger gap —
// see the Oct 9 memory note), so reschedule here is a direct inline
// date/time form instead of a calendar hand-off, same end result (one
// rescheduleAppointment call) via a much smaller surface.

const TZ = 'America/Los_Angeles';
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled:   { label: 'Scheduled',  color: '#16a34a', bg: '#f0fdf4' },
  completed:   { label: 'Completed',  color: '#6b7280', bg: '#f9fafb' },
  cancelled:   { label: 'Cancelled',  color: '#dc2626', bg: '#fef2f2' },
  no_show:     { label: 'No Show',    color: '#d97706', bg: '#fffbeb' },
  rescheduled: { label: 'Rescheduled', color: '#7c3aed', bg: '#f5f3ff' },
};

function InfoRow({ icon, label, value, onPress }: { icon: any; label: string; value: string; onPress?: () => void }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} className="flex-row items-center gap-3 py-3 border-b border-gray-50">
      <View className="w-9 h-9 rounded-xl bg-gray-50 items-center justify-center flex-shrink-0">
        <Ionicons name={icon} size={16} color="#6b7280" />
      </View>
      <View className="flex-1">
        <Text className="text-gray-400 text-xs">{label}</Text>
        <Text className={`text-sm font-medium mt-0.5 ${onPress ? 'text-primary-600' : 'text-gray-900'}`}>{value}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color="#d1d5db" />}
    </Wrapper>
  );
}

// Same simple HH:MM parse already used for provider block times
// (app/(agent)/provider-settings.tsx's normalizeTime) — kept local rather
// than imported, this screen has no other dependency on that file.
function normalizeTime(raw: string): string | null {
  const v = raw.trim();
  const m = v.match(/^(\d{1,2})\s*:?\s*(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export default function ProviderAppointmentDetailScreen() {
  const { id, providerId } = useLocalSearchParams<{ id: string; providerId: string }>();
  const queryClient = useQueryClient();
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const { data: appt, isLoading } = useQuery({
    queryKey: ['appointment-detail', providerId, id],
    queryFn: () => providersApi.getAppointmentDetail(providerId, id),
    enabled: !!providerId && !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => providersApi.cancelAppointment(providerId, id, cancelReason.trim() || undefined),
    onSuccess: () => {
      setCancelModal(false);
      queryClient.invalidateQueries({ queryKey: ['appointment-detail', providerId, id] });
      queryClient.invalidateQueries({ queryKey: ['provider-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['provider-schedule'] });
    },
    onError: (err: any) => {
      Alert.alert("Couldn't cancel", err?.response?.data?.message || 'Please try again.');
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      const time = normalizeTime(newTime);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate.trim())) throw new Error('Enter the date as YYYY-MM-DD.');
      if (!time) throw new Error('Enter the time as HH:MM (24-hour).');
      const durationMs = new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime();
      const newStartAt = new Date(`${newDate.trim()}T${time}:00`);
      const newEndAt = new Date(newStartAt.getTime() + durationMs);
      return providersApi.rescheduleAppointment(providerId, id, {
        newStartAt: newStartAt.toISOString(),
        newEndAt: newEndAt.toISOString(),
      });
    },
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ['provider-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['provider-schedule'] });
      router.replace({
        pathname: '/(provider)/appointments/[id]',
        params: { id: saved.id, providerId },
      });
    },
    onError: (err: any) => {
      Alert.alert("Couldn't reschedule", err?.response?.data?.message || 'Please try again.');
    },
  });

  const statusCfg = appt ? STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.scheduled : null;
  const canAct = appt?.status === 'scheduled';

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">Appointment</Text>
        <HomeButton href="/(provider)" />
      </View>

      {isLoading || !appt ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 pb-10">
          <View className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-gray-900 font-bold text-lg flex-1">{appt.patient.name}</Text>
              {statusCfg && (
                <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: statusCfg.bg }}>
                  <Text className="text-xs font-semibold" style={{ color: statusCfg.color }}>{statusCfg.label}</Text>
                </View>
              )}
            </View>
            <Text className="text-gray-500 text-sm">{fmtDateTime(appt.startAt)}</Text>
            <Text className="text-gray-400 text-xs mt-0.5">
              {Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000)} min
              {appt.appointmentType ? ` · ${appt.appointmentType.name}` : ''}
            </Text>
          </View>

          <View className="bg-white rounded-2xl border border-gray-100 px-4">
            <InfoRow
              icon="person-outline"
              label="Client"
              value={appt.patient.name}
              onPress={() => router.push(`/(provider)/clients/${appt.patient.id}`)}
            />
            <InfoRow icon="business-outline" label="Practice" value={appt.practice.name} />
            <InfoRow
              icon={appt.locationType === 'virtual' ? 'videocam-outline' : 'location-outline'}
              label="Location"
              value={appt.locationType === 'virtual' ? 'Virtual' : 'In Person'}
            />
            {appt.cancellationReason && (
              <InfoRow icon="information-circle-outline" label="Reason" value={appt.cancellationReason} />
            )}
          </View>

          {canAct && !rescheduling && (
            <View className="flex-row gap-2 mt-4">
              <TouchableOpacity
                onPress={() => setRescheduling(true)}
                className="flex-1 flex-row items-center justify-center gap-1.5 bg-purple-50 border border-purple-100 py-3 rounded-xl"
              >
                <Ionicons name="swap-horizontal-outline" size={15} color="#7c3aed" />
                <Text className="text-sm font-medium" style={{ color: '#7c3aed' }}>Reschedule</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCancelModal(true)}
                className="flex-1 flex-row items-center justify-center gap-1.5 bg-red-50 border border-red-100 py-3 rounded-xl"
              >
                <Ionicons name="close-circle-outline" size={15} color="#dc2626" />
                <Text className="text-red-600 text-sm font-medium">Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {canAct && rescheduling && (
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mt-4">
              <Text className="text-sm font-semibold text-gray-900 mb-1">Move to a new time</Text>
              <Text className="text-gray-400 text-xs mb-3">
                Keeps the same {Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000)}-minute length.
              </Text>
              <Text className="text-gray-500 text-xs font-medium mb-1.5">New date</Text>
              <TextInput
                value={newDate}
                onChangeText={setNewDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9ca3af"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 mb-3"
              />
              <Text className="text-gray-500 text-xs font-medium mb-1.5">New time</Text>
              <TextInput
                value={newTime}
                onChangeText={setNewTime}
                placeholder="HH:MM (24-hour)"
                placeholderTextColor="#9ca3af"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 mb-4"
              />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setRescheduling(false)}
                  className="flex-1 items-center py-3 rounded-xl border border-gray-200"
                >
                  <Text className="text-gray-500 text-sm font-medium">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => rescheduleMutation.mutate()}
                  disabled={rescheduleMutation.isPending}
                  className="flex-1 items-center py-3 rounded-xl"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  {rescheduleMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white text-sm font-semibold">Confirm</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={cancelModal} transparent animationType="slide" onRequestClose={() => setCancelModal(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <Text className="text-base font-bold text-gray-900 mb-1">Cancel This Appointment?</Text>
            <Text className="text-gray-400 text-sm mb-4">
              {appt?.patient.name} — {appt ? fmtDateTime(appt.startAt) : ''}
            </Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Reason (optional)"
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
            />
            <TouchableOpacity
              onPress={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="bg-red-600 rounded-xl py-3.5 items-center"
            >
              {cancelMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-sm">Confirm Cancellation</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCancelModal(false)} className="mt-3 items-center py-2">
              <Text className="text-gray-400 text-sm">Keep Appointment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
