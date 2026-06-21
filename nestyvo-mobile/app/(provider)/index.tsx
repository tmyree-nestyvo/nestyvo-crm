import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuthStore } from '../../lib/store';
import { api } from '../../lib/api';
import { AppointmentCard } from '../../components/dashboard/AppointmentCard';
import { StatCard } from '../../components/dashboard/StatCard';
import { signOut } from '../../lib/auth';

function useProviderDashboard() {
  return useQuery({
    queryKey: ['provider-dashboard'],
    queryFn: () => api.get('/dashboard/provider').then((r) => r.data),
  });
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function buildWeek() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

export default function ProviderScheduleScreen() {
  const { name, clearAuth } = useAuthStore();
  const week = buildWeek();
  const [selectedDate, setSelectedDate] = useState(isoDate(week[0]));
  const { data, isLoading, refetch, isRefetching } = useProviderDashboard();

  const handleSignOut = async () => {
    await signOut();
    clearAuth();
    router.replace('/(auth)/login');
  };

  const dayAppts = data?.schedule?.filter(
    (a: any) => a.startAt?.startsWith(selectedDate),
  ) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-gray-500 text-sm">Provider View</Text>
          <Text className="text-xl font-bold text-gray-900">Dr. {name?.split(' ').pop()}</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} className="p-2">
          <Ionicons name="log-out-outline" size={22} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Stats */}
        <View className="flex-row gap-3 px-5 mb-4">
          <StatCard label="Available Slots" value={data?.availableSlots ?? '—'} icon="time-outline" color="#16a34a" />
          <StatCard label="Waitlist" value={data?.waitlistCount ?? '—'} icon="list-outline" color="#d97706" />
        </View>
        <View className="flex-row gap-3 px-5 mb-5">
          <StatCard label="Utilization" value={data?.utilizationRate ? `${data.utilizationRate}%` : '—'} icon="stats-chart-outline" color="#7c3aed" />
          <StatCard label="Cancellations" value={data?.cancellationCount ?? '—'} icon="close-circle-outline" color="#dc2626" />
        </View>

        {/* Week strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 mb-4">
          {week.map((d) => {
            const iso = isoDate(d);
            const active = iso === selectedDate;
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
            dayAppts.map((appt: any) => <AppointmentCard key={appt.id} appt={appt} />)
          ) : (
            <View className="bg-white rounded-xl border border-gray-100 p-6 items-center">
              <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
              <Text className="text-gray-400 text-sm mt-2">No appointments this day</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
