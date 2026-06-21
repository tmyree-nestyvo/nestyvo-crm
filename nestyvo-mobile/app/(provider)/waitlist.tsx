import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

function useWaitlist() {
  return useQuery({
    queryKey: ['provider-waitlist'],
    queryFn: () => api.get('/waitlist/mine').then((r) => r.data),
  });
}

const TYPE_CONFIG: Record<string, { color: string; icon: any }> = {
  urgent: { color: '#dc2626', icon: 'alert-circle' },
  new_patient: { color: '#2563eb', icon: 'person-add' },
  followup: { color: '#7c3aed', icon: 'refresh' },
};

export default function ProviderWaitlistScreen() {
  const { data, isLoading } = useWaitlist();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <Text className="text-xl font-bold text-gray-900">My Waitlist</Text>
        <Text className="text-gray-500 text-sm mt-0.5">
          {data?.length ?? 0} patients waiting
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-10"
          ListEmptyComponent={
            <View className="items-center pt-16">
              <Ionicons name="list-outline" size={48} color="#e5e7eb" />
              <Text className="text-gray-400 text-sm mt-3">No patients on waitlist</Text>
            </View>
          }
          renderItem={({ item }) => {
            const cfg = TYPE_CONFIG[item.type] ?? { color: '#6b7280', icon: 'person' };
            return (
              <View className="bg-white rounded-xl border border-gray-100 px-4 py-4 mb-2">
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${cfg.color}18` }}
                  >
                    <Ionicons name={cfg.icon} size={15} color={cfg.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-900 font-semibold text-sm">{item.patient}</Text>
                    <Text className="text-gray-500 text-xs mt-0.5">
                      {item.appointmentType} · {item.daysWaiting}d waiting
                    </Text>
                  </View>
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: `${cfg.color}18` }}>
                    <Text className="text-xs font-medium capitalize" style={{ color: cfg.color }}>
                      {item.type?.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                {(item.preferredDays?.length > 0 || item.preferredTimes) && (
                  <View className="flex-row gap-2 mt-3 flex-wrap">
                    {item.preferredDays?.map((d: number) => (
                      <View key={d} className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                        <Text className="text-gray-600 text-xs">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
                        </Text>
                      </View>
                    ))}
                    {Object.entries(item.preferredTimes ?? {}).filter(([, v]) => v).map(([t]) => (
                      <View key={t} className="bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                        <Text className="text-gray-600 text-xs capitalize">{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
