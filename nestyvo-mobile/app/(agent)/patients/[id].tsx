import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { AppointmentCard } from '../../../components/dashboard/AppointmentCard';

function usePatient(id: string) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.get(`/patients/${id}`).then((r) => r.data),
  });
}

export default function PatientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: patient, isLoading } = usePatient(id);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">{patient?.name}</Text>
        <TouchableOpacity
          onPress={() => router.push(`/(agent)/copilot?context=patient:${id}`)}
          className="flex-row items-center gap-1.5 bg-primary-50 border border-primary-100 px-3 py-1.5 rounded-full"
        >
          <Ionicons name="sparkles-outline" size={14} color="#2563eb" />
          <Text className="text-primary-700 text-xs font-medium">Ask Copilot</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 pb-10">
        {/* Contact Info */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contact</Text>
          <InfoRow icon="call-outline" label="Phone" value={patient?.phone ?? '—'} />
          <InfoRow icon="mail-outline" label="Email" value={patient?.email ?? '—'} />
          <InfoRow icon="chatbubble-outline" label="Preferred" value={patient?.preferredContact ?? '—'} />
        </View>

        {/* Provider + Status */}
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Care</Text>
          <InfoRow icon="person-outline" label="Provider" value={patient?.assignedProvider ?? 'Unassigned'} />
          <InfoRow icon="list-outline" label="Waitlist" value={patient?.waitlistStatus ?? '—'} />
          <InfoRow icon="git-network-outline" label="Referral" value={patient?.referralSource ?? '—'} />
        </View>

        {/* Recent Appointments */}
        <Text className="text-base font-semibold text-gray-900 mb-3">Recent Appointments</Text>
        {patient?.recentAppointments?.length ? (
          patient.recentAppointments.map((appt: any) => (
            <AppointmentCard key={appt.id} appt={appt} />
          ))
        ) : (
          <View className="bg-white rounded-xl border border-gray-100 p-6 items-center">
            <Text className="text-gray-400 text-sm">No appointment history</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-3 mb-3 last:mb-0">
      <View className="w-7 h-7 bg-gray-50 rounded-lg items-center justify-center">
        <Ionicons name={icon} size={14} color="#6b7280" />
      </View>
      <Text className="text-gray-500 text-sm w-20">{label}</Text>
      <Text className="text-gray-900 text-sm font-medium flex-1">{value}</Text>
    </View>
  );
}
