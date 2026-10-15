import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '../lib/api';

// A client's details with an Edit button — used on the provider's client
// page and (Charlene, Oct 14 "Last Review" 13:24: "I would want to be able to
// edit this contact… add the phone number, the email… details that were
// missed") the admin's client page.

const CONTACT_OPTIONS = [
  { id: 'phone', label: 'Phone' },
  { id: 'sms', label: 'Text' },
  { id: 'email', label: 'Email' },
];

const inputClass = 'bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="flex-row py-1.5">
      <Text className="text-gray-400 text-sm w-32">{label}</Text>
      <Text className={`text-sm flex-1 ${value ? 'text-gray-900' : 'text-gray-300'}`}>{value || 'Not set'}</Text>
    </View>
  );
}

export function ClientDetailsCard({ client }: { client: any }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const reset = () =>
    setForm({
      firstName: client.firstName ?? '',
      lastName: client.lastName ?? '',
      phone: client.phone ?? '',
      email: client.email ?? '',
      dob: client.dob ?? '',
      preferredContact: client.preferredContact ?? 'phone',
      referralSource: client.referralSource ?? '',
    });
  useEffect(reset, [client]);

  const save = useMutation({
    mutationFn: () => patientsApi.update(client.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', client.id] });
      queryClient.invalidateQueries({ queryKey: ['provider-roster'] });
      queryClient.invalidateQueries({ queryKey: ['provider-waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setEditing(false);
      setMessage('Saved');
    },
    onError: (e: any) => setMessage(e?.response?.data?.message ?? 'Could not save'),
  });

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dobOk = !form.dob || /^\d{4}-\d{2}-\d{2}$/.test(form.dob.trim());
  const canSave = !!form.firstName?.trim() && !!form.lastName?.trim() && dobOk && !save.isPending;

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</Text>
        {!editing ? (
          <TouchableOpacity onPress={() => { setMessage(null); setEditing(true); }} className="flex-row items-center gap-1">
            <Ionicons name="create-outline" size={15} color="#2563eb" />
            <Text className="text-primary-600 text-sm font-medium">Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!editing ? (
        <>
          <Row label="Phone" value={client.phone} />
          <Row label="Email" value={client.email} />
          <Row label="Date of birth" value={client.dob} />
          <Row label="Prefers" value={CONTACT_OPTIONS.find((o) => o.id === client.preferredContact)?.label} />
          <Row label="Referred by" value={client.referralSource} />
          {message ? <Text className="text-green-600 text-xs mt-2">{message}</Text> : null}
        </>
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-2">
            <TextInput value={form.firstName} onChangeText={set('firstName')} placeholder="First name" className={`${inputClass} flex-1`} />
            <TextInput value={form.lastName} onChangeText={set('lastName')} placeholder="Last name" className={`${inputClass} flex-1`} />
          </View>
          <TextInput value={form.phone} onChangeText={set('phone')} placeholder="Phone" keyboardType="phone-pad" className={inputClass} />
          <TextInput value={form.email} onChangeText={set('email')} placeholder="Email" autoCapitalize="none" keyboardType="email-address" className={inputClass} />
          <TextInput value={form.dob} onChangeText={set('dob')} placeholder="Date of birth (YYYY-MM-DD)" className={`${inputClass} ${dobOk ? '' : 'border-red-400'}`} />
          <View className="flex-row gap-2 items-center">
            <Text className="text-gray-400 text-sm mr-1">Prefers</Text>
            {CONTACT_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.id}
                onPress={() => set('preferredContact')(o.id)}
                className={`px-3 py-1.5 rounded-full border ${form.preferredContact === o.id ? 'bg-primary-600 border-primary-600' : 'border-gray-200'}`}
              >
                <Text className={`text-xs font-medium ${form.preferredContact === o.id ? 'text-white' : 'text-gray-600'}`}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={form.referralSource} onChangeText={set('referralSource')} placeholder="Referred by" className={inputClass} />
          {message ? <Text className="text-red-500 text-xs">{message}</Text> : null}
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => save.mutate()}
              disabled={!canSave}
              className={`flex-1 rounded-xl py-2.5 items-center ${canSave ? 'bg-primary-600' : 'bg-gray-200'}`}
            >
              {save.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-sm font-semibold">Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { reset(); setMessage(null); setEditing(false); }} className="flex-1 rounded-xl py-2.5 items-center border border-gray-200">
              <Text className="text-gray-600 text-sm font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
