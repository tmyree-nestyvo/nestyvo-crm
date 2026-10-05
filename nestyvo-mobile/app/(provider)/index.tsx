import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuthStore } from '../../lib/store';
import { hasRole, ADMIN_ONLY } from '../../lib/role-groups';
import { api } from '../../lib/api';
import { AppointmentCard } from '../../components/dashboard/AppointmentCard';
import { StatCard } from '../../components/dashboard/StatCard';
import { signOut } from '../../lib/auth';

const TZ = 'America/Los_Angeles';

function useProviderDashboard() {
  return useQuery({
    queryKey: ['provider-dashboard'],
    queryFn: () => api.get('/dashboard/provider').then((r) => r.data),
    // A 403 here means this login has no Provider row of its own (e.g. an
    // admin using "switch to Provider view" with no linked provider
    // account) — that's not transient, retrying it can't ever succeed and
    // just delays showing the real state. Only retry on everything else.
    retry: (failureCount, error: any) => error?.response?.status !== 403 && failureCount < 1,
  });
}

function isoDate(d: Date) {
  // toISOString() converts to UTC first, which can roll the date to the
  // next/previous day depending on local offset — use the Pacific-time
  // calendar date instead, matching the rest of the app's TZ convention.
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

function buildDays() {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

export default function ProviderScheduleScreen() {
  const { name, role, clearAuth } = useAuthStore();
  const days = buildDays();
  const [selectedDate, setSelectedDate] = useState(isoDate(days[0]));
  const { data, isLoading, isError, error, refetch, isRefetching } = useProviderDashboard();
  const noProviderAccount = isError && (error as any)?.response?.status === 403;

  const datesWithAppts = new Set((data?.schedule ?? []).map((a: any) => isoDate(new Date(a.startAt))));

  const handleSignOut = async () => {
    await signOut();
    clearAuth();
    router.replace('/(auth)/login');
  };

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
            <Text className="text-gray-500 text-sm">Provider View</Text>
            <Text className="text-xl font-bold text-gray-900">
              {noProviderAccount
                ? 'No provider linked'
                // Charlene, Phase 7 item 21 — no inferred "Dr." Show the
                // configured name + credentials (e.g. "Gencia Williams,
                // LMFT"); an honorific only ever appears if someone actually
                // configures one, which doesn't exist as a field today, so
                // none is shown. Falls back to the login's own name only
                // while /dashboard/provider is still loading.
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
            {/* Stats */}
            <View className="flex-row gap-3 px-5 mb-4">
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
            <View className="flex-row gap-3 px-5 mb-5">
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

            {/* Day strip — next 30 days */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 mb-4">
              {days.map((d) => {
                const iso = isoDate(d);
                const active = iso === selectedDate;
                const hasAppts = datesWithAppts.has(iso);
                return (
                  <TouchableOpacity
                    key={iso}
                    onPress={() => setSelectedDate(iso)}
                    className={`mx-1 w-14 h-16 rounded-xl items-center justify-center ${
                      active ? 'bg-primary-600' : 'bg-white border border-gray-100'
                    }`}
                  >
                    <Text className={`text-xs font-medium ${active ? 'text-white/70' : 'text-gray-400'}`}>
                      {d.toLocaleDateString('en-US', { weekday: 'short' })}
                    </Text>
                    <Text className={`text-lg font-bold mt-0.5 ${active ? 'text-white' : 'text-gray-900'}`}>
                      {d.getDate()}
                    </Text>
                    {hasAppts && !active ? (
                      <View className="w-1 h-1 rounded-full bg-primary-500 mt-0.5" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Schedule for day */}
            <View className="px-5">
              <Text className="text-base font-semibold text-gray-900 mb-3">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </Text>
              {isLoading ? (
                <View className="bg-white rounded-xl p-6 items-center">
                  <Text className="text-gray-400 text-sm">Loading…</Text>
                </View>
              ) : dayAppts.length ? (
                dayAppts.map((appt: any) => (
                  <AppointmentCard
                    key={appt.id}
                    appt={appt}
                    onPress={() =>
                      router.push({
                        pathname: '/(provider)/clients/[id]',
                        params: { id: appt.patientId, name: appt.patient },
                      })
                    }
                  />
                ))
              ) : (
                <View className="bg-white rounded-xl border border-gray-100 p-6 items-center">
                  <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
                  <Text className="text-gray-400 text-sm mt-2">No appointments this day</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
