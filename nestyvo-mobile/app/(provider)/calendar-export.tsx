import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

function useCalendarFeed() {
  return useQuery({
    queryKey: ['provider-calendar-feed'],
    queryFn: () => api.get('/providers/self/calendar-feed').then((r) => r.data),
    staleTime: Infinity,
  });
}

export default function CalendarExportScreen() {
  const { data, isLoading } = useCalendarFeed();

  const openInAppleCalendar = () => {
    if (data?.webcalUrl) Linking.openURL(data.webcalUrl);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Export to Calendar</Text>
          <Text className="text-xs text-gray-400 mt-0.5">Subscribe your Nestyvo schedule elsewhere</Text>
        </View>
        <HomeButton href="/(provider)" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
        {isLoading ? (
          <Text className="text-gray-400 mt-4">Loading…</Text>
        ) : (
          <>
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
              <Text className="text-gray-900 font-semibold text-sm mb-1">Your subscription link</Text>
              <Text className="text-gray-400 text-xs mb-3 leading-5">
                Add this as a URL-based calendar in iPhone Calendar, Google Calendar, or Outlook. It stays in sync —
                your calendar app checks for updates roughly once an hour. Event details are kept generic (no client
                names) since this feed leaves Nestyvo's systems.
              </Text>
              <View className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                <Text selectable className="text-gray-700 text-xs font-mono">{data?.url}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={openInAppleCalendar}
              className="bg-primary-600 rounded-2xl py-4 items-center mb-3 flex-row justify-center gap-2"
            >
              <Ionicons name="calendar-outline" size={18} color="#fff" />
              <Text className="text-white font-semibold text-sm">Add to iPhone Calendar</Text>
            </TouchableOpacity>

            <View className="bg-white rounded-2xl border border-gray-100 p-4">
              <Text className="text-gray-900 font-semibold text-sm mb-2">Google Calendar</Text>
              <Text className="text-gray-500 text-xs leading-5 mb-1">
                Settings → Add calendar → From URL → paste the link above.
              </Text>
              <Text className="text-gray-900 font-semibold text-sm mb-2 mt-3">Outlook</Text>
              <Text className="text-gray-500 text-xs leading-5">
                Add calendar → Subscribe from web → paste the link above.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
