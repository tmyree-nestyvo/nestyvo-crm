import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../lib/store';
import { api } from '../../lib/api';
import { StatCard } from '../../components/dashboard/StatCard';
import { signOut } from '../../lib/auth';

function useDashboard() {
  return useQuery({
    queryKey: ['agent-dashboard'],
    queryFn: () => api.get('/dashboard/agent').then((r) => r.data),
    staleTime: 60_000,
  });
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function ProviderSlotGroup({ provider }: { provider: any }) {
  const [expanded, setExpanded] = useState(false);
  const slotsByDate: { date: string; dateLabel: string; slots: any[] }[] = provider.slotsByDate ?? [];
  const totalSlots: number = provider.openSlotCount ?? 0;

  const initials = provider.name
    .split(' ')
    .filter((w: string) => !['Dr.', 'Dr'].includes(w))
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View className="mb-3 bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Provider header */}
      <TouchableOpacity
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.7}
        className="px-4 py-3.5 flex-row items-center gap-3"
      >
        <View className="w-10 h-10 rounded-full bg-primary-100 items-center justify-center flex-shrink-0">
          <Text className="text-primary-700 text-sm font-bold">{initials}</Text>
        </View>

        <View className="flex-1">
          <Text className="text-gray-900 font-semibold text-sm">{provider.name}</Text>
          {provider.credentials ? (
            <Text className="text-gray-400 text-xs mt-0.5">{provider.credentials}</Text>
          ) : null}
        </View>

        {totalSlots > 0 ? (
          <View className="bg-green-50 border border-green-200 rounded-full px-3 py-0.5 flex-row items-center gap-1 mr-1">
            <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <Text className="text-green-700 text-xs font-semibold">
              {totalSlots} open {totalSlots === 1 ? 'slot' : 'slots'}
            </Text>
          </View>
        ) : (
          <View className="bg-gray-50 border border-gray-200 rounded-full px-3 py-0.5 mr-1">
            <Text className="text-gray-400 text-xs">Fully booked</Text>
          </View>
        )}

        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
      </TouchableOpacity>

      {/* Expanded: slots grouped by date */}
      {expanded && (
        <View className="border-t border-gray-100">
          {slotsByDate.length === 0 ? (
            <View className="px-4 py-4 items-center">
              <Text className="text-gray-400 text-sm">No open slots in the next 30 days</Text>
            </View>
          ) : (
            slotsByDate.map((day) => (
              <View key={day.date}>
                {/* Date header */}
                <View className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex-row items-center justify-between">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {day.dateLabel}
                  </Text>
                  <Text className="text-xs text-gray-400">{day.slots.length} slot{day.slots.length !== 1 ? 's' : ''}</Text>
                </View>

                {/* Slots for this date */}
                {day.slots.map((slot: any, i: number) => (
                  <View
                    key={slot.startAt}
                    className={`flex-row items-center px-4 py-3 gap-3 ${i < day.slots.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    <View className="flex-1">
                      <Text className="text-gray-900 font-semibold text-sm">
                        {fmt(slot.startAt)} – {fmt(slot.endAt)}
                      </Text>
                      <Text className="text-gray-400 text-xs mt-0.5">{slot.durationMin} min</Text>
                    </View>

                    <View className="flex-row items-center gap-1.5 mr-2">
                      <View className="w-2 h-2 rounded-full bg-green-400" />
                      <Text className="text-green-700 text-xs font-medium">Open</Text>
                    </View>

                    <TouchableOpacity
                      onPress={() =>
                        router.push({
                          pathname: '/(agent)/fill-slot',
                          params: {
                            providerId: provider.id,
                            providerName: provider.name,
                            slotStartAt: slot.startAt,
                            slotEndAt: slot.endAt,
                          },
                        })
                      }
                      className="flex-row items-center gap-1 bg-primary-50 border border-primary-100 px-3 py-1.5 rounded-full"
                    >
                      <Ionicons name="people-outline" size={12} color="#2563eb" />
                      <Text className="text-primary-700 text-xs font-semibold">Fill</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

export default function AgentDashboard() {
  const { name, clearAuth } = useAuthStore();
  const { data, isLoading, refetch, isRefetching } = useDashboard();
  const [allExpanded, setAllExpanded] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    clearAuth();
    router.replace('/(auth)/login');
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const providers: any[] = data?.providers ?? [];

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-gray-500 text-sm">{today}</Text>
          <Text className="text-xl font-bold text-gray-900">
            Good morning, {name?.split(' ')[0]}
          </Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} className="p-2">
          <Ionicons name="log-out-outline" size={22} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Stat cards */}
        <View className="flex-row gap-3 mb-4">
          <StatCard
            label="Open Slots (30d)"
            value={data?.totalOpenSlots ?? '—'}
            icon="time-outline"
            color="#16a34a"
          />
          <StatCard
            label="Open Callbacks"
            value={data?.openCallbacks ?? '—'}
            icon="call-outline"
            color="#d97706"
            badge={data?.openCallbacks}
            onPress={() => router.push('/(agent)/copilot')}
          />
        </View>
        <View className="flex-row gap-3 mb-6">
          <StatCard
            label="Cancellations"
            value={data?.openCancellations ?? '—'}
            icon="close-circle-outline"
            color="#dc2626"
            badge={data?.openCancellations}
            onPress={() => router.push('/(agent)/copilot')}
          />
          <StatCard
            label="Waitlist"
            value={data?.waitlistOpportunities ?? '—'}
            icon="list-outline"
            color="#7c3aed"
          />
        </View>

        {/* Copilot CTA */}
        <TouchableOpacity
          onPress={() => router.push('/(agent)/copilot')}
          className="bg-primary-600 rounded-2xl p-4 mb-6 flex-row items-center gap-3"
        >
          <View className="w-10 h-10 bg-white/20 rounded-xl items-center justify-center">
            <Ionicons name="sparkles" size={20} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-white font-semibold">Open AI Copilot</Text>
            <Text className="text-white/70 text-xs mt-0.5">
              Ask about scheduling, patients, waitlists…
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>

        {/* Available slots — all providers, rolling 30 days */}
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-base font-semibold text-gray-900">Available Appointments</Text>
            <Text className="text-xs text-gray-400 mt-0.5">Next 30 days · tap a provider to drill in</Text>
          </View>
          {providers.length > 0 && (
            <TouchableOpacity onPress={() => setAllExpanded((e) => !e)}>
              <Text className="text-primary-600 text-xs font-medium">
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View className="bg-white rounded-2xl p-6 items-center">
            <Text className="text-gray-400 text-sm">Loading…</Text>
          </View>
        ) : providers.length > 0 ? (
          providers.map((provider: any) => (
            <ProviderSlotGroup key={provider.id} provider={provider} />
          ))
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 p-6 items-center">
            <Ionicons name="calendar-outline" size={32} color="#d1d5db" />
            <Text className="text-gray-400 text-sm mt-2">No providers assigned</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
