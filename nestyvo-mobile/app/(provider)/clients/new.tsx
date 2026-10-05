import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal } from 'react-native';
import { Alert } from '../../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi, providersApi, clientTagsApi } from '../../../lib/api';
import { HomeButton } from '../../../components/HomeButton';

// Charlene, Oct 5 2026 — "Under the Provider Clients tab, Provider should
// be able to create a client using the existing client creation service."
// Reuses patientsApi.create() exactly as-is (same service the agent/admin
// New Client form calls) — this screen only exists because that form's
// own UI assumes a cross-practice practice/provider picker a Provider
// role doesn't have or need (their own practiceId/providerId are
// implicit, resolved via GET /providers/self). No new backend was built
// for this — the create endpoint already worked for any role that could
// reach it; it just had no provider-facing screen before.

const CONTACT_METHODS = ['phone', 'email', 'sms'];

export default function ProviderNewClientScreen() {
  const queryClient = useQueryClient();
  const { data: self } = useQuery({ queryKey: ['provider-self'], queryFn: providersApi.getSelf });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredContact, setPreferredContact] = useState('phone');
  const [tag, setTag] = useState<{ id: string; name: string } | null>(null);
  const [tagModal, setTagModal] = useState(false);

  const { data: tags = [] } = useQuery({
    queryKey: ['client-tags', self?.practiceId],
    queryFn: () => clientTagsApi.list(self!.practiceId),
    enabled: !!self?.practiceId,
  });

  const create = useMutation({
    mutationFn: () =>
      patientsApi.create({
        practiceId: self!.practiceId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        preferredContact,
        assignedProviderId: self!.id,
        tagId: tag?.id,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['provider-roster'] });
      router.replace(`/(provider)/clients/${data.id}?name=${encodeURIComponent(`${firstName} ${lastName}`)}`);
    },
    onError: (err: any) => Alert.alert("Couldn't create client", err?.response?.data?.message || 'Please try again.'),
  });

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && !!self;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">New Client</Text>
        <HomeButton href="/(provider)" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 pb-10">
        <Text className="text-gray-500 text-xs font-medium mb-2">First name *</Text>
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
        />

        <Text className="text-gray-500 text-xs font-medium mb-2">Last name *</Text>
        <TextInput
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
        />

        <Text className="text-gray-500 text-xs font-medium mb-2">Phone</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="(555) 555-5555"
          keyboardType="phone-pad"
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
        />

        <Text className="text-gray-500 text-xs font-medium mb-2">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-4"
        />

        <Text className="text-gray-500 text-xs font-medium mb-2">Preferred contact</Text>
        <View className="flex-row gap-2 mb-4">
          {CONTACT_METHODS.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setPreferredContact(m)}
              className={`px-3 py-1.5 rounded-full border ${preferredContact === m ? 'bg-primary-600 border-primary-600' : 'bg-gray-50 border-gray-200'}`}
            >
              <Text className={`text-xs font-medium capitalize ${preferredContact === m ? 'text-white' : 'text-gray-600'}`}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Charlene: "Provider does not need to create new tag definitions"
            — selection only, from the practice's already-configured tags. */}
        <Text className="text-gray-500 text-xs font-medium mb-2">Client Tag</Text>
        <TouchableOpacity
          onPress={() => setTagModal(true)}
          className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-6"
        >
          <Text className={tag ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>{tag ? tag.name : 'None selected'}</Text>
          <Ionicons name="chevron-down" size={16} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
          className={`rounded-xl py-3.5 items-center ${canSubmit ? 'bg-primary-600' : 'bg-gray-200'}`}
        >
          {create.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Create Client</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={tagModal} transparent animationType="slide" onRequestClose={() => setTagModal(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[70%]">
            <Text className="text-base font-bold text-gray-900 mb-4">Client Tag</Text>
            <ScrollView>
              {tags.map((t: any) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => { setTag({ id: t.id, name: t.name }); setTagModal(false); }}
                  className="flex-row items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                >
                  <Text className="text-gray-800 font-medium text-sm">{t.name}</Text>
                  <Text className="text-gray-400 text-xs">Smart Fill: {t.blockMinutes} min</Text>
                </TouchableOpacity>
              ))}
              {tags.length === 0 && <Text className="text-gray-400 text-sm text-center py-4">No tags configured yet.</Text>}
            </ScrollView>
            {tag && (
              <TouchableOpacity onPress={() => { setTag(null); setTagModal(false); }} className="mt-2 items-center py-2">
                <Text className="text-red-500 text-sm">Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setTagModal(false)} className="mt-1 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
