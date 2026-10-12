import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../lib/store';
import { hasRole, ADMIN_ONLY } from '../../lib/role-groups';
import { api } from '../../lib/api';
import { AppointmentCard } from '../../components/dashboard/AppointmentCard';
import { StatCard } from '../../components/dashboard/StatCard';
import { MonthCalendarGrid } from '../../components/MonthCalendarGrid';
import { NoticeBanner } from '../../components/NoticeBanner';
import { signOut } from '../../lib/auth';

const TZ = 'America/Los_Angeles';
const SCHEDULE_DAYS = 365;

function useProviderDashboard() {
  return useQuery({
    // A year ahead, so the calendar isn't blank past 30 days (Charlene,
    // Oct 10 recording 40:52 — scheduling into December). Same key prefix,
    // so every existing invalidateQueries(['provider-dashboard']) still hits it.
    queryKey: ['provider-dashboard', SCHEDULE_DAYS],
    queryFn: () => api.get('/dashboard/provider', { params: { scheduleDays: SCHEDULE_DAYS } }).then((r) => r.data),
    // A 403 here means this login has no Provider row of its own (e.g. an
    // admin using "switch to Provider view" with no linked provider
    // account) — that's not transient, retrying it can't ever succeed and
    // just delays showing the real state. Only retry on everything else.
    retry: (failureCount, error: any) => error?.response?.status !== 403 && failureCount < 1,
  });
}

// Charlene, same recording — "this view here, right at the bottom, when
// you click on the date, you can see your appointments here, right? But
// we should also see it just like the admin sees it where it has all the
// open times, so the provider can just select the time they want to add."
// The day panel below the calendar only ever showed booked appointments —
// getting to an actual open time meant Add Appointment → a date/time
// picker on a second screen. Same data source as that picker
// (GET /dashboard/provider/available-slots), fetched here so the open
// times for the selected date render directly inline, same as the
// admin's Available Slots screen.
function useProviderAvailableSlots() {
  return useQuery({
    queryKey: ['provider-available-slots', 90],
    queryFn: () => api.get('/dashboard/provider/available-slots', { params: { days: 90 } }).then((r) => r.data),
    staleTime: 60_000,
  });
}
function fmtSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

