import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, patientsApi, providersApi } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

const TZ = 'America/Los_Angeles';
function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

// Charlene, Oct 6 2026 (Tax Refund 1040 pilot, item 2 + Flow 2/4B-7B in
// her workflow doc) — "Gloria can search an existing Tax Refund 1040
// client OR add a new client... then select Appointment Type." Before
// this, the Provider app had no way to book an appointment at all —
// confirmed nothing in app/(provider)/ called POST .../appointments, and
// the backend route itself was OFFICE_STAFF-only (fixed alongside this,
// see providers.controller.ts). This screen is only the "pick/create a
// client" step that was missing; type selection, default duration, and
// the actual booking call all reuse the exact same (agent)/book-slot.tsx
// every other booking path already goes through — one booking
// implementation, not a second provider-only one.
export default function ProviderBookAppointmentScreen() {
  const { slotStartAt, slotEndAt } = useLocalSearchParams<{ slotStartAt: string; slotEndAt: string }>();
  const { data: self } = useQuery({ queryKey: ['provider-self'], queryFn: providersApi.getSelf });
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const { data: results = [], isLoading: searching } = useQuery({
    queryKey: ['patients', query],
    queryFn: () => patientsApi.search(query),
    enabled: query.length >= 2,
  });

  const goToBookSlot = (patientId: string, patientName: string) => {
    router.replace({
      pathname: '/(agent)/book-slot',
      params: {
        providerId: self?.id ?? '',
        providerName: self ? `${self.firstName} ${self.lastName}` : '',
        slotStartAt, slotEndAt,
        patientId, patientName,
      },
    });
  };

  const createClient = useMutation({
    mutationFn: () =>
      patientsApi.create({
        practiceId: self!.practiceId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        preferredContact: phone.trim() ? 'phone' : 'email',
        assignedProviderId: self!.id,
      }),
    onSuccess: (data) => {
      // Oct 9 2026 — Charlene's click-through: a client created from this
      // screen (the booking flow's inline "new client" step, as opposed to
      // clients/new.tsx's own dedicated screen, which already invalidated
      // correctly) didn't show up in search or the roster without a manual
      // refresh — this mutation never invalidated either cache at all.
      queryClient.invalidateQueries({ queryKey: ['provider-roster'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      goToBookSlot(data.id, `${firstName.trim()} ${lastName.trim()}`);
    },
    onError: (err: any) => Alert.alert("Couldn't create client", err?.response?.data?.message || 'Please try again.'),
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">Book Appointment</Text>
        <HomeButton href="/(provider)" />
      </View>

      {slotStartAt ? (
        <View className="mx-5 mt-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3">
          <Text className="text-primary-700 text-sm font-medium">{fmt(slotStartAt)}</Text>
        </View>
      ) : null}

      <View className="flex-row px-5 pt-4 gap-2">
        <TouchableOpacity
          onPress={() => setMode('search')}
          className={`flex-1 items-center py-2.5 rounded-full border ${mode === 'search' ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
        >
          <Text className={`text-sm font-semibold ${mode === 'search' ? 'text-white' : 'text-gray-600'}`}>Existing Client</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode('new')}
          className={`flex-1 items-center py-2.5 rounded-full border ${mode === 'new' ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
        >
          <Text className={`text-sm font-semibold ${mode === 'new' ? 'text-white' : 'text-gray-600'}`}>New Client</Text>
        </TouchableOpacity>
      </View>

      {mode === 'search' ? (
        <View className="flex-1 px-5 pt-4">
          <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4 gap-3 mb-3">
            <Ionicons name="search" size={16} color="#9ca3af" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, phone, or email…"
              placeholderTextColor="#9ca3af"
              className="flex-1 py-3 text-sm text-gray-800"
              autoCapitalize="none"
            />
          </View>
          <ScrollView>
            {searching ? (
              <ActivityIndicator color="#2563eb" style={{ marginTop: 16 }} />
            ) : query.length < 2 ? (
              <Text className="text-gray-400 text-sm text-center py-8">Type at least 2 characters to search.</Text>
            ) : results.length === 0 ? (
              <Text className="text-gray-400 text-sm text-center py-8">No clients found.</Text>
            ) : (
              results.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => goToBookSlot(p.id, p.name)}
                  className="flex-row items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-white mb-2"
                >
                  <View>
                    <Text className="text-gray-800 font-medium text-sm">{p.name}</Text>
                    <Text className="text-gray-400 text-xs mt-0.5">{p.phone}{p.email ? ` · ${p.email}` : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <ScrollView className="flex-1 px-5 pt-4" contentContainerClassName="pb-10">
          <Text className="text-gray-500 text-xs font-medium mb-2">First name *</Text>
          <TextInput value={firstName} onChangeText={setFirstName} placeholder="First name"
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4" />
          <Text className="text-gray-500 text-xs font-medium mb-2">Last name *</Text>
          <TextInput value={lastName} onChangeText={setLastName} placeholder="Last name"
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4" />
          <Text className="text-gray-500 text-xs font-medium mb-2">Phone</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="(555) 555-5555" keyboardType="phone-pad"
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4" />
          <Text className="text-gray-500 text-xs font-medium mb-2">Email</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="name@email.com" autoCapitalize="none" keyboardType="email-address"
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-6" />
          <TouchableOpacity
            onPress={() => createClient.mutate()}
            disabled={!firstName.trim() || !lastName.trim() || !self || createClient.isPending}
            className={`rounded-xl py-3.5 items-center ${firstName.trim() && lastName.trim() ? 'bg-primary-600' : 'bg-gray-200'}`}
          >
            {createClient.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Continue to Appointment Type</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
