import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { patientsApi, providersApi, practicesApi, clientTagsApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/store';

type Option = { id: string; label: string; sublabel?: string };

function PickerField({
  label,
  placeholder,
  value,
  options,
  onSelect,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: Option | null;
  options: Option[];
  onSelect: (opt: Option | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Text className="text-gray-500 text-xs font-medium mb-2">{label}</Text>
      <TouchableOpacity
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-4 ${disabled ? 'opacity-50' : ''}`}
      >
        <Text className={value ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>
          {value ? value.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#9ca3af" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[70%]">
            <Text className="text-base font-bold text-gray-900 mb-4">{label}</Text>
            <ScrollView className="gap-2">
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                  className="flex-row items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                >
                  <Text className="text-gray-800 font-medium text-sm">{opt.label}</Text>
                  {opt.sublabel ? <Text className="text-gray-400 text-xs">{opt.sublabel}</Text> : null}
                </TouchableOpacity>
              ))}
              {options.length === 0 ? (
                <Text className="text-gray-400 text-sm text-center py-4">Nothing to pick from yet.</Text>
              ) : null}
            </ScrollView>
            {value ? (
              <TouchableOpacity onPress={() => { onSelect(null); setOpen(false); }} className="mt-2 items-center py-2">
                <Text className="text-red-500 text-sm">Clear</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setOpen(false)} className="mt-1 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const CONTACT_METHODS = ['phone', 'email', 'sms'];

export default function NewClientScreen() {
  const { role, practiceId: myPracticeId } = useAuthStore();
  const isCrossPractice = role === 'administrator' || role === 'scheduling_agent';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredContact, setPreferredContact] = useState('phone');
  const [referralSource, setReferralSource] = useState('');
  const [practice, setPractice] = useState<Option | null>(null);
  const [provider, setProvider] = useState<Option | null>(null);
  const [tag, setTag] = useState<Option | null>(null);

  const effectivePracticeId = isCrossPractice ? practice?.id : myPracticeId ?? undefined;

  const { data: practices = [] } = useQuery({
    queryKey: ['practices'],
    queryFn: practicesApi.list,
    enabled: isCrossPractice,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers', effectivePracticeId],
    queryFn: () => providersApi.list(effectivePracticeId),
    enabled: !!effectivePracticeId,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['client-tags', effectivePracticeId],
    queryFn: () => clientTagsApi.list(effectivePracticeId),
    enabled: !!effectivePracticeId,
  });

  const createClient = useMutation({
    mutationFn: () =>
      patientsApi.create({
        practiceId: effectivePracticeId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        preferredContact,
        assignedProviderId: provider?.id,
        referralSource: referralSource.trim() || undefined,
        tagId: tag?.id,
      }),
    onSuccess: (data) => {
      router.replace(`/(agent)/patients/${data.id}`);
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t create client', err?.response?.data?.message || 'Please try again.');
    },
  });

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && !!effectivePracticeId;

  // Practice changed → clear selections that no longer apply.
  const handlePracticeSelect = (opt: Option | null) => {
    setPractice(opt);
    setProvider(null);
    setTag(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">New Client</Text>
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

        {isCrossPractice && (
          <PickerField
            label="Practice *"
            placeholder="Select a practice"
            value={practice}
            options={practices.map((p: any) => ({ id: p.id, label: p.name }))}
            onSelect={handlePracticeSelect}
          />
        )}

        <PickerField
          label="Provider"
          placeholder={effectivePracticeId ? 'Select a provider' : 'Pick a practice first'}
          value={provider}
          options={providers.map((p: any) => ({ id: p.id, label: `${p.firstName} ${p.lastName}`, sublabel: p.credentials }))}
          onSelect={setProvider}
          disabled={!effectivePracticeId}
        />

        <PickerField
          label="Block Size Tag"
          placeholder={effectivePracticeId ? 'Select a tag' : 'Pick a practice first'}
          value={tag}
          options={tags.map((t: any) => ({ id: t.id, label: t.name, sublabel: `${t.blockMinutes} min` }))}
          onSelect={setTag}
          disabled={!effectivePracticeId}
        />

        <Text className="text-gray-500 text-xs font-medium mb-2">Referral source</Text>
        <TextInput
          value={referralSource}
          onChangeText={setReferralSource}
          placeholder="e.g. Headway, word of mouth"
          className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-900 mb-6"
        />

        <TouchableOpacity
          onPress={() => createClient.mutate()}
          disabled={!canSubmit || createClient.isPending}
          className={`rounded-xl py-3.5 items-center ${canSubmit ? 'bg-primary-600' : 'bg-gray-200'}`}
        >
          {createClient.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-sm">Create Client</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
