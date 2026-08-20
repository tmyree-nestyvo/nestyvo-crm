import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, patientLinksApi } from '../../../lib/api';
import { AppointmentCard } from '../../../components/dashboard/AppointmentCard';
import { useAuthStore } from '../../../lib/store';

function usePatient(id: string) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`).then((r) => r.data),
  });
}

function useAttempts(id: string) {
  return useQuery({
    queryKey: ['patient-attempts', id],
    queryFn: () => api.get(`/patients/${id}/attempts`).then((r) => r.data),
    staleTime: 30_000,
  });
}

const OUTCOME_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  scheduled:    { label: 'Scheduled',  icon: 'checkmark-circle', color: '#16a34a' },
  no_answer:    { label: 'No answer',  icon: 'call',             color: '#6b7280' },
  voicemail:    { label: 'Voicemail',  icon: 'recording',        color: '#d97706' },
  declined:     { label: 'Declined',   icon: 'close-circle',     color: '#dc2626' },
  wrong_number: { label: 'Wrong #',    icon: 'ban',              color: '#9ca3af' },
  reached:      { label: 'Reached',    icon: 'checkmark',        color: '#2563eb' },
  busy:         { label: 'Busy',       icon: 'time',             color: '#7c3aed' },
};

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function PatientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role } = useAuthStore();
  const { data: patient, isLoading } = usePatient(id);
  const { data: attempts = [] } = useAttempts(id);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">{patient?.name}</Text>
        <TouchableOpacity
          onPress={() => router.push(`/(agent)/copilot?context=patient:${id}`)}
          className="flex-row items-center gap-1.5 bg-primary-50 border border-primary-100 px-3 py-1.5 rounded-full"
        >
          <Ionicons name="sparkles-outline" size={14} color="#2563eb" />
          <Text className="text-primary-700 text-xs font-medium">Ask Copilot</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 pb-10">
        {/* Contact Info */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contact</Text>
          <InfoRow icon="call-outline" label="Phone" value={patient?.phone ?? '—'} />
          <InfoRow icon="mail-outline" label="Email" value={patient?.email ?? '—'} />
          <InfoRow icon="chatbubble-outline" label="Preferred" value={patient?.preferredContact ?? '—'} />
        </View>

        {/* Provider + Status */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Care</Text>
          <InfoRow icon="person-outline" label="Provider" value={patient?.assignedProvider ?? 'Unassigned'} />
          <InfoRow icon="list-outline" label="Waitlist" value={patient?.waitlistStatus ?? '—'} />
          <InfoRow icon="git-network-outline" label="Referral" value={patient?.referralSource ?? '—'} />
        </View>

        {/* Contact History */}
        {attempts.length > 0 && (
          <>
            <Text className="text-base font-semibold text-gray-900 mb-3">Contact History</Text>
            <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
              {attempts.map((a: any, i: number) => {
                const cfg = OUTCOME_CONFIG[a.outcome] ?? { label: a.outcome, icon: 'ellipse', color: '#9ca3af' };
                return (
                  <View
                    key={a.id}
                    className={`px-4 py-3 flex-row items-center gap-3 ${i < attempts.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    <View className="w-7 h-7 rounded-full items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${cfg.color}18` }}>
                      <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-gray-800 text-sm font-medium">{cfg.label}</Text>
                      {a.notes ? (
                        <Text className="text-gray-400 text-xs mt-0.5 italic">"{a.notes}"</Text>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <Text className="text-gray-400 text-xs">{timeAgo(a.createdAt)}</Text>
                      {a.agentName ? (
                        <Text className="text-gray-300 text-xs mt-0.5">{a.agentName.split(' ')[0]}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {role === 'administrator' && <LinkedAccounts patientId={id} />}

        {/* Recent Appointments */}
        <Text className="text-base font-semibold text-gray-900 mb-3">Recent Appointments</Text>
        {patient?.recentAppointments?.length ? (
          patient.recentAppointments.map((appt: any) => (
            <AppointmentCard key={appt.id} appt={appt} />
          ))
        ) : (
          <View className="bg-white rounded-xl border border-gray-100 p-6 items-center">
            <Text className="text-gray-400 text-sm">No appointment history</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LinkedAccounts({ patientId }: { patientId: string }) {
  const queryClient = useQueryClient();

  const { data: links = [] } = useQuery({
    queryKey: ['patient-links', patientId],
    queryFn: () => patientLinksApi.getLinks(patientId),
  });
  const { data: suggestions = [] } = useQuery({
    queryKey: ['patient-link-suggestions', patientId],
    queryFn: () => patientLinksApi.getSuggestions(patientId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['patient-links', patientId] });
    queryClient.invalidateQueries({ queryKey: ['patient-link-suggestions', patientId] });
  };

  const linkMutation = useMutation({
    mutationFn: (targetId: string) => patientLinksApi.create(patientId, targetId),
    onSuccess: invalidate,
  });
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => patientLinksApi.remove(linkId),
    onSuccess: invalidate,
  });

  if (links.length === 0 && suggestions.length === 0) return null;

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Linked Accounts
      </Text>
      {links.map((link: any) => (
        <View key={link.linkId} className="flex-row items-center gap-3 mb-3 last:mb-0">
          <View className="w-7 h-7 bg-gray-50 rounded-lg items-center justify-center">
            <Ionicons name="link-outline" size={14} color="#6b7280" />
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 text-sm font-medium">{link.name}</Text>
            <Text className="text-gray-400 text-xs">{link.practiceName}</Text>
          </View>
          <TouchableOpacity onPress={() => unlinkMutation.mutate(link.linkId)}>
            <Text className="text-red-500 text-xs font-medium">Unlink</Text>
          </TouchableOpacity>
        </View>
      ))}
      {suggestions.map((s: any) => (
        <View key={s.patientId} className="flex-row items-center gap-3 mb-3 last:mb-0">
          <View className="w-7 h-7 bg-amber-50 rounded-lg items-center justify-center">
            <Ionicons name="help-outline" size={14} color="#d97706" />
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 text-sm font-medium">Possible match: {s.name}</Text>
            <Text className="text-gray-400 text-xs">
              {s.practiceName} · matched on {s.matchedOn}
            </Text>
          </View>
          <TouchableOpacity onPress={() => linkMutation.mutate(s.patientId)}>
            <Text className="text-primary-600 text-xs font-medium">Link</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-3 mb-3 last:mb-0">
      <View className="w-7 h-7 bg-gray-50 rounded-lg items-center justify-center">
        <Ionicons name={icon} size={14} color="#6b7280" />
      </View>
      <Text className="text-gray-500 text-sm w-20">{label}</Text>
      <Text className="text-gray-900 text-sm font-medium flex-1">{value}</Text>
    </View>
  );
}
