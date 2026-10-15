import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppointmentCard } from '../../components/dashboard/AppointmentCard';
import { HomeButton } from '../../components/HomeButton';
import { MonthCalendarGrid } from '../../components/MonthCalendarGrid';
import { NoticeBanner } from '../../components/NoticeBanner';

// Customizable month/week/day/journal calendar views (Sep 5 2026 ask —
// "the same views you see in an iPhone calendar"). Data source is the
// provider dashboard's schedule, a year forward (was 30 days until Oct 11
// 2026), so this view is forward-looking only, no history.

const TZ = 'America/Los_Angeles';
const SCHEDULE_DAYS = 365;

function useProviderDashboard() {
  return useQuery({
    // A year ahead, so the calendar isn't blank past 30 days (Charlene,
    // Oct 10 recording 40:52 — scheduling into December). Same key prefix,
    // so every existing invalidateQueries(['provider-dashboard']) still hits it.
    queryKey: ['provider-dashboard', SCHEDULE_DAYS],
    queryFn: () => api.get('/dashboard/provider', { params: { scheduleDays: SCHEDULE_DAYS } }).then((r) => r.data),
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
function startOfWeek(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VIEW_MODES = ['month', 'week', 'day', 'journal'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

export default function ProviderCalendarScreen() {
  const today = todayPT();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  // ?date=YYYY-MM-DD&notice=… — after a reschedule, open that day with a
  // confirmation (see appointments/[id].tsx).
  const { date: dateParam, notice } = useLocalSearchParams<{ date?: string; notice?: string }>();
  useEffect(() => {
    if (!dateParam) return;
    setSelectedDate(dateParam);
    setYear(Number(dateParam.slice(0, 4)));
    setMonth(Number(dateParam.slice(5, 7)) - 1);
    setViewMode('day');
  }, [dateParam]);

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
  // Dots on the month grid mean real bookings only — a recurring block used
  // to put a "Booked" dot on every weekday (Full Pass recording, Oct 11 2026).
  const bookedByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const [iso, appts] of Object.entries(apptsByDate)) {
      const real = appts.filter((a) => a.source !== 'block');
      if (real.length) map[iso] = real;
    }
    return map;
  }, [apptsByDate]);

  const goToDay = (iso: string) => {
    setSelectedDate(iso);
    setViewMode('day');
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        {/* Oct 11 2026 — this screen only ever has one caller (My Schedule's
            "Calendar" button), so an explicit destination is both safe and
            more reliable than router.back() — see appointments/[id].tsx's
            matching fix for the full reasoning. */}
        <TouchableOpacity onPress={() => router.replace('/(provider)')} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Calendar</Text>
          <Text className="text-xs text-gray-400 mt-0.5">Your schedule, the next 12 months</Text>
        </View>
        <HomeButton href="/(provider)" />
      </View>

      <NoticeBanner message={notice} />

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
        <MonthCalendarGrid
          year={year} month={month} today={today} selectedDate={selectedDate}
          apptsByDate={bookedByDate}
          onPrevMonth={() => setMonth((m) => { if (m === 0) { setYear((y) => y - 1); return 11; } return m - 1; })}
          onNextMonth={() => setMonth((m) => { if (m === 11) { setYear((y) => y + 1); return 0; } return m + 1; })}
          onSelectDay={goToDay}
        />
      ) : viewMode === 'week' ? (
        <WeekView selectedDate={selectedDate} today={today} apptsByDate={apptsByDate} onSelectDay={setSelectedDate} providerId={data?.providerId} />
      ) : viewMode === 'day' ? (
        <DayView selectedDate={selectedDate} today={today} appts={apptsByDate[selectedDate] ?? []} onChangeDate={setSelectedDate} providerId={data?.providerId} />
      ) : (
        <JournalView apptsByDate={apptsByDate} isRefetching={isRefetching} onRefresh={refetch} providerId={data?.providerId} />
      )}
    </SafeAreaView>
  );
}

function DayDot({ count }: { count: number }) {
  if (!count) return null;
  return <View className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-0.5" />;
}


