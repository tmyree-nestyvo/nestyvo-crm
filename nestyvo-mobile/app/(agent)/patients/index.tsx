import { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

function usePatientSearch(query: string) {
  return useQuery({
    queryKey: ['patients', query],
    queryFn: () => api.get('/patients', { params: { q: query } }).then((r) => r.data),
    enabled: query.length >= 2,
  });
}

const WAITLIST_BADGE: Record<string, { label: string; color: string }> = {
  active: { label: 'Waitlist', color: '#d97706' },
  scheduled: { label: 'Scheduled', color: '#16a34a' },
  none: { label: '', color: '' },
};

export default function PatientsScreen() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = usePatientSearch(query);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <Text className="text-xl font-bold text-gray-900 mb-3">Patients</Text>
        <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4 gap-3">
          <Ionicons name="search" size={18} color="#9ca3af" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, phone, or email…"
            placeholderTextColor="#9ca3af"
            className="flex-1 py-3.5 text-sm text-gray-800"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {query.length < 2 ? (
        <View className="flex-1 items-center pt-16">
          <Ionicons name="people-outline" size={48} color="#e5e7eb" />
          <Text className="text-gray-400 mt-3 text-sm">Enter at least 2 characters to search</Text>
        </View>
      ) : isLoading ? (
        <View className="flex-1 items-center pt-16">
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-8"
          ListEmptyComponent={
            <View className="items-center pt-12">
              <Text className="text-gray-400 text-sm">No patients found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = WAITLIST_BADGE[item.waitlistStatus ?? 'none'];
            return (
              <TouchableOpacity
                onPress={() => router.push(`/(agent)/patients/${item.id}`)}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3.5 mb-2 flex-row items-center gap-3"
              >
                <View className="w-10 h-10 bg-primary-100 rounded-full items-center justify-center flex-shrink-0">
                  <Text className="text-primary-700 font-bold text-sm">
                    {item.name?.charAt(0)?.toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-gray-900 font-semibold text-sm">{item.name}</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    {item.phone} {item.assignedProvider ? `· ${item.assignedProvider}` : ''}
                  </Text>
                </View>
                {badge.label ? (
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${badge.color}18` }}>
                    <Text className="text-xs font-medium" style={{ color: badge.color }}>
                      {badge.label}
                    </Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
