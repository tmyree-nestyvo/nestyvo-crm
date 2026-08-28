import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

const TZ = 'America/Los_Angeles';

function useRoster() {
  return useQuery({
    queryKey: ['provider-roster'],
    queryFn: () => api.get('/patients/roster').then((r) => r.data),
    staleTime: 60_000,
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ,
  });
}

function fmtDob(dob: string | null) {
  if (!dob) return null;
  return new Date(dob + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

const CONTACT_ICON: Record<string, string> = {
  phone: 'call-outline',
  sms: 'chatbubble-outline',
  email: 'mail-outline',
};

const WAITLIST_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active:    { label: 'Waitlist', bg: '#fef3c7', text: '#92400e' },
  scheduled: { label: 'Scheduling', bg: '#dbeafe', text: '#1e40af' },
  none:      { label: '', bg: '', text: '' },
};

function ClientTile({ patient }: { patient: any }) {
  const initials = `${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase();
  const wl = WAITLIST_CONFIG[patient.waitlistStatus] ?? WAITLIST_CONFIG.none;
  const contactIcon = CONTACT_ICON[patient.preferredContact] ?? 'call-outline';

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({
          pathname: '/(provider)/clients/[id]',
          params: { id: patient.id, name: `${patient.firstName} ${patient.lastName}` },
        })
      }
      activeOpacity={0.7}
      className="bg-white rounded-2xl border border-gray-100 p-4 mb-3"
    >
      <View className="flex-row items-start gap-3">
        {/* Avatar */}
        <View className="w-11 h-11 rounded-full bg-primary-100 items-center justify-center flex-shrink-0">
          <Text className="text-primary-700 text-sm font-bold">{initials}</Text>
        </View>

        {/* Main info */}
        <View className="flex-1">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="text-gray-900 font-semibold text-base">
              {patient.lastName}, {patient.firstName}
            </Text>
            {wl.label ? (
              <View style={{ backgroundColor: wl.bg }} className="rounded-full px-2.5 py-0.5">
                <Text style={{ color: wl.text }} className="text-xs font-semibold">{wl.label}</Text>
              </View>
            ) : null}
          </View>

          {/* DOB / Age */}
          {patient.dob ? (
            <Text className="text-gray-500 text-xs mt-0.5">
              DOB {fmtDob(patient.dob)}{patient.age != null ? ` · ${patient.age} yrs` : ''}
            </Text>
          ) : null}

          {/* Contact preference */}
          <View className="flex-row items-center gap-1 mt-1">
            <Ionicons name={contactIcon as any} size={12} color="#9ca3af" />
            <Text className="text-gray-400 text-xs capitalize">{patient.preferredContact}</Text>
          </View>
        </View>
      </View>

      {/* Appointment info */}
      {(patient.lastAppt || patient.nextAppt) ? (
        <View className="flex-row gap-3 mt-3 pt-3 border-t border-gray-50">
          {patient.lastAppt ? (
            <View className="flex-1">
              <Text className="text-xs text-gray-400 mb-0.5">Last visit</Text>
              <Text className="text-xs font-medium text-gray-700">{fmtDate(patient.lastAppt)}</Text>
            </View>
          ) : null}
          {patient.nextAppt ? (
            <View className="flex-1">
              <Text className="text-xs text-gray-400 mb-0.5">Next appointment</Text>
              <View className="flex-row items-center gap-1">
                <View className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <Text className="text-xs font-medium text-green-700">{fmtDate(patient.nextAppt)}</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-center gap-1.5 mt-3 pt-3 border-t border-gray-50">
        <Ionicons name="chatbox-ellipses-outline" size={12} color="#9ca3af" />
        <Text className="text-gray-400 text-xs">View ticket &amp; interaction history</Text>
        <Ionicons name="chevron-forward" size={14} color="#d1d5db" style={{ marginLeft: 'auto' }} />
      </View>
    </TouchableOpacity>
  );
}

export default function ClientsScreen() {
  const [tab, setTab] = useState<'active' | 'inactive'>('active');
  const [query, setQuery] = useState('');
  const { data, isLoading, refetch, isRefetching } = useRoster();

  const active: any[] = data?.active ?? [];
  const inactive: any[] = data?.inactive ?? [];
  const shown = tab === 'active' ? active : inactive;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shown;
    const digits = q.replace(/\D/g, '');
    return shown.filter((p: any) => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const phoneDigits = (p.phone ?? '').replace(/\D/g, '');
      const email = (p.email ?? '').toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        (digits.length > 0 && phoneDigits.includes(digits))
      );
    });
  }, [shown, query]);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900">My Clients</Text>
      </View>

      {/* Search */}
      <View className="px-5 pb-3">
        <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4 gap-3">
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, phone, or email…"
            placeholderTextColor="#9ca3af"
            className="flex-1 py-3 text-sm text-gray-800"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Active / Inactive tab switcher */}
      <View className="flex-row px-5 mb-1 border-b border-gray-100">
        {(['active', 'inactive'] as const).map((t) => {
          const count = t === 'active' ? active.length : inactive.length;
          const isSelected = tab === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              className="mr-6 pb-3 pt-1"
              style={{ borderBottomWidth: isSelected ? 2 : 0, borderBottomColor: '#16a34a' }}
            >
              <View className="flex-row items-center gap-2">
                <Text
                  className={`text-sm font-semibold capitalize ${
                    isSelected ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {t}
                </Text>
                <View
                  className={`rounded-full px-2 py-0.5 ${
                    isSelected ? 'bg-green-100' : 'bg-gray-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-green-700' : 'text-gray-400'
                    }`}
                  >
                    {count}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <View className="items-center py-16">
            <Text className="text-gray-400">Loading…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
            <Ionicons name="people-outline" size={36} color="#d1d5db" />
            <Text className="text-gray-400 text-sm mt-3">
              {query ? 'No clients match your search' : `No ${tab} clients`}
            </Text>
          </View>
        ) : (
          filtered.map((p: any) => <ClientTile key={p.id} patient={p} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
