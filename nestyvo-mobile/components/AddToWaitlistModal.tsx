import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../lib/alert';
import { api, waitlistApi, appointmentTypesApi, patientsApi } from '../lib/api';

// Provider-side "Add to Waitlist", shared by (provider)/waitlist.tsx and the
// provider client profile. Charlene, Oct 14 "Last Review" (3:00–4:30): "what
// if I have a thousand customers? I would want to… type in their name… or if
// it's a new client, be able to add them by specifically typing in there",
// and (3:30) "I can't add the client to the weight list from their profile".

const WAITLIST_TYPES = [
  { id: 'new_patient', label: 'New Client' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'urgent', label: 'Urgent' },
];

type Picked = { id: string; name: string };

export function AddToWaitlistModal({
  visible, onClose, providerId, practiceId, patient: preset,
}: {
  visible: boolean;
  onClose: () => void;
  providerId: string;
  practiceId?: string;
  /** Opened from a client's profile: skip straight to the details step. */
  patient?: Picked;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'client' | 'new' | 'details'>(preset ? 'details' : 'client');
  const [patient, setPatient] = useState<Picked | null>(preset ?? null);
  const [query, setQuery] = useState('');
  const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [waitlistType, setWaitlistType] = useState('followup');
  const [appointmentTypeId, setAppointmentTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStep(preset ? 'details' : 'client');
      setPatient(preset ?? null);
    }
  }, [visible, preset?.id]);

  const { data: roster } = useQuery({
    queryKey: ['provider-roster'],
    queryFn: () => api.get('/patients/roster').then((r) => r.data),
    enabled: visible && !preset,
  });
  const { data: types = [] } = useQuery({
    queryKey: ['appointment-types', providerId],
    queryFn: () => appointmentTypesApi.list(providerId),
    enabled: visible,
  });

  const clients = useMemo(() => {
    const all = [...(roster?.active ?? []), ...(roster?.inactive ?? [])];
    const q = query.trim().toLowerCase();
    return all
      .filter((p: any) => !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .sort((a: any, b: any) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [roster, query]);

  const reset = () => {
    setStep(preset ? 'details' : 'client');
    setPatient(preset ?? null);
    setQuery('');
    setNewClient({ firstName: '', lastName: '', phone: '', email: '' });
    setWaitlistType('followup');
    setAppointmentTypeId(null);
  };
  const close = () => { reset(); onClose(); };

  const startNewClient = () => {
    const [first, ...rest] = query.trim().split(/\s+/);
    setNewClient({ firstName: first ?? '', lastName: rest.join(' '), phone: '', email: '' });
    setWaitlistType('new_patient');
    setStep('new');
  };

  const createClient = useMutation({
    mutationFn: () => patientsApi.create({
      practiceId,
      firstName: newClient.firstName.trim(),
      lastName: newClient.lastName.trim(),
      phone: newClient.phone.trim() || undefined,
      email: newClient.email.trim() || undefined,
      preferredContact: newClient.phone.trim() ? 'phone' : 'email',
      assignedProviderId: providerId,
    }),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['provider-roster'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setPatient({ id: created.id, name: `${newClient.firstName.trim()} ${newClient.lastName.trim()}` });
      setStep('details');
    },
    onError: (err: any) => Alert.alert("Couldn't create client", err?.response?.data?.message || 'Please try again.'),
  });

  const addMutation = useMutation({
    mutationFn: () => waitlistApi.add({
      patientId: patient!.id,
      waitlistType,
      appointmentTypeId: appointmentTypeId ?? undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['patient', patient!.id] });
      close();
    },
    onError: (err: any) => Alert.alert("Couldn't add to waitlist", err?.response?.data?.message || 'Please try again.'),
  });

  const field = 'bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-2';
  const canCreate = newClient.firstName.trim() && newClient.lastName.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[80%]">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-base font-bold text-gray-900">
              {step === 'client' ? 'Add to Waitlist' : step === 'new' ? 'New client' : patient?.name}
            </Text>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {step === 'client' && (
            <>
              <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 mb-3">
                <Ionicons name="search" size={16} color="#9ca3af" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search clients or type a new name"
                  placeholderTextColor="#9ca3af"
                  autoFocus
                  className="flex-1 px-2 py-3 text-sm text-gray-900"
                />
              </View>
              <TouchableOpacity
                onPress={startNewClient}
                className="flex-row items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-primary-300 bg-primary-50 mb-2"
              >
                <Ionicons name="person-add-outline" size={16} color="#2563eb" />
                <Text className="text-primary-700 font-medium text-sm">
                  {query.trim() ? `Add "${query.trim()}" as a new client` : 'Add a new client'}
                </Text>
              </TouchableOpacity>
              <ScrollView keyboardShouldPersistTaps="handled">
                {clients.length === 0 ? (
                  <Text className="text-gray-400 text-sm text-center py-6">
                    {query.trim() ? 'No clients match.' : 'No clients yet.'}
                  </Text>
                ) : (
                  clients.map((p: any) => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => { setPatient({ id: p.id, name: `${p.firstName} ${p.lastName}` }); setStep('details'); }}
                      className="flex-row items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                    >
                      <Text className="text-gray-800 font-medium text-sm">{p.firstName} {p.lastName}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </>
          )}

          {step === 'new' && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <TextInput value={newClient.firstName} onChangeText={(v) => setNewClient((c) => ({ ...c, firstName: v }))}
                placeholder="First name" placeholderTextColor="#9ca3af" className={field} />
              <TextInput value={newClient.lastName} onChangeText={(v) => setNewClient((c) => ({ ...c, lastName: v }))}
                placeholder="Last name" placeholderTextColor="#9ca3af" className={field} />
              <TextInput value={newClient.phone} onChangeText={(v) => setNewClient((c) => ({ ...c, phone: v }))}
                placeholder="Phone (optional)" placeholderTextColor="#9ca3af" keyboardType="phone-pad" className={field} />
              <TextInput value={newClient.email} onChangeText={(v) => setNewClient((c) => ({ ...c, email: v }))}
                placeholder="Email (optional)" placeholderTextColor="#9ca3af" autoCapitalize="none" keyboardType="email-address" className={field} />
              <View className="flex-row gap-2 mt-2">
                <TouchableOpacity onPress={() => setStep('client')} className="flex-1 items-center py-3.5 rounded-xl border border-gray-200">
                  <Text className="text-gray-500 text-sm font-medium">Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => createClient.mutate()}
                  disabled={!canCreate || createClient.isPending}
                  className={`flex-1 items-center py-3.5 rounded-xl ${canCreate ? 'bg-primary-600' : 'bg-gray-300'}`}
                >
                  {createClient.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Create & continue</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {step === 'details' && (
            <ScrollView>
              <Text className="text-gray-500 text-xs font-medium mb-2">Waiting for</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {WAITLIST_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setWaitlistType(t.id)}
                    className={`px-3 py-1.5 rounded-full border ${waitlistType === t.id ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`text-xs font-medium ${waitlistType === t.id ? 'text-white' : 'text-gray-600'}`}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {types.length > 0 && (
                <>
                  <Text className="text-gray-500 text-xs font-medium mb-2">Appointment type (optional)</Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {types.filter((t: any) => t.isActive).map((t: any) => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => setAppointmentTypeId(appointmentTypeId === t.id ? null : t.id)}
                        className={`px-3 py-1.5 rounded-full border ${appointmentTypeId === t.id ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                      >
                        <Text className={`text-xs font-medium ${appointmentTypeId === t.id ? 'text-white' : 'text-gray-600'}`}>{t.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity
                onPress={() => addMutation.mutate()}
                disabled={addMutation.isPending}
                className="bg-primary-600 rounded-xl py-3.5 items-center"
              >
                {addMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Add to Waitlist</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
