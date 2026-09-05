import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppointmentCard } from '../../components/dashboard/AppointmentCard';
import { HomeButton } from '../../components/HomeButton';

// Customizable month/week/day/journal calendar views (Sep 5 2026 ask —
// "the same views you see in an iPhone calendar"). Data source is the same
// 30-day-forward schedule the dashboard/day-strip already fetch, so this
// view is forward-looking only, no history.

const TZ = 'America/Los_Angeles';

function useProviderDashboard() {
  return useQuery({
    queryKey: ['provider-dashboard'],
    queryFn: () => api.get('/dashboard/provider').then((r) => r.data),
  });
}

function isoDate(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}
function todayPT() {
  return isoDate(new Date());
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDOW(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function isoOf(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function startOfWeek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VIEW_MODES = ['month', 'week', 'day', 'journal'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

export default function ProviderCalendarScreen() {
  const today = todayPT();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today);

  const { data, isLoading, refetch, isRefetching } = useProviderDashboard();
  const schedule: any[] = data?.schedule ?? [];

  const apptsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const a of schedule) {
      const key = isoDate(new Date(a.startAt));
      (map[key] ??= []).push(a);
    }
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
  }, [schedule]);

  const goToDay = (iso: string) => {
    setSelectedDate(iso);
    setViewMode('day');
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Calendar</Text>
          <Text className="text-xs text-gray-400 mt-0.5">Your schedule, next 30 days</Text>
        </View>
        <HomeButton href="/(provider)" />
      </View>

      {/* View toggle */}
      <View className="px-5 pb-3 flex-row bg-gray-100 mx-5 rounded-xl p-1">
        {VIEW_MODES.map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => setViewMode(v)}
            className={`flex-1 py-1.5 rounded-lg items-center ${viewMode === v ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`text-xs font-semibold capitalize ${viewMode === v ? 'text-gray-900' : 'text-gray-500'}`}>
              {v}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View className="items-center py-12">
          <Text className="text-gray-400">Loading…</Text>
        </View>
      ) : viewMode === 'month' ? (
        <MonthView
          year={year} month={month} today={today} selectedDate={selectedDate}
          apptsByDate={apptsByDate}
          onPrevMonth={() => setMonth((m) => { if (m === 0) { setYear((y) => y - 1); return 11; } return m - 1; })}
          onNextMonth={() => setMonth((m) => { if (m === 11) { setYear((y) => y + 1); return 0; } return m + 1; })}
          onSelectDay={goToDay}
        />
      ) : viewMode === 'week' ? (
        <WeekView selectedDate={selectedDate} today={today} apptsByDate={apptsByDate} onSelectDay={setSelectedDate} />
      ) : viewMode === 'day' ? (
        <DayView selectedDate={selectedDate} today={today} appts={apptsByDate[selectedDate] ?? []} onChangeDate={setSelectedDate} />
      ) : (
        <JournalView apptsByDate={apptsByDate} isRefetching={isRefetching} onRefresh={refetch} />
      )}
    </SafeAreaView>
  );
}

function DayDot({ count }: { count: number }) {
  if (!count) return null;
  return <View className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-0.5" />;
}

function MonthView({
  year, month, today, selectedDate, apptsByDate, onPrevMonth, onNextMonth, onSelectDay,
}: {
  year: number; month: number; today: string; selectedDate: string;
  apptsByDate: Record<string, any[]>;
  onPrevMonth: () => void; onNextMonth: () => void; onSelectDay: (iso: string) => void;
}) {
  const numDays = daysInMonth(year, month);
  const leadingBlanks = firstDOW(year, month);
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: numDays }, (_, i) => i + 1)];

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
      <View className="flex-row items-center justify-between mb-3 mt-1">
        <TouchableOpacity onPress={onPrevMonth} className="p-2"><Ionicons name="chevron-back" size={20} color="#374151" /></TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={onNextMonth} className="p-2"><Ionicons name="chevron-forward" size={20} color="#374151" /></TouchableOpacity>
      </View>

      <View className="flex-row mb-1">
        {DOW.map((d) => (
          <Text key={d} className="flex-1 text-center text-xs font-semibold text-gray-400">{d}</Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className="aspect-square" />;
          const iso = isoOf(year, month, day);
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const count = apptsByDate[iso]?.length ?? 0;
          return (
            <TouchableOpacity
              key={iso}
              onPress={() => onSelectDay(iso)}
              style={{ width: `${100 / 7}%` }}
              className="aspect-square items-center justify-center"
            >
              <View className={`w-8 h-8 rounded-full items-center justify-center ${isSelected ? 'bg-primary-600' : isToday ? 'bg-primary-50' : ''}`}>
                <Text className={`text-sm ${isSelected ? 'text-white font-bold' : isToday ? 'text-primary-700 font-bold' : 'text-gray-700'}`}>
                  {day}
                </Text>
              </View>
              <DayDot count={count} />
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function WeekView({
  selectedDate, today, apptsByDate, onSelectDay,
}: { selectedDate: string; today: string; apptsByDate: Record<string, any[]>; onSelectDay: (iso: string) => void }) {
  const weekStart = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return isoDate(d);
  });

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
      <View className="flex-row mb-4">
        {days.map((iso) => {
          const d = new Date(iso + 'T00:00:00');
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const count = apptsByDate[iso]?.length ?? 0;
          return (
            <TouchableOpacity key={iso} onPress={() => onSelectDay(iso)} className="flex-1 items-center">
              <Text className="text-xs text-gray-400 mb-1">{DOW[d.getDay()]}</Text>
              <View className={`w-8 h-8 rounded-full items-center justify-center ${isSelected ? 'bg-primary-600' : isToday ? 'bg-primary-50' : ''}`}>
                <Text className={`text-sm ${isSelected ? 'text-white font-bold' : isToday ? 'text-primary-700 font-bold' : 'text-gray-700'}`}>
                  {d.getDate()}
                </Text>
              </View>
              <DayDot count={count} />
            </TouchableOpacity>
          );
        })}
      </View>

      {days.map((iso) => {
        const appts = apptsByDate[iso] ?? [];
        if (appts.length === 0) return null;
        const d = new Date(iso + 'T00:00:00');
        return (
          <View key={iso} className="mb-4">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            {appts.map((a) => (
              <AppointmentCard key={a.id} appt={a} onPress={() => a.patientId && router.push(`/(provider)/clients/${a.patientId}`)} />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function DayView({
  selectedDate, today, appts, onChangeDate,
}: { selectedDate: string; today: string; appts: any[]; onChangeDate: (iso: string) => void }) {
  const shift = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    onChangeDate(isoDate(d));
  };
  const label = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity onPress={() => shift(-1)} className="p-2"><Ionicons name="chevron-back" size={20} color="#374151" /></TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">{selectedDate === today ? `Today · ${label}` : label}</Text>
        <TouchableOpacity onPress={() => shift(1)} className="p-2"><Ionicons name="chevron-forward" size={20} color="#374151" /></TouchableOpacity>
      </View>

      {appts.length === 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
          <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
          <Text className="text-gray-500 font-semibold mt-3">No appointments</Text>
        </View>
      ) : (
        appts.map((a) => (
          <AppointmentCard key={a.id} appt={a} onPress={() => a.patientId && router.push(`/(provider)/clients/${a.patientId}`)} />
        ))
      )}
    </ScrollView>
  );
}

function JournalView({
  apptsByDate, isRefetching, onRefresh,
}: { apptsByDate: Record<string, any[]>; isRefetching: boolean; onRefresh: () => void }) {
  const dates = Object.keys(apptsByDate).sort();

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-5 pb-8"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
    >
      {dates.length === 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
          <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
          <Text className="text-gray-500 font-semibold mt-3">Nothing on the books</Text>
          <Text className="text-gray-400 text-sm mt-1">Next 30 days are clear.</Text>
        </View>
      ) : (
        dates.map((iso) => {
          const d = new Date(iso + 'T00:00:00');
          return (
            <View key={iso} className="mb-4">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              {apptsByDate[iso].map((a) => (
                <AppointmentCard key={a.id} appt={a} onPress={() => a.patientId && router.push(`/(provider)/clients/${a.patientId}`)} />
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
