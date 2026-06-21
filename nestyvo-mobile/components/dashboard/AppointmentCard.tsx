import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Appointment {
  id: string;
  startAt: string;
  patient: string;
  type?: string;
  status: string;
  locationType: 'virtual' | 'in_person';
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#16a34a',
  completed: '#6b7280',
  cancelled: '#dc2626',
  no_show: '#d97706',
  rescheduled: '#7c3aed',
};

export function AppointmentCard({ appt, onPress }: { appt: Appointment; onPress?: () => void }) {
  const time = new Date(appt.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const statusColor = STATUS_COLORS[appt.status] ?? '#6b7280';

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-xl border border-gray-100 p-4 mb-2 flex-row items-center gap-3"
    >
      <View className="items-center w-14">
        <Text className="text-primary-700 font-bold text-sm">{time}</Text>
        <View
          className="mt-1 px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${statusColor}18` }}
        >
          <Text className="text-xs font-medium" style={{ color: statusColor }}>
            {appt.status}
          </Text>
        </View>
      </View>

      <View className="w-px h-10 bg-gray-100" />

      <View className="flex-1">
        <Text className="text-gray-900 font-semibold text-sm">{appt.patient}</Text>
        <Text className="text-gray-500 text-xs mt-0.5">{appt.type ?? 'Appointment'}</Text>
      </View>

      <Ionicons
        name={appt.locationType === 'virtual' ? 'videocam-outline' : 'location-outline'}
        size={16}
        color="#9ca3af"
      />
    </TouchableOpacity>
  );
}
