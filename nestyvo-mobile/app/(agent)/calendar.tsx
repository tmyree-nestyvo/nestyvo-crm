import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AppointmentCard } from '../../components/dashboard/AppointmentCard';

function useProviders() {
  return useQuery({ queryKey: ['providers'], queryFn: () => api.get('/providers').then((r) => r.data) });
}

function useSchedule(providerId: string, date: string) {
  return useQuery({
    queryKey: ['schedule', providerId, date],
    queryFn: () => api.get(`/providers/${providerId}/schedule`, { params: { date } }).then((r) => r.data),
    enabled: !!providerId,
  });
}

function dateLabel(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

export default function CalendarScreen() {
  const week = buildWeek();
  const [selectedDate, setSelectedDate] = useState(isoDate(week[0]));
  const [selectedProvider, setSelectedProvider] = useState('');
  const { data: providers } = useProviders();
  const { data: schedule, isLoading } = useSchedule(selectedProvider, selectedDate);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <Text className="text-xl font-bold text-gray-900 mb-4">Calendar</Text>

        {/* Week strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 -mx-1">
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

        {/* Provider selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
          {providers?.map((p: any) => {
            const active = p.id === selectedProvider;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setSelectedProvider(p.id)}
                className={`mx-1 px-4 py-2 rounded-full border ${
                  active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>
                  {p.firstName} {p.lastName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pt-4 pb-10">
        {!selectedProvider ? (
          <View className="items-center pt-12">
            <Ionicons name="person-outline" size={40} color="#e5e7eb" />
            <Text className="text-gray-400 text-sm mt-3">Select a provider to view their schedule</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator color="#2563eb" className="mt-8" />
        ) : schedule?.length ? (
          schedule.map((appt: any) => <AppointmentCard key={appt.id} appt={appt} />)
        ) : (
          <View className="items-center pt-12">
            <Ionicons name="calendar-outline" size={40} color="#e5e7eb" />
            <Text className="text-gray-400 text-sm mt-3">No appointments on {dateLabel(new Date(selectedDate + 'T12:00:00'))}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
