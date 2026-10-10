import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api, providersApi } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

// Oct 9 2026 — Charlene's click-through: "there is no waitlist
// recommendation here... at all." Two real gaps, both now closed: the
// backend route was OFFICE_STAFF-only (fixed in providers.controller.ts,
// same recurring PROVIDER-role gap as everywhere else this pilot), and —
// separately — there was no screen anywhere under app/(provider)/ that
// called it at all. This is a deliberately smaller version of the agent
// side's fill-slot.tsx: no call-attempt logging (that's an agent-specific
// workflow — Charlene's own Aug 18 notes: Gloria doesn't want to be the
// one making outbound calls), just the ranked list with a direct Book
// action per candidate, same hand-off into book-slot.tsx the agent side
// already uses.

const TZ = 'America/Los_Angeles';
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

const SOURCE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  urgent_waitlist: { label: 'Urgent Waitlist', color: '#dc2626', bg: '#fef2f2' },
  waitlist: { label: 'Waitlist', color: '#2563eb', bg: '#eff6ff' },
  cadence: { label: 'Due for Visit', color: '#d97706', bg: '#fffbeb' },
};

export default function ProviderFillCandidatesScreen() {
  const { slotStartAt, slotEndAt } = useLocalSearchParams<{ slotStartAt: string; slotEndAt: string }>();

  const { data: self } = useQuery({ queryKey: ['provider-self'], queryFn: providersApi.getSelf });

  const { data: candidates, isLoading } = useQuery({
    queryKey: ['fill-candidates', self?.id, slotStartAt],
    queryFn: () =>
      api
        .get(`/providers/${self!.id}/fill-candidates`, { params: { slotStartAt, slotEndAt } })
        .then((r) => r.data as any[]),
    enabled: !!self?.id && !!slotStartAt,
  });

  const book = (patientId: string, patientName: string) => {
    router.replace({
      pathname: '/(agent)/book-slot',
      params: {
        providerId: self?.id ?? '',
        providerName: self ? `${self.firstName} ${self.lastName}` : '',
        slotStartAt, slotEndAt,
        patientId, patientName,
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900">Suggested Clients</Text>
          {slotStartAt && slotEndAt && (
            <Text className="text-gray-400 text-xs mt-0.5">{fmtTime(slotStartAt)} – {fmtTime(slotEndAt)}</Text>
          )}
        </View>
        <HomeButton href="/(provider)" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 pb-10">
        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : !candidates?.length ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Ionicons name="people-outline" size={36} color="#d1d5db" />
            <Text className="text-gray-500 font-semibold mt-3">No candidates for this slot</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">
              Nobody on the waitlist or due for a visit matches this time.
            </Text>
          </View>
        ) : (
          candidates.map((c, i) => {
            const cfg = SOURCE_LABEL[c.source] ?? SOURCE_LABEL.cadence;
            return (
              <View key={c.patientId} className="bg-white rounded-2xl border border-gray-100 p-4 mb-2.5">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-gray-900 font-semibold text-sm flex-1">{i + 1}. {c.name}</Text>
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg }}>
                    <Text className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</Text>
                  </View>
                </View>
                {c.daysWaiting !== undefined && (
                  <Text className="text-gray-400 text-xs mb-2">Waiting {c.daysWaiting} day{c.daysWaiting === 1 ? '' : 's'}</Text>
                )}
                {c.daysOverdue !== undefined && c.daysOverdue > 0 && (
                  <Text className="text-gray-400 text-xs mb-2">{c.daysOverdue} days overdue for a visit</Text>
                )}
                <TouchableOpacity
                  onPress={() => book(c.patientId, c.name)}
                  className="bg-primary-600 rounded-xl py-2.5 items-center"
                >
                  <Text className="text-white text-sm font-semibold">Book This Slot</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
