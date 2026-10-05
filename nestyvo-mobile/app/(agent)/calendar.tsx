import { useState, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { api, providersApi } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';
import { AppointmentCard } from '../../components/dashboard/AppointmentCard';

// ── Data ────────────────────────────────────────────────────────────────────

function useDashboard() {
  return useQuery({
    queryKey: ['agent-dashboard'],
    queryFn: () => api.get('/dashboard/agent').then((r) => r.data),
    staleTime: 60_000,
  });
}

// Workstream A (Oct 3 2026) — this screen previously only ever showed open
// slots (slotsByDate off the dashboard response). getSchedule already
// existed, already ownership-checked, already merges in real Nestyvo
// appointments + synced Rula/Headway busy blocks for a given provider/day —
// it just had no caller on the agent/admin side. This is that caller.
function useBookedAppointments(providerId: string, date: string) {
  return useQuery({
    queryKey: ['provider-schedule', providerId, date],
    queryFn: () => providersApi.getSchedule(providerId, date),
    enabled: !!providerId,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const TZ = 'America/Los_Angeles';

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

// Returns today's date string in PT
function todayPT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // 'en-CA' → YYYY-MM-DD
}

// Days in a month
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// 0=Sun, day of week the 1st falls on
function firstDOW(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// YYYY-MM-DD for a given year/month/day
function isoOf(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Charlene, Phase 7 item 19 (Oct 5 2026) — "Provider selection must scale."
// The horizontal row of provider bubbles across the top doesn't scale past
// a handful of providers. Replaced with a single button that opens this
// searchable picker — same list, same selection behavior, underlying
// calendar/scheduling logic (slotsMap, getSchedule, booking) untouched.
// Inactive providers already don't reach this list at all — `providers`
// comes from the dashboard's getScopedProviderIds, already filtered to
// ACTIVE_PROVIDER_WHERE (see provider.entity.ts).
function ProviderPickerModal({
  visible, onClose, providers, activeProviderId, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  providers: any[];
  activeProviderId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.name.toLowerCase().includes(q) || p.practiceName?.toLowerCase().includes(q));
  }, [providers, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-8 max-h-[75%]">
          <Text className="text-base font-bold text-gray-900 mb-3">Select Provider</Text>
          <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 mb-3">
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search providers…"
              placeholderTextColor="#9ca3af"
              className="flex-1 py-2.5 px-2 text-sm text-gray-900"
              autoCapitalize="none"
              autoFocus
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView className="max-h-96">
            {filtered.length === 0 ? (
              <Text className="text-gray-400 text-sm text-center py-6">No providers match</Text>
            ) : (
              filtered.map((p) => {
                const active = p.id === activeProviderId;
                const openCount = (p.slotsByDate ?? []).reduce((s: number, d: any) => s + d.slots.length, 0);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => { onSelect(p.id); setQuery(''); onClose(); }}
                    className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl border mb-2 ${
                      active ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-100'
                    }`}
                  >
                    <View className="flex-1">
                      <Text className={`font-medium text-sm ${active ? 'text-primary-700' : 'text-gray-800'}`}>{p.name}</Text>
                      {p.practiceName ? <Text className="text-gray-400 text-xs mt-0.5">{p.practiceName}</Text> : null}
                    </View>
                    {openCount > 0 && (
                      <View className={`rounded-full px-2 py-0.5 ${active ? 'bg-primary-100' : 'bg-green-100'}`}>
                        <Text className={`text-xs font-bold ${active ? 'text-primary-700' : 'text-green-700'}`}>{openCount}</Text>
                      </View>
                    )}
                    {active && <Ionicons name="checkmark-circle" size={18} color="#2563eb" style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const {
    initialProviderId, bookingPatientId, bookingPatientName, callbackId,
    rescheduleAppointmentId, rescheduleProviderId, reschedulePatientName,
  } = useLocalSearchParams<{
    initialProviderId?: string;
    bookingPatientId?: string;
    bookingPatientName?: string;
    callbackId?: string;
    // Workstream B (Oct 3 2026) — "pick a new time" mode, reached from the
    // appointment-detail screen's Reschedule action. Reuses this same
    // day/slot picker rather than building a second one; the appointment's
    // provider can't change in a reschedule (AppointmentsService.reschedule
    // keeps the same providerId), so the provider stays locked to this one.
    rescheduleAppointmentId?: string;
    rescheduleProviderId?: string;
    reschedulePatientName?: string;
  }>();
  const isRescheduling = !!rescheduleAppointmentId;
  const today = todayPT();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedProviderId, setSelectedProviderId] = useState(initialProviderId ?? rescheduleProviderId ?? '');
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const dayDetailY = useRef(0);

  const rescheduleMutation = useMutation({
    mutationFn: ({ newStartAt, newEndAt }: { newStartAt: string; newEndAt: string }) =>
      providersApi.rescheduleAppointment(rescheduleProviderId!, rescheduleAppointmentId!, { newStartAt, newEndAt }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['provider-schedule'] });
      router.replace({
        pathname: '/(agent)/appointments/[id]',
        params: { id: saved.id, providerId: rescheduleProviderId! },
      });
    },
    onError: (err: any) => {
      Alert.alert("Couldn't reschedule", err?.response?.data?.message || 'Please try again.');
    },
  });

  const { data, isLoading } = useDashboard();

  const providers: any[] = data?.providers ?? [];

  // Auto-select first provider when data loads (or the one passed in via params)
  const activeProviderId = selectedProviderId || initialProviderId || providers[0]?.id || '';

  const { data: bookedForDay = [], isLoading: bookedLoading } = useBookedAppointments(activeProviderId, selectedDate);

  // Build a map: date → slot array for the active provider
  const slotsMap = useMemo<Record<string, any[]>>(() => {
    const provider = providers.find((p) => p.id === activeProviderId);
    if (!provider?.slotsByDate) return {};
    const map: Record<string, any[]> = {};
    for (const day of provider.slotsByDate) {
      map[day.date] = day.slots;
    }
    return map;
  }, [providers, activeProviderId]);

  // Slots for the currently selected date
  const selectedSlots: any[] = slotsMap[selectedDate] ?? [];

  const selectedProvider = providers.find((p) => p.id === activeProviderId);

  // Charlene, Phase 7 item 20 — "clear days containing activity." A day
  // that's fully booked (real appointments, zero remaining open slots)
  // used to look identical to a day the provider just doesn't work, since
  // only slot data drove the dots. activeDates (booked appts + blocks,
  // from the dashboard response) fills that gap without touching slot math.
  const activeDatesSet = useMemo(() => new Set<string>(selectedProvider?.activeDates ?? []), [selectedProvider]);

  // Month navigation
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // Charlene, Phase 7 item 20 — "smooth transition between calendar/date and
  // daily schedule." Tapping a date already updated the day-detail section
  // below in place (no screen change), but on a short screen it could sit
  // below the fold with no visible change until the user scrolled manually.
  // Auto-scroll to it on selection — presentation only, no scheduling logic.
  const selectDate = (iso: string) => {
    setSelectedDate(iso);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(dayDetailY.current - 12, 0), animated: true });
    });
  };

  // Build calendar grid cells
  const numDays = daysInMonth(year, month);
  const startDOW = firstDOW(year, month);
  const cells: Array<number | null> = [
    ...Array(startDOW).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];
  // Pad to full week rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="pb-10">
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Text className="text-xl font-bold text-gray-900 flex-1">Calendar</Text>
          <HomeButton href="/(agent)" />
        </View>

        {bookingPatientId && (
          <View className="mx-5 mb-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex-row items-center gap-2">
            <Ionicons name="person-add-outline" size={16} color="#2563eb" />
            <Text className="text-primary-700 text-sm font-medium flex-1">
              Pick an open slot to book {bookingPatientName}
            </Text>
          </View>
        )}

        {isRescheduling && (
          <View className="mx-5 mb-3 bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex-row items-center gap-2">
            <Ionicons name="swap-horizontal-outline" size={16} color="#7c3aed" />
            <Text className="text-sm font-medium flex-1" style={{ color: '#7c3aed' }}>
              Pick a new time{reschedulePatientName ? ` for ${reschedulePatientName}` : ''}
            </Text>
          </View>
        )}

        {/* Provider selector — Phase 7 item 19, see ProviderPickerModal above */}
        {isLoading ? (
          <View className="px-5 pb-3">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : (
          <View className="px-4 pb-3">
            <TouchableOpacity
              onPress={() => setProviderPickerOpen(true)}
              className="flex-row items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3"
            >
              <View className="flex-row items-center gap-2 flex-1">
                <Ionicons name="person-outline" size={16} color="#6b7280" />
                <Text className="text-gray-900 font-medium text-sm flex-1" numberOfLines={1}>
                  {selectedProvider?.name ?? 'Select a provider'}
                </Text>
                {(selectedProvider?.openSlotCount ?? 0) > 0 && (
                  <View className="bg-green-100 rounded-full px-2 py-0.5">
                    <Text className="text-green-700 text-xs font-bold">{selectedProvider.openSlotCount}</Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        )}

        <ProviderPickerModal
          visible={providerPickerOpen}
          onClose={() => setProviderPickerOpen(false)}
          providers={providers}
          activeProviderId={activeProviderId}
          onSelect={setSelectedProviderId}
        />

        {/* Month grid */}
        <View className="bg-white mx-4 rounded-2xl border border-gray-100 overflow-hidden mb-4">
          {/* Month nav */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-50">
            <TouchableOpacity onPress={prevMonth} className="p-1">
              <Ionicons name="chevron-back" size={20} color="#374151" />
            </TouchableOpacity>
            <Text className="text-base font-bold text-gray-900">
              {MONTH_NAMES[month]} {year}
            </Text>
            <TouchableOpacity onPress={nextMonth} className="p-1">
              <Ionicons name="chevron-forward" size={20} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          <View className="flex-row px-2 pt-2 pb-1">
            {DOW.map((d) => (
              <View key={d} className="flex-1 items-center">
                <Text className="text-xs font-medium text-gray-400">{d}</Text>
              </View>
            ))}
          </View>

          {/* Calendar cells */}
          <View className="px-2 pb-2">
            {Array.from({ length: cells.length / 7 }, (_, week) => (
              <View key={week} className="flex-row">
                {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
                  if (!day) return <View key={i} className="flex-1 aspect-square" />;
                  const iso = isoOf(year, month, day);
                  const isToday = iso === today;
                  const isSelected = iso === selectedDate;
                  const hasSlots = (slotsMap[iso]?.length ?? 0) > 0;
                  const slotCount = slotsMap[iso]?.length ?? 0;
                  const isPast = iso < today;
                  // Phase 7 item 20 — "clear days containing activity." A
                  // fully-booked day (real appointments, no open slots left)
                  // previously looked exactly like an empty one. Distinct
                  // dot color so it isn't confused with "nothing this day."
                  const hasBookedOnly = !hasSlots && activeDatesSet.has(iso);

                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => selectDate(iso)}
                      className="flex-1 aspect-square items-center justify-center rounded-xl m-0.5"
                      style={
                        isSelected
                          ? { backgroundColor: '#2563eb' }
                          : hasSlots
                          ? { backgroundColor: '#f0fdf4' }
                          : hasBookedOnly
                          ? { backgroundColor: '#f5f3ff' }
                          : undefined
                      }
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          isSelected
                            ? 'text-white'
                            : isToday
                            ? 'text-primary-600'
                            : isPast
                            ? 'text-gray-300'
                            : hasSlots
                            ? 'text-green-800'
                            : hasBookedOnly
                            ? 'text-purple-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {day}
                      </Text>
                      {hasSlots && !isSelected && (
                        <View className="w-1 h-1 rounded-full bg-green-500 mt-0.5" />
                      )}
                      {hasBookedOnly && !isSelected && (
                        <View className="w-1 h-1 rounded-full bg-purple-500 mt-0.5" />
                      )}
                      {isSelected && slotCount > 0 && (
                        <View className="w-1 h-1 rounded-full bg-white/60 mt-0.5" />
                      )}
                      {isToday && !isSelected && !hasSlots && !hasBookedOnly && (
                        <View className="w-1 h-1 rounded-full bg-primary-400 mt-0.5" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Legend — the purple "booked" dot is new (Phase 7 item 20); worth
            one line so it doesn't read as an unexplained color change. */}
        <View className="flex-row items-center gap-4 px-5 mb-3">
          <View className="flex-row items-center gap-1.5">
            <View className="w-2 h-2 rounded-full bg-green-500" />
            <Text className="text-xs text-gray-400">Open</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="w-2 h-2 rounded-full bg-purple-500" />
            <Text className="text-xs text-gray-400">Booked</Text>
          </View>
        </View>

        {/* Day heading, shared by the Booked and Open Slots sections below.
            onLayout feeds selectDate()'s auto-scroll target. */}
        <View className="px-4 mb-1" onLayout={(e) => { dayDetailY.current = e.nativeEvent.layout.y; }}>
          <Text className="text-sm font-semibold text-gray-900">
            {selectedDate === today
              ? 'Today'
              : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
          </Text>
          {selectedProvider && <Text className="text-xs text-gray-400 mt-0.5">{selectedProvider.name}</Text>}
        </View>

        {/* Booked appointments for the selected day — Workstream A (Oct 3
            2026): Charlene's literal example (Peace of Mind -> Gencia ->
            a specific date) was that an admin/agent could see a slot was
            occupied but not who, or click into it. getSchedule already
            carries real Nestyvo appointments + synced external (Rula/
            Headway) busy blocks for this exact day. */}
        {activeProviderId && (
          <View className="px-4 mb-2 mt-2">
            <Text className="text-sm font-semibold text-gray-900 mb-3">
              Booked{bookedForDay.length > 0 ? ` (${bookedForDay.length})` : ''}
            </Text>
            {bookedLoading ? (
              <ActivityIndicator color="#2563eb" />
            ) : bookedForDay.length === 0 ? (
              <View className="bg-white rounded-2xl border border-gray-100 p-5 items-center mb-2">
                <Text className="text-gray-400 text-sm">Nothing booked this day</Text>
              </View>
            ) : (
              bookedForDay.map((a: any) => (
                <AppointmentCard
                  key={a.id}
                  appt={a}
                  onPress={
                    a.source !== 'external'
                      ? () =>
                          router.push({
                            pathname: '/(agent)/appointments/[id]',
                            params: { id: a.id, providerId: activeProviderId },
                          })
                      : undefined
                  }
                />
              ))
            )}
          </View>
        )}

        {/* Selected day slots */}
        <View className="px-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-semibold text-gray-900">
              Open Slots{selectedSlots.length > 0 ? ` (${selectedSlots.length})` : ''}
            </Text>
          </View>

          {selectedSlots.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-6 items-center">
              <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
              <Text className="text-gray-400 text-sm mt-2">
                {activeProviderId
                  ? 'No open slots this day'
                  : 'Select a provider above'}
              </Text>
            </View>
          ) : (
            selectedSlots.map((slot: any, i: number) => (
              <View
                key={slot.startAt}
                className={`bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex-row items-center gap-3 ${
                  i < selectedSlots.length - 1 ? 'mb-2' : ''
                }`}
              >
                <View className="w-9 h-9 rounded-xl bg-green-50 items-center justify-center flex-shrink-0">
                  <Ionicons name="time-outline" size={18} color="#16a34a" />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-900 font-semibold text-sm">
                    {fmt(slot.startAt)} – {fmt(slot.endAt)}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">{slot.durationMin} min · Open</Text>
                </View>
                <TouchableOpacity
                  disabled={isRescheduling && rescheduleMutation.isPending}
                  onPress={() => {
                    if (isRescheduling) {
                      Alert.alert(
                        'Reschedule to this time?',
                        `${fmt(slot.startAt)} – ${fmt(slot.endAt)}`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Confirm',
                            onPress: () => rescheduleMutation.mutate({ newStartAt: slot.startAt, newEndAt: slot.endAt }),
                          },
                        ],
                      );
                    } else if (bookingPatientId) {
                      router.push({
                        pathname: '/(agent)/book-slot',
                        params: {
                          providerId: activeProviderId,
                          providerName: selectedProvider?.name ?? '',
                          slotStartAt: slot.startAt,
                          slotEndAt: slot.endAt,
                          patientId: bookingPatientId,
                          patientName: bookingPatientName ?? '',
                          callbackId: callbackId ?? '',
                        },
                      });
                    } else {
                      router.push({
                        pathname: '/(agent)/fill-slot',
                        params: {
                          providerId: activeProviderId,
                          providerName: selectedProvider?.name ?? '',
                          slotStartAt: slot.startAt,
                          slotEndAt: slot.endAt,
                        },
                      });
                    }
                  }}
                  className="bg-primary-600 rounded-full px-4 py-2 flex-row items-center gap-1.5"
                  style={isRescheduling ? { backgroundColor: '#7c3aed' } : undefined}
                >
                  {isRescheduling && rescheduleMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={isRescheduling ? 'swap-horizontal-outline' : bookingPatientId ? 'checkmark-outline' : 'people-outline'}
                        size={14}
                        color="#fff"
                      />
                      <Text className="text-white text-sm font-semibold">
                        {isRescheduling ? 'Move Here' : bookingPatientId ? 'Book' : 'Fill'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
