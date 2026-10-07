import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, Modal, ScrollView } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, appointmentTypesApi, ProviderAppointmentType } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

const TZ = 'America/Los_Angeles';
function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: TZ,
  });
}

// Workstream B (Oct 3 2026) — this screen used to be a fixed slot with a
// single Confirm button. Charlene: each provider has their OWN appointment/
// service types (never a global list); selecting one auto-populates a
// default duration, but the agent can still adjust the actual appointment
// length before saving — the saved startAt/endAt stays the real source of
// truth for availability, same as it already was.

function TypePicker({
  visible,
  onClose,
  types,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  types: ProviderAppointmentType[];
  onSelect: (t: ProviderAppointmentType) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[70%]">
          <Text className="text-base font-bold text-gray-900 mb-4">Appointment Type</Text>
          <ScrollView>
            {types.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => { onSelect(t); onClose(); }}
                className="flex-row items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
              >
                <Text className="text-gray-800 font-medium text-sm">{t.name}</Text>
                <Text className="text-gray-400 text-xs">{t.durationMin} min</Text>
              </TouchableOpacity>
            ))}
            {types.length === 0 && (
              <Text className="text-gray-400 text-sm text-center py-4">
                No appointment types set up for this provider yet.
              </Text>
            )}
          </ScrollView>
          <TouchableOpacity onPress={onClose} className="mt-1 items-center py-2">
            <Text className="text-gray-400 text-sm">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function BookSlotScreen() {
  const { providerId, providerName, slotStartAt, slotEndAt, patientId, patientName, callbackId } = useLocalSearchParams<{
    providerId: string;
    providerName: string;
    slotStartAt: string;
    slotEndAt: string;
    patientId: string;
    patientName: string;
    callbackId?: string;
  }>();
  const queryClient = useQueryClient();
  const [booked, setBooked] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [selectedType, setSelectedType] = useState<ProviderAppointmentType | null>(null);

  // Charlene, Oct 6 2026 (Tax Refund 1040 pilot) — the real bug behind
  // "Business Tax Filing showed 45/50 min instead of 90": this field used
  // to default to the RAW CLICKED SLOT's length (originalDurationMin,
  // whatever the open-slot grid happened to generate) the moment this
  // screen opened, before anyone touched the Appointment Type picker.
  // Tapping the picker correctly overwrote it with the type's real
  // duration — but nothing required that tap, so "Confirm Booking" would
  // silently save the slot's raw length for anyone who skipped it. Now
  // durationMin starts null (no fabricated default) when the provider has
  // real types configured, and Confirm is disabled until a type is picked
  // — matching her instruction that Appointment Type must be selected
  // before completing the booking, not treated as optional. Providers
  // with zero configured types (not this pilot, but don't break them)
  // keep the old slot-length fallback — there's nothing else to select.
  const originalDurationMin = slotStartAt && slotEndAt
    ? Math.round((new Date(slotEndAt).getTime() - new Date(slotStartAt).getTime()) / 60000)
    : 50;
  const [durationMin, setDurationMin] = useState<string | null>(null);

  const { data: types = [] } = useQuery({
    queryKey: ['appointment-types', providerId],
    queryFn: () => appointmentTypesApi.list(providerId),
    enabled: !!providerId,
  });
  const activeTypes = types.filter((t) => t.isActive);
  const typeRequired = activeTypes.length > 0;

  const selectType = (t: ProviderAppointmentType) => {
    setSelectedType(t);
    setDurationMin(String(t.durationMin)); // auto-populate; agent can still edit below
  };

  const effectiveDurationMin = durationMin !== null
    ? Math.max(5, Number(durationMin) || originalDurationMin)
    : originalDurationMin;
  const canConfirm = !typeRequired || !!selectedType;
  const effectiveEndAt = slotStartAt
    ? new Date(new Date(slotStartAt).getTime() + effectiveDurationMin * 60000).toISOString()
    : slotEndAt;

  const bookAppointment = useMutation({
    mutationFn: async () => {
      await api.post(`/providers/${providerId}/appointments`, {
        patientId,
        startAt: slotStartAt,
        endAt: effectiveEndAt,
        locationType: 'in_person',
        appointmentTypeId: selectedType?.id,
      });
      if (callbackId) {
        await api.patch(`/dashboard/agent/callbacks/${callbackId}/dismiss`).catch(() => {});
      }
    },
    onSuccess: () => {
      setBooked(true);
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['provider-schedule'] });
    },
    onError: (err: any) => {
      Alert.alert('Couldn\'t book appointment', err?.response?.data?.message || 'Please try again.');
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">Book Appointment</Text>
        <HomeButton href="/(agent)" />
      </View>

      <View className="flex-1 items-center justify-center px-6">
        {booked ? (
          <View className="items-center">
            <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
            <Text className="text-gray-900 font-bold text-lg mt-4">Appointment Booked</Text>
            <Text className="text-gray-500 text-sm mt-1 text-center">
              {patientName} is scheduled with {providerName}.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace(`/(agent)/patients/${patientId}`)}
              className="mt-6 bg-primary-600 rounded-xl px-6 py-3"
            >
              <Text className="text-white font-semibold text-sm">View Profile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="bg-white rounded-2xl border border-gray-100 p-6 w-full max-w-sm">
            <View className="w-12 h-12 bg-primary-50 rounded-xl items-center justify-center mb-4">
              <Ionicons name="calendar-outline" size={24} color="#2563eb" />
            </View>
            <Text className="text-gray-900 font-bold text-base mb-1">{patientName}</Text>
            <Text className="text-gray-500 text-sm mb-4">with {providerName}</Text>
            <View className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-4">
              <Text className="text-gray-700 text-sm font-medium">
                {slotStartAt ? fmt(slotStartAt) : ''}
              </Text>
            </View>

            <Text className="text-gray-500 text-xs font-medium mb-2">
              Appointment Type{typeRequired ? ' *' : ''}
            </Text>
            <TouchableOpacity
              onPress={() => setTypeModal(true)}
              className={`flex-row items-center justify-between bg-gray-50 border rounded-xl px-3 py-3 mb-4 ${
                typeRequired && !selectedType ? 'border-amber-300' : 'border-gray-200'
              }`}
            >
              <Text className={selectedType ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>
                {selectedType ? selectedType.name : 'Select an appointment type'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>

            <Text className="text-gray-500 text-xs font-medium mb-2">Duration (minutes)</Text>
            <TextInput
              value={durationMin ?? ''}
              onChangeText={setDurationMin}
              keyboardType="number-pad"
              placeholder={typeRequired ? 'Select a type first' : '50'}
              editable={!!selectedType || !typeRequired}
              className={`border rounded-xl px-3 py-3 text-sm mb-1 ${
                selectedType || !typeRequired ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-gray-100 border-gray-200 text-gray-400'
              }`}
            />
            <Text className="text-gray-400 text-xs mb-5">
              {selectedType || !typeRequired
                ? `Ends ${new Date(effectiveEndAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ })}${selectedType ? ` · default for ${selectedType.name} is ${selectedType.durationMin} min` : ''}`
                : 'Pick an appointment type to set the default duration — you can still adjust it after.'}
            </Text>

            <TouchableOpacity
              onPress={() => bookAppointment.mutate()}
              disabled={bookAppointment.isPending || !canConfirm}
              className={`rounded-xl py-3 items-center ${canConfirm ? 'bg-primary-600' : 'bg-gray-300'}`}
            >
              {bookAppointment.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-sm">Confirm Booking</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TypePicker visible={typeModal} onClose={() => setTypeModal(false)} types={activeTypes} onSelect={selectType} />
    </SafeAreaView>
  );
}