function isoDate(d: Date) {
  // toISOString() converts to UTC first, which can roll the date to the
  // next/previous day depending on local offset — use the Pacific-time
  // calendar date instead, matching the rest of the app's TZ convention.
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

export default function ProviderScheduleScreen() {
  const { name, role, clearAuth } = useAuthStore();
  const today = isoDate(new Date());
  // Charlene, across multiple rounds of testing — "this big string of
  // numbers... what if I want to go beyond this string of numbers?
  // Imagine a maybe an iPhone calendar here, where you can just see a
  // block of the month and select what date you want." The old day-strip
  // was a fixed 30-day horizontal scroll with no way to navigate past it.
  // Swapped for the exact same real month-grid Calendar's own Month view
  // already uses (components/MonthCalendarGrid.tsx) — true prev/next month
  // navigation, not a bounded window.
  // ?date=YYYY-MM-DD opens on that day — "Back to Calendar" after a booking
  // or reschedule lands on the day it happened, not today.
  const { date: dateParam, notice } = useLocalSearchParams<{ date?: string; notice?: string }>();
  const startDate = dateParam || today;
  const [year, setYear] = useState(() => Number(startDate.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(startDate.slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState(startDate);
  useEffect(() => {
    if (!dateParam) return;
    setSelectedDate(dateParam);
    setYear(Number(dateParam.slice(0, 4)));
    setMonth(Number(dateParam.slice(5, 7)) - 1);
  }, [dateParam]);
  const { data, isLoading, isError, error, refetch, isRefetching } = useProviderDashboard();
  const { data: slotsData, isLoading: slotsLoading } = useProviderAvailableSlots();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const openDates = useMemo(
    () => new Set<string>((slotsData?.slotsByDate ?? []).filter((d: any) => d.slots?.length).map((d: any) => d.date)),
    [slotsData],
  );
  const windowEnd = isoDate(new Date(Date.now() + 90 * 86400000));
  const noProviderAccount = isError && (error as any)?.response?.status === 403;

  const daySlots: { startAt: string; endAt: string }[] =
    slotsData?.slotsByDate?.find((d: any) => d.date === selectedDate)?.slots ?? [];

  const apptsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const a of data?.schedule ?? []) {
      if (!a.startAt) continue;
      const key = isoDate(new Date(a.startAt));
      (map[key] ??= []).push(a);
    }
    return map;
  }, [data?.schedule]);
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

  const handleSignOut = async () => {
    await signOut();
    clearAuth();
    router.replace('/(auth)/login');
  };

  const beyondWindow = selectedDate > windowEnd;

  const dayAppts = data?.schedule?.filter(
    (a: any) => a.startAt && isoDate(new Date(a.startAt)) === selectedDate,
  ) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {hasRole(role, ADMIN_ONLY) && (
            <TouchableOpacity onPress={() => router.replace('/(agent)')} className="p-1 -ml-1">
              <Ionicons name="arrow-back" size={22} color="#374151" />
            </TouchableOpacity>
          )}
          <View>
            {/* Charlene, Oct 6 2026 (Tax Refund 1040 pilot, item 13) —
                "the business identity should consistently be Tax Refund
                1040; Gloria is the provider/user." This header used to
                lead with the provider's own name and nothing else — no
                business name appeared here at all. Business now leads,
                provider is the secondary line, matching every other
                screen's convention (see partners.tsx, appointment
                detail, etc.). */}
            <Text className="text-gray-500 text-sm">
              {data?.practiceName ?? 'Provider View'}
            </Text>
            <Text className="text-xl font-bold text-gray-900">
              {noProviderAccount
                ? 'No provider linked'
                // Phase 7 item 21 — no inferred "Dr." Show the configured
                // name + credentials (e.g. "Gencia Williams, LMFT"); an
                // honorific only ever appears if someone actually
                // configures one, which doesn't exist as a field today,
                // so none is shown. Falls back to the login's own name
                // only while /dashboard/provider is still loading.
                : data?.firstName
                ? `${data.firstName} ${data.lastName}${data.credentials ? `, ${data.credentials}` : ''}`
                : name}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          {!noProviderAccount && (
            <>
              <TouchableOpacity
                onPress={() => router.push('/(provider)/calendar')}
                className="p-2 bg-gray-100 rounded-xl"
              >
                <Ionicons name="calendar-outline" size={18} color="#374151" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(provider)/calendar-export')}
                className="p-2 bg-gray-100 rounded-xl"
              >
                <Ionicons name="download-outline" size={18} color="#374151" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(provider)/block-time')}
                className="flex-row items-center gap-1.5 bg-gray-100 px-3 py-2 rounded-xl"
              >
                <Ionicons name="remove-circle-outline" size={16} color="#374151" />
                <Text className="text-gray-700 text-sm font-medium">Block time</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            testID="nav-change-password"
            onPress={() => router.push('/(auth)/change-password')}
            className="p-2"
          >
            <Ionicons name="key-outline" size={22} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignOut} className="p-2">
            <Ionicons name="log-out-outline" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {noProviderAccount ? (
          // Admin using "switch to Provider view" with no Provider record of
          // their own — the previous behavior here was a fake-looking empty
          // dashboard (every stat card stuck on "—", "No appointments this
          // day") that looked like a real provider with zero data, not what
          // was actually true: this login has no provider account at all.
          <View className="px-5 pt-4">
            <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center">
              <Ionicons name="person-circle-outline" size={40} color="#d1d5db" />
              <Text className="text-gray-900 font-semibold text-base mt-3 text-center">
                No provider account linked
              </Text>
              <Text className="text-gray-400 text-sm mt-1.5 text-center leading-relaxed">
                This is an admin login with no Provider record of its own, so there's no real schedule to show here.
                Provider view works for logins that are directly tied to a provider.
              </Text>
              <TouchableOpacity
                onPress={() => router.replace('/(agent)')}
                className="bg-primary-600 rounded-xl px-5 py-3 mt-5"
              >
                <Text className="text-white font-semibold text-sm">Back to Admin Dashboard</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <NoticeBanner message={notice} />
            {/* Stats — one row of four on a wide screen, two rows on a phone */}
            <View className={`px-5 mb-4 gap-3 ${wide ? 'flex-row' : ''}`}>
              <View className={`flex-row gap-3 ${wide ? 'flex-1' : ''}`}>
                <StatCard
                  label="Available Slots"
                  value={data?.availableSlots ?? '—'}
                  icon="time-outline"
                  color="#16a34a"
                  onPress={() => router.push('/(provider)/available-slots')}
                />
                <StatCard
                  label="Waitlist"
                  value={data?.waitlistCount ?? '—'}
                  icon="list-outline"
                  color="#d97706"
                  onPress={() => router.push('/(provider)/waitlist')}
                />
              </View>
              <View className={`flex-row gap-3 ${wide ? 'flex-1' : ''}`}>
                <StatCard
                  label="Requests"
                  value={data?.openRequestCount ?? '—'}
                  icon="chatbubble-ellipses-outline"
                  color="#7c3aed"
                  badge={data?.openRequestCount}
                  onPress={() => router.push('/(provider)/tickets')}
                />
                <StatCard
                  label="Cancellations"
                  value={data?.cancellationCount ?? '—'}
                  icon="close-circle-outline"
                  color="#dc2626"
                  onPress={() => router.push('/(provider)/cancellations')}
                />
              </View>
            </View>

            {/* Charlene, Oct 10 recording (11:04, 40:10) — "let me look at my
                schedule, let me select a date and then let me see what's open
                that date, not having to go through multiple screens." Compact
                calendar beside the selected day's open times + appointments on
                a wide screen (stacked on a phone), so picking a date shows
                what's open right away with no scrolling. */}
            <View className={`px-5 gap-4 ${wide ? 'flex-row items-start' : ''}`}>
              <View
                className="bg-white rounded-2xl border border-gray-100 px-3 py-1"
                style={wide ? { width: 400 } : undefined}
              >
                <MonthCalendarGrid
                  year={year} month={month} today={today} selectedDate={selectedDate}
                  apptsByDate={bookedByDate}
                  openDates={openDates}
                  compact
                  onPrevMonth={() => setMonth((m) => { if (m === 0) { setYear((y) => y - 1); return 11; } return m - 1; })}
                  onNextMonth={() => setMonth((m) => { if (m === 11) { setYear((y) => y + 1); return 0; } return m + 1; })}
                  onSelectDay={setSelectedDate}
                  scroll={false}
                />
                <View className="flex-row items-center justify-center gap-4 pb-2">
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <Text className="text-[11px] text-gray-500">Open times</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                    <Text className="text-[11px] text-gray-500">Booked</Text>
                  </View>
                </View>
              </View>

              {/* Selected day */}
              <View className={wide ? 'flex-1' : ''}>
                <Text className="text-base font-semibold text-gray-900 mb-3">
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </Text>

                {/* Open times first — tap one to book straight into it, same
                    as the admin's Available Slots. */}
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Open Times</Text>
                {daySlots.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2 mb-2">
                    {daySlots.map((slot) => (
                      <TouchableOpacity
                        key={slot.startAt}
                        onPress={() =>
                          router.push({
                            pathname: '/(provider)/book-appointment',
                            params: { slotStartAt: slot.startAt, slotEndAt: slot.endAt },
                          })
                        }
                        className="px-3.5 py-2.5 rounded-xl border border-primary-100 bg-primary-50"
                      >
                        <Text className="text-primary-700 text-sm font-medium">{fmtSlotTime(slot.startAt)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text className="text-gray-400 text-sm mb-2">
                    {selectedDate < today
                      ? 'This day has passed.'
                      : slotsLoading
                        ? 'Loading open times…'
                        : beyondWindow
                          ? 'Open times are shown up to 90 days out.'
                          : 'No open times this day.'}
                  </Text>
                )}
                {/* Charlene (40:28) — "instead of add appointment, we click on
                    this date… then we have the list of available appointments."
                    The open times above are the main path now; this stays as
                    a small link for booking outside the regular open slots. */}
                {selectedDate >= today && (
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(provider)/book-appointment', params: { date: selectedDate } })}
                    className="self-start py-1.5 mb-4"
                  >
                    <Text className="text-primary-600 text-sm font-medium">+ Book a different time</Text>
                  </TouchableOpacity>
                )}

                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Appointments</Text>
                {isLoading ? (
                  <View className="bg-white rounded-xl p-6 items-center">
                    <Text className="text-gray-400 text-sm">Loading…</Text>
                  </View>
                ) : dayAppts.length ? (
                  dayAppts.map((appt: any) => (
                    <AppointmentCard
                      key={appt.id}
                      appt={appt}
                      // Oct 9 2026 — this is "My Schedule," the first screen a
                      // provider lands on, and had its own separate tap
                      // handler that never got the appointments/[id] fix
                      // applied to calendar.tsx the same day — Charlene's
                      // click-through found reschedule/cancel still
                      // unreachable from here specifically.
                      onPress={() =>
                        appt.patientId &&
                        router.push({
                          pathname: '/(provider)/appointments/[id]',
                          params: { id: appt.id, providerId: data?.providerId, returnTo: '/(provider)' },
                        })
                      }
                    />
                  ))
                ) : (
                  <View className="bg-white rounded-xl border border-gray-100 p-5 items-center">
                    <Text className="text-gray-400 text-sm">No appointments this day</Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
