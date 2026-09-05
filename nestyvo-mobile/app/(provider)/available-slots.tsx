import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

const TZ = 'America/Los_Angeles';
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

const DAY_OPTIONS = [7, 14, 30] as const;

function useAvailableSlots(days: number) {
  return useQuery({
    queryKey: ['provider-available-slots', days],
    queryFn: () => api.get('/dashboard/provider/available-slots', { params: { days } }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export default function ProviderAvailableSlotsScreen() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, refetch, isRefetching } = useAvailableSlots(days);
  const slotsByDate: any[] = data?.slotsByDate ?? [];
  const totalSlots: number = data?.totalSlots ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Available Slots</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {totalSlots} open · next {days} days
          </Text>
        </View>
        <HomeButton href="/(provider)" />
      </View>

      {/* Time-frame toggle */}
      <View className="px-5 pb-3 flex-row gap-2">
        {DAY_OPTIONS.map((d) => (
          <TouchableOpacity
            key={d}
            onPress={() => setDays(d)}
            className={`px-3 py-1 rounded-full border ${days === d ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
          >
            <Text className={`text-xs font-medium ${days === d ? 'text-white' : 'text-gray-600'}`}>
              Next {d} days
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <View className="items-center py-12">
            <Text className="text-gray-400">Loading…</Text>
          </View>
        ) : slotsByDate.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
            <Text className="text-gray-500 font-semibold mt-3">No open slots</Text>
            <Text className="text-gray-400 text-sm mt-1">Fully booked for the next {days} days.</Text>
          </View>
        ) : (
          slotsByDate.map((day: any) => (
            <View key={day.date} className="mb-4">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {day.dateLabel}
              </Text>
              <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {day.slots.map((slot: any, i: number) => (
                  <View
                    key={slot.startAt}
                    className={`flex-row items-center px-4 py-3 gap-3 ${
                      i < day.slots.length - 1 ? 'border-b border-gray-50' : ''
                    }`}
                  >
                    <View className="w-2 h-2 rounded-full bg-green-400" />
                    <View className="flex-1">
                      <Text className="text-gray-900 font-semibold text-sm">
                        {fmt(slot.startAt)} – {fmt(slot.endAt)}
                      </Text>
                      <Text className="text-gray-400 text-xs mt-0.5">{slot.durationMin} min</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
