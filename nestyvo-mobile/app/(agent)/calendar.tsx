import { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';

// ── Data ────────────────────────────────────────────────────────────────────

function useDashboard() {
  return useQuery({
    queryKey: ['agent-dashboard'],
    queryFn: () => api.get('/dashboard/agent').then((r) => r.data),
    staleTime: 60_000,
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

// ── Component ────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { initialProviderId, bookingPatientId, bookingPatientName, callbackId } = useLocalSearchParams<{
    initialProviderId?: string;
    bookingPatientId?: string;
    bookingPatientName?: string;
    callbackId?: string;
  }>();
  const today = todayPT();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedProviderId, setSelectedProviderId] = useState(initialProviderId ?? '');

  const { data, isLoading } = useDashboard();

  const providers: any[] = data?.providers ?? [];

  // Auto-select first provider when data loads (or the one passed in via params)
  const activeProviderId = selectedProviderId || initialProviderId || providers[0]?.id || '';

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

  // Month navigation
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
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

  const selectedProvider = providers.find((p) => p.id === activeProviderId);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <ScrollView className="flex-1" contentContainerClassName="pb-10">
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-xl font-bold text-gray-900">Calendar</Text>
        </View>

        {bookingPatientId && (
          <View className="mx-5 mb-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex-row items-center gap-2">
            <Ionicons name="person-add-outline" size={16} color="#2563eb" />
            <Text className="text-primary-700 text-sm font-medium flex-1">
              Pick an open slot to book {bookingPatientName}
            </Text>
          </View>
        )}

        {/* Provider chips */}
        {isLoading ? (
          <View className="px-5 pb-3">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pb-3">
            {providers.map((p: any) => {
              const active = p.id === activeProviderId;
              const openCount = (p.slotsByDate ?? []).reduce((s: number, d: any) => s + d.slots.length, 0);
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedProviderId(p.id)}
                  className={`mr-2 px-4 py-2 rounded-full border flex-row items-center gap-1.5 ${
                    active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'
                  }`}
                >
                  <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>
                    {p.name}
                  </Text>
                  {openCount > 0 && (
                    <View className={`rounded-full px-1.5 py-0.5 ${active ? 'bg-white/20' : 'bg-green-100'}`}>
                      <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-green-700'}`}>
                        {openCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

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

                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setSelectedDate(iso)}
                      className="flex-1 aspect-square items-center justify-center rounded-xl m-0.5"
                      style={
                        isSelected
                          ? { backgroundColor: '#2563eb' }
                          : hasSlots
                          ? { backgroundColor: '#f0fdf4' }
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
                            : 'text-gray-700'
                        }`}
                      >
                        {day}
                      </Text>
                      {hasSlots && !isSelected && (
                        <View className="w-1 h-1 rounded-full bg-green-500 mt-0.5" />
                      )}
                      {isSelected && slotCount > 0 && (
                        <View className="w-1 h-1 rounded-full bg-white/60 mt-0.5" />
                      )}
                      {isToday && !isSelected && !hasSlots && (
                        <View className="w-1 h-1 rounded-full bg-primary-400 mt-0.5" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Selected day slots */}
        <View className="px-4">
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-sm font-semibold text-gray-900">
                {selectedDate === today
                  ? 'Today'
                  : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric',
                    })}
              </Text>
              <Text className="text-xs text-gray-400 mt-0.5">
                {selectedSlots.length > 0
                  ? `${selectedSlots.length} open slot${selectedSlots.length !== 1 ? 's' : ''}`
                  : 'No open slots'}
                {selectedProvider ? ` · ${selectedProvider.name}` : ''}
              </Text>
            </View>
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
                  onPress={() =>
                    bookingPatientId
                      ? router.push({
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
                        })
                      : router.push({
                          pathname: '/(agent)/fill-slot',
                          params: {
                            providerId: activeProviderId,
                            providerName: selectedProvider?.name ?? '',
                            slotStartAt: slot.startAt,
                            slotEndAt: slot.endAt,
                          },
                        })
                  }
                  className="bg-primary-600 rounded-full px-4 py-2 flex-row items-center gap-1.5"
                >
                  <Ionicons name={bookingPatientId ? 'checkmark-outline' : 'people-outline'} size={14} color="#fff" />
                  <Text className="text-white text-sm font-semibold">{bookingPatientId ? 'Book' : 'Fill'}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
