import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Candidate {
  patientId: string;
  name: string;
  phone: string;
  email: string;
  preferredContact: string;
  source: 'urgent_waitlist' | 'waitlist' | 'cadence';
  waitlistType?: string;
  daysWaiting?: number;
  lastVisitDate?: string;
  cadenceDays?: number;
  daysOverdue?: number;
  preferredDayMatch: boolean;
  preferredTimeMatch: boolean;
  score: number;
  waitlistEntryId?: string;
}

const SOURCE_CONFIG = {
  urgent_waitlist: { label: 'Urgent', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: 'alert-circle' as const },
  waitlist:        { label: 'Waitlist', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: 'list' as const },
  cadence:         { label: 'Due for visit', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', icon: 'refresh' as const },
};

const OUTCOMES = [
  { key: 'scheduled',    label: 'Scheduled',   icon: 'checkmark-circle' as const, color: '#16a34a' },
  { key: 'no_answer',    label: 'No Answer',   icon: 'call' as const,             color: '#6b7280' },
  { key: 'voicemail',    label: 'Voicemail',   icon: 'recording' as const,        color: '#d97706' },
  { key: 'declined',     label: 'Declined',    icon: 'close-circle' as const,     color: '#dc2626' },
  { key: 'wrong_number', label: 'Wrong #',     icon: 'ban' as const,              color: '#9ca3af' },
];

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function cadenceLabel(days: number) {
  if (days <= 7) return 'Weekly';
  if (days <= 10) return 'Every 1.5 weeks';
  if (days <= 16) return 'Bi-weekly';
  if (days <= 23) return 'Every 3 weeks';
  if (days <= 35) return 'Monthly';
  if (days <= 50) return 'Every 6 weeks';
  if (days <= 65) return 'Every 2 months';
  return `Every ~${Math.round(days / 7)} weeks`;
}

// ─── Candidate Card ──────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  rank,
  providerId,
  slotStartAt,
  slotEndAt,
}: {
  candidate: Candidate;
  rank: number;
  providerId: string;
  slotStartAt: string;
  slotEndAt: string;
}) {
  const [expanded, setExpanded] = useState(rank === 1); // first candidate open by default
  const [outcomeModal, setOutcomeModal] = useState(false);
  const [booked, setBooked] = useState(false);
  const [callLogged, setCallLogged] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const cfg = SOURCE_CONFIG[candidate.source];

  const logAttempt = useMutation({
    mutationFn: (outcome: string) =>
      api.post(`/providers/${providerId}/log-attempt`, {
        patientId: candidate.patientId,
        attemptType: 'call',
        outcome,
      }),
    onSuccess: (_, outcome) => {
      setCallLogged(outcome);
      setOutcomeModal(false);
      if (outcome === 'scheduled') {
        // Book the appointment
        api.post(`/providers/${providerId}/appointments`, {
          patientId: candidate.patientId,
          startAt: slotStartAt,
          endAt: slotEndAt,
          locationType: 'in_person',
        }).then(() => {
          setBooked(true);
          queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
          Alert.alert('Appointment Booked', `${candidate.name} is now scheduled for ${fmt(slotStartAt)}.`);
        });
      }
    },
  });

  const handleCall = () => {
    if (candidate.phone) {
      Linking.openURL(`tel:${candidate.phone.replace(/\D/g, '')}`);
      setOutcomeModal(true);
    }
  };

  if (booked) {
    return (
      <View className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-3 flex-row items-center gap-3">
        <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
        <View>
          <Text className="text-green-800 font-semibold text-sm">{candidate.name} — Booked</Text>
          <Text className="text-green-600 text-xs mt-0.5">{fmt(slotStartAt)} slot filled</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View className={`mb-3 rounded-2xl border overflow-hidden ${callLogged ? 'opacity-60' : ''}`}
        style={{ borderColor: rank === 1 ? '#bfdbfe' : '#f3f4f6', backgroundColor: rank === 1 ? '#eff6ff' : '#fff' }}>

        {/* Header row */}
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          activeOpacity={0.7}
          className="px-4 py-3.5 flex-row items-center gap-3"
        >
          {/* Rank badge */}
          <View className="w-7 h-7 rounded-full items-center justify-center flex-shrink-0"
            style={{ backgroundColor: rank === 1 ? '#2563eb' : '#e5e7eb' }}>
            <Text style={{ color: rank === 1 ? '#fff' : '#6b7280', fontSize: 12, fontWeight: '700' }}>
              {rank}
            </Text>
          </View>

          <View className="flex-1">
            <Text className="text-gray-900 font-semibold text-sm">{candidate.name}</Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              {/* Source badge */}
              <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.border }}>
                <Ionicons name={cfg.icon} size={10} color={cfg.color} />
                <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '600' }}>{cfg.label}</Text>
              </View>
              {callLogged && (
                <Text className="text-gray-400 text-xs">
                  {OUTCOMES.find((o) => o.key === callLogged)?.label ?? callLogged}
                </Text>
              )}
            </View>
          </View>

          {/* Call button */}
          {!callLogged && (
            <TouchableOpacity
              onPress={handleCall}
              className="flex-row items-center gap-1.5 bg-primary-600 px-4 py-2 rounded-full"
            >
              <Ionicons name="call" size={14} color="#fff" />
              <Text className="text-white text-xs font-semibold">Call</Text>
            </TouchableOpacity>
          )}

          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color="#9ca3af" />
        </TouchableOpacity>

        {/* Expanded detail */}
        {expanded && (
          <View className="px-4 pb-4 pt-1 border-t border-gray-100 gap-2">
            {/* Contact info */}
            <View className="flex-row gap-4">
              <DetailPill icon="call-outline" label={candidate.phone ?? '—'} />
              <DetailPill icon="mail-outline" label={candidate.email ?? '—'} />
            </View>

            {/* Visit history — shown for ALL candidates */}
            <View className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex-row gap-2 flex-wrap">
              <View className="flex-1 min-w-[80px]">
                <Text className="text-gray-400 text-xs font-medium">Last visit</Text>
                <Text className="text-gray-800 text-sm font-semibold mt-0.5">
                  {candidate.lastVisitDate ? fmtDate(candidate.lastVisitDate) : 'No history'}
                </Text>
              </View>
              <View className="flex-1 min-w-[80px]">
                <Text className="text-gray-400 text-xs font-medium">Interval</Text>
                <Text className="text-gray-800 text-sm font-semibold mt-0.5">
                  {candidate.cadenceDays ? cadenceLabel(candidate.cadenceDays) : '—'}
                </Text>
              </View>
              <View className="flex-1 min-w-[80px]">
                <Text className="text-gray-400 text-xs font-medium">Next expected</Text>
                <Text
                  className="text-sm font-semibold mt-0.5"
                  style={{ color: (candidate.daysOverdue ?? 0) > 0 ? '#dc2626' : '#374151' }}
                >
                  {candidate.nextExpectedVisit
                    ? (candidate.daysOverdue ?? 0) > 0
                      ? `${candidate.daysOverdue}d overdue`
                      : fmtDate(candidate.nextExpectedVisit)
                    : '—'}
                </Text>
              </View>
            </View>

            {/* Waitlist-specific context */}
            {(candidate.source === 'waitlist' || candidate.source === 'urgent_waitlist') && (
              <View className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-blue-400 text-xs font-medium">Type</Text>
                  <Text className="text-blue-900 text-sm font-semibold mt-0.5 capitalize">
                    {candidate.waitlistType?.replace('_', ' ')}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-blue-400 text-xs font-medium">Waiting</Text>
                  <Text className="text-blue-900 text-sm font-semibold mt-0.5">
                    {candidate.daysWaiting}d
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-blue-400 text-xs font-medium">Day match</Text>
                  <Text className={`text-sm font-semibold mt-0.5 ${candidate.preferredDayMatch ? 'text-green-600' : 'text-gray-400'}`}>
                    {candidate.preferredDayMatch ? '✓ Yes' : '✗ No'}
                  </Text>
                </View>
              </View>
            )}

            {/* Script hint */}
            <View className="bg-gray-50 rounded-xl px-3 py-2.5">
              <Text className="text-gray-400 text-xs font-medium mb-1">Call script</Text>
              <Text className="text-gray-600 text-xs leading-5">
                {candidate.source === 'cadence'
                  ? `"Hi ${candidate.name.split(' ')[0]}, this is Charlene from Westside Mental Health. We have an opening today at ${fmt(slotStartAt)} with your provider — would you be able to come in?"`
                  : `"Hi ${candidate.name.split(' ')[0]}, this is Charlene from Westside Mental Health. We have an opening today at ${fmt(slotStartAt)} — I wanted to reach out since you're on our waitlist. Would that time work for you?"`}
              </Text>
            </View>

            {/* Log outcome without calling */}
            {!callLogged && (
              <TouchableOpacity
                onPress={() => setOutcomeModal(true)}
                className="flex-row items-center gap-1.5 self-start"
              >
                <Ionicons name="create-outline" size={13} color="#9ca3af" />
                <Text className="text-gray-400 text-xs">Log outcome manually</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Outcome modal */}
      <Modal visible={outcomeModal} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <Text className="text-base font-bold text-gray-900 mb-1">Log Call Outcome</Text>
            <Text className="text-gray-400 text-sm mb-5">{candidate.name}</Text>
            <View className="gap-2">
              {OUTCOMES.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  onPress={() => logAttempt.mutate(o.key)}
                  disabled={logAttempt.isPending}
                  className="flex-row items-center gap-3 px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50"
                >
                  <Ionicons name={o.icon} size={20} color={o.color} />
                  <Text className="text-gray-800 font-medium text-sm flex-1">{o.label}</Text>
                  {logAttempt.isPending && <ActivityIndicator size="small" color="#9ca3af" />}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setOutcomeModal(false)} className="mt-4 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DetailPill({ icon, label }: { icon: any; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={13} color="#9ca3af" />
      <Text className="text-gray-600 text-xs">{label}</Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function FillSlotScreen() {
  const { providerId, providerName, slotStartAt, slotEndAt } = useLocalSearchParams<{
    providerId: string;
    providerName: string;
    slotStartAt: string;
    slotEndAt: string;
  }>();

  const { data: candidates, isLoading } = useQuery({
    queryKey: ['fill-candidates', providerId, slotStartAt],
    queryFn: () =>
      api
        .get(`/providers/${providerId}/fill-candidates`, {
          params: { slotStartAt, slotEndAt },
        })
        .then((r) => r.data as Candidate[]),
    enabled: !!providerId && !!slotStartAt,
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="px-5 pt-3 pb-4 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1 mb-3">
          <Ionicons name="arrow-back" size={20} color="#6b7280" />
          <Text className="text-gray-500 text-sm">Back</Text>
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900">{providerName}</Text>
        <View className="flex-row items-center gap-2 mt-1">
          <View className="w-2 h-2 rounded-full bg-green-400" />
          <Text className="text-green-700 text-sm font-medium">
            Open slot: {slotStartAt ? fmt(slotStartAt) : ''} – {slotEndAt ? fmt(slotEndAt) : ''}
          </Text>
        </View>
        <Text className="text-gray-400 text-xs mt-1">
          {candidates?.length ?? 0} patients to call · ranked by priority
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pt-4 pb-10">
        {isLoading ? (
          <View className="flex-1 items-center pt-16">
            <ActivityIndicator color="#2563eb" />
            <Text className="text-gray-400 text-sm mt-3">Finding best matches…</Text>
          </View>
        ) : !candidates?.length ? (
          <View className="items-center pt-16">
            <Ionicons name="people-outline" size={48} color="#e5e7eb" />
            <Text className="text-gray-400 text-sm mt-3">No candidates found for this slot</Text>
            <TouchableOpacity
              onPress={() => router.push({
                pathname: '/(agent)/copilot',
                params: { prefill: `${providerName} has an open slot at ${fmt(slotStartAt ?? '')} — who should we reach out to?` },
              })}
              className="mt-4 flex-row items-center gap-2 bg-primary-50 border border-primary-100 px-4 py-2.5 rounded-full"
            >
              <Ionicons name="sparkles-outline" size={15} color="#2563eb" />
              <Text className="text-primary-700 text-sm font-medium">Ask Copilot</Text>
            </TouchableOpacity>
          </View>
        ) : (
          candidates.map((c, i) => (
            <CandidateCard
              key={c.patientId}
              candidate={c}
              rank={i + 1}
              providerId={providerId}
              slotStartAt={slotStartAt}
              slotEndAt={slotEndAt}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
