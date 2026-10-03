import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { providersApi } from '../../../lib/api';
import { HomeButton } from '../../../components/HomeButton';

// Workstream A (Oct 3 2026) — the one piece the Phase 0 audit found missing
// for "Calendar -> Appointment -> Client/Provider continuity" on the
// agent/admin side: a real detail screen for a booked appointment, reached
// from the agent calendar and from a client's Recent Appointments list.
// Display-only for now — Workstream B adds Cancel/Reschedule actions here
// once the backend endpoints for those exist, reusing this same screen
// rather than building a second one.

const TZ = 'America/Los_Angeles';
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled:   { label: 'Scheduled',  color: '#16a34a', bg: '#f0fdf4' },
  completed:   { label: 'Completed',  color: '#6b7280', bg: '#f9fafb' },
  cancelled:   { label: 'Cancelled',  color: '#dc2626', bg: '#fef2f2' },
  no_show:     { label: 'No Show',    color: '#d97706', bg: '#fffbeb' },
  rescheduled: { label: 'Rescheduled', color: '#7c3aed', bg: '#f5f3ff' },
};

function InfoRow({ icon, label, value, onPress }: { icon: any; label: string; value: string; onPress?: () => void }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} className="flex-row items-center gap-3 py-3 border-b border-gray-50">
      <View className="w-9 h-9 rounded-xl bg-gray-50 items-center justify-center flex-shrink-0">
        <Ionicons name={icon} size={16} color="#6b7280" />
      </View>
      <View className="flex-1">
        <Text className="text-gray-400 text-xs">{label}</Text>
        <Text className={`text-sm font-medium mt-0.5 ${onPress ? 'text-primary-600' : 'text-gray-900'}`}>{value}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color="#d1d5db" />}
    </Wrapper>
  );
}

export default function AppointmentDetailScreen() {
  const { id, providerId } = useLocalSearchParams<{ id: string; providerId: string }>();

  const { data: appt, isLoading } = useQuery({
    queryKey: ['appointment-detail', providerId, id],
    queryFn: () => providersApi.getAppointmentDetail(providerId, id),
    enabled: !!providerId && !!id,
  });

  const statusCfg = appt ? STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.scheduled : null;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">Appointment</Text>
        <HomeButton href="/(agent)" />
      </View>

      {isLoading || !appt ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 pb-10">
          <View className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-gray-900 font-bold text-lg flex-1">{appt.patient.name}</Text>
              {statusCfg && (
                <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: statusCfg.bg }}>
                  <Text className="text-xs font-semibold" style={{ color: statusCfg.color }}>{statusCfg.label}</Text>
                </View>
              )}
            </View>
            <Text className="text-gray-500 text-sm">{fmtDateTime(appt.startAt)}</Text>
            <Text className="text-gray-400 text-xs mt-0.5">
              {Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000)} min
              {appt.appointmentType ? ` · ${appt.appointmentType.name}` : ''}
            </Text>
          </View>

          <View className="bg-white rounded-2xl border border-gray-100 px-4">
            <InfoRow
              icon="person-outline"
              label="Client"
              value={appt.patient.name}
              onPress={() => router.push(`/(agent)/patients/${appt.patient.id}`)}
            />
            <InfoRow icon="medkit-outline" label="Provider" value={appt.provider.name} />
            <InfoRow icon="business-outline" label="Practice" value={appt.practice.name} />
            <InfoRow
              icon={appt.locationType === 'virtual' ? 'videocam-outline' : 'location-outline'}
              label="Location"
              value={appt.locationType === 'virtual' ? 'Virtual' : 'In Person'}
            />
            {appt.cancellationReason && (
              <InfoRow icon="information-circle-outline" label="Reason" value={appt.cancellationReason} />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
