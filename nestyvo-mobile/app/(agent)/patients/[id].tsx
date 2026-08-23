import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, patientLinksApi, clientTagsApi, ticketsApi } from '../../../lib/api';
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
  const [ticketModal, setTicketModal] = useState(false);

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
          onPress={() => setTicketModal(true)}
          className="flex-row items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full mr-2"
        >
          <Ionicons name="flag-outline" size={14} color="#374151" />
          <Text className="text-gray-700 text-xs font-medium">Flag for office</Text>
        </TouchableOpacity>
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

        <TagSection patientId={id} tag={patient?.tag ?? null} practiceId={patient?.practiceId} practiceName={patient?.practiceName} />

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

      <TicketModal visible={ticketModal} onClose={() => setTicketModal(false)} patientId={id} />
    </SafeAreaView>
  );
}

const TICKET_CATEGORIES = ['scheduling', 'billing', 'clinical', 'technical', 'other'];
const TICKET_PRIORITIES = ['low', 'normal', 'high'];

function TicketModal({ visible, onClose, patientId }: { visible: boolean; onClose: () => void; patientId: string }) {
  const [category, setCategory] = useState('scheduling');
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const createTicket = useMutation({
    mutationFn: () => ticketsApi.create({ patientId, category, priority, subject, description }),
    onSuccess: () => setSubmitted(true),
    onError: (err: any) => {
      Alert.alert('Couldn\'t send ticket', err?.response?.data?.message || 'Please try again.');
    },
  });

  const reset = () => {
    setCategory('scheduling');
    setPriority('normal');
    setSubject('');
    setDescription('');
    setSubmitted(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={reset}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
          {submitted ? (
            <View className="items-center py-6">
              <Ionicons name="checkmark-circle" size={40} color="#16a34a" />
              <Text className="text-gray-900 font-semibold mt-3">Sent to the office</Text>
              <Text className="text-gray-400 text-sm mt-1 text-center">They'll follow up from here.</Text>
              <TouchableOpacity onPress={reset} className="mt-5 bg-gray-100 px-5 py-2.5 rounded-full">
                <Text className="text-gray-700 text-sm font-medium">Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text className="text-base font-bold text-gray-900 mb-1">Flag for Office</Text>
              <Text className="text-gray-400 text-sm mb-4">Hand this off for follow-up.</Text>

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

              <Text className="text-gray-500 text-xs font-medium mb-2">Priority</Text>
              <View className="flex-row gap-2 mb-4">
                {TICKET_PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(p)}
                    className={`px-3 py-1.5 rounded-full border ${priority === p ? 'bg-primary-600 border-primary-600' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <Text className={`text-xs font-medium capitalize ${priority === p ? 'text-white' : 'text-gray-600'}`}>{p}</Text>
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
                placeholder="What does the office need to know?"
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
                  <Text className="text-white font-semibold text-sm">Send to Office</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={reset} className="mt-3 items-center py-1">
                <Text className="text-gray-400 text-sm">Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function TagSection({
  patientId,
  tag,
  practiceId,
  practiceName,
}: {
  patientId: string;
  tag: { id: string; name: string; blockMinutes: number } | null;
  practiceId?: string;
  practiceName?: string;
}) {
  const [picker, setPicker] = useState(false);
  const queryClient = useQueryClient();
  const { role, practiceId: myPracticeId } = useAuthStore();
  const isCrossPractice = role === 'administrator' && practiceId && practiceId !== myPracticeId;

  const { data: tags = [] } = useQuery({
    queryKey: ['client-tags', practiceId],
    queryFn: () => clientTagsApi.list(practiceId),
    enabled: picker,
  });

  const setTag = useMutation({
    mutationFn: (tagId: string | null) => clientTagsApi.setPatientTag(patientId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
      // A tag change can flip this client's fill-matching rank on any open slot —
      // stale fill-candidates lists elsewhere in the app need to refetch too.
      queryClient.invalidateQueries({ queryKey: ['fill-candidates'] });
      setPicker(false);
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t update tag', err?.response?.data?.message || 'Please try again.');
    },
  });

  return (
    <>
      <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Block Size</Text>
        <TouchableOpacity onPress={() => setPicker(true)} className="flex-row items-center gap-3">
          <View className="w-7 h-7 bg-gray-50 rounded-lg items-center justify-center">
            <Ionicons name="time-outline" size={14} color="#6b7280" />
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 text-sm font-medium">{tag ? tag.name : 'No tag set'}</Text>
            {tag ? <Text className="text-gray-400 text-xs">{tag.blockMinutes} min</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <Text className="text-base font-bold text-gray-900">Set Block Size</Text>
            {isCrossPractice ? (
              <Text className="text-gray-400 text-xs mb-4">{practiceName}'s tags</Text>
            ) : (
              <View className="mb-4" />
            )}
            <View className="gap-2">
              {tags.map((t: any) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setTag.mutate(t.id)}
                  className="flex-row items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50"
                >
                  <Text className="text-gray-800 font-medium text-sm">{t.name}</Text>
                  <Text className="text-gray-400 text-xs">{t.blockMinutes} min</Text>
                </TouchableOpacity>
              ))}
              {tags.length === 0 ? (
                <Text className="text-gray-400 text-sm text-center py-4">No tags yet.</Text>
              ) : null}
            </View>
            {tag ? (
              <TouchableOpacity onPress={() => setTag.mutate(null)} className="mt-4 items-center py-2">
                <Text className="text-red-500 text-sm">Clear tag</Text>
              </TouchableOpacity>
            ) : null}
            {(role === 'administrator' || role === 'practice_manager') && !isCrossPractice && (
              <TouchableOpacity
                onPress={() => { setPicker(false); router.push('/(agent)/tags'); }}
                className="mt-2 items-center py-2"
              >
                <Text className="text-primary-600 text-sm font-medium">Manage tags</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setPicker(false)} className="mt-1 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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

  const onLinkError = (err: any) => {
    Alert.alert('Couldn\'t update link', err?.response?.data?.message || 'Please try again.');
  };
  const linkMutation = useMutation({
    mutationFn: (targetId: string) => patientLinksApi.create(patientId, targetId),
    onSuccess: invalidate,
    onError: onLinkError,
  });
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => patientLinksApi.remove(linkId),
    onSuccess: invalidate,
    onError: onLinkError,
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
