import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

const TZ = 'America/Los_Angeles';
function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: TZ,
  });
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
  const [booked, setBooked] = useState(false);

  const bookAppointment = useMutation({
    mutationFn: async () => {
      await api.post(`/providers/${providerId}/appointments`, {
        patientId,
        startAt: slotStartAt,
        endAt: slotEndAt,
        locationType: 'in_person',
      });
      if (callbackId) {
        await api.patch(`/dashboard/agent/callbacks/${callbackId}/dismiss`).catch(() => {});
      }
    },
    onSuccess: () => setBooked(true),
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
            <View className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-5">
              <Text className="text-gray-700 text-sm font-medium">
                {slotStartAt ? fmt(slotStartAt) : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => bookAppointment.mutate()}
              disabled={bookAppointment.isPending}
              className="bg-primary-600 rounded-xl py-3 items-center"
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
    </SafeAreaView>
  );
}