function WeekView({
  selectedDate, today, apptsByDate, onSelectDay, providerId,
}: { selectedDate: string; today: string; apptsByDate: Record<string, any[]>; onSelectDay: (iso: string) => void; providerId?: string }) {
  const weekStart = startOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return isoDate(d);
  });

  // Charlene, Oct 14 "Last Review" (7:04): the week view was stuck on the
  // current week — other weeks were only reachable through Month view.
  const shiftWeek = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    onSelectDay(isoDate(d));
  };
  const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
      <View className="flex-row items-center justify-between mb-3">
        <TouchableOpacity onPress={() => shiftWeek(-1)} className="p-2" accessibilityLabel="Previous week">
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text className="text-sm font-semibold text-gray-900">
          {fmt(days[0])} – {fmt(days[6])}, {days[6].slice(0, 4)}
        </Text>
        <TouchableOpacity onPress={() => shiftWeek(1)} className="p-2" accessibilityLabel="Next week">
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </TouchableOpacity>
      </View>
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

      {days.every((iso) => !(apptsByDate[iso]?.length)) && (
        <Text className="text-gray-400 text-sm text-center py-8">Nothing on the calendar this week.</Text>
      )}
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
              <AppointmentCard key={a.id} appt={a} onPress={() => a.patientId && router.push({ pathname: '/(provider)/appointments/[id]', params: { id: a.id, providerId, returnTo: '/(provider)/calendar' } })} />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function DayView({
  selectedDate, today, appts, onChangeDate, providerId,
}: { selectedDate: string; today: string; appts: any[]; onChangeDate: (iso: string) => void; providerId?: string }) {
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

      {/* Oct 10 2026 — Charlene's click-through: "there's no way for her to
          just add an appointment anywhere from these screens... on any
          date." Available Slots only ever offered pre-computed open
          slots; this is the direct "I know the day, let me just book it"
          path — the date here carries straight through, only the time
          needs picking on the next screen. */}
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/(provider)/book-appointment', params: { date: selectedDate } })}
        className="flex-row items-center justify-center gap-2 bg-primary-600 rounded-xl py-3 mb-4"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text className="text-white font-semibold text-sm">Add Appointment</Text>
      </TouchableOpacity>

      {appts.length === 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
          <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
          <Text className="text-gray-500 font-semibold mt-3">No appointments</Text>
        </View>
      ) : (
        appts.map((a) => (
          <AppointmentCard key={a.id} appt={a} onPress={() => a.patientId && router.push({ pathname: '/(provider)/appointments/[id]', params: { id: a.id, providerId, returnTo: '/(provider)/calendar' } })} />
        ))
      )}
    </ScrollView>
  );
}

function JournalView({
  apptsByDate, isRefetching, onRefresh, providerId,
}: { apptsByDate: Record<string, any[]>; isRefetching: boolean; onRefresh: () => void; providerId?: string }) {
  // Blocked time is left out of the running list — a daily recurring block
  // over a year would bury every real appointment. Day/Week still show it.
  const listed = Object.fromEntries(
    Object.entries(apptsByDate)
      .map(([iso, appts]) => [iso, appts.filter((a) => a.source !== 'block')] as const)
      .filter(([, appts]) => appts.length > 0),
  );
  const dates = Object.keys(listed).sort();
  const thisYear = new Date().getFullYear();

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
          <Text className="text-gray-400 text-sm mt-1">Nothing booked in the next 12 months.</Text>
        </View>
      ) : (
        dates.map((iso) => {
          const d = new Date(iso + 'T00:00:00');
          return (
            <View key={iso} className="mb-4">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {d.toLocaleDateString('en-US', {
                  weekday: 'long', month: 'short', day: 'numeric',
                  ...(d.getFullYear() !== thisYear ? { year: 'numeric' } : {}),
                })}
              </Text>
              {listed[iso].map((a) => (
                <AppointmentCard key={a.id} appt={a} onPress={() => a.patientId && router.push({ pathname: '/(provider)/appointments/[id]', params: { id: a.id, providerId, returnTo: '/(provider)/calendar' } })} />
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
