import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  toolName: string;
  description: string;
  toolInput: Record<string, any>;
  onConfirm: () => void;
  onDeny: () => void;
  loading?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  schedule_appointment: 'Schedule Appointment',
  cancel_appointment: 'Cancel Appointment',
  reschedule_appointment: 'Reschedule Appointment',
  add_to_waitlist: 'Add to Waitlist',
  remove_from_waitlist: 'Remove from Waitlist',
  create_patient: 'Create Patient Record',
  update_patient: 'Update Patient',
  send_sms: 'Send SMS',
};

export function PendingActionCard({ toolName, description, toolInput, onConfirm, onDeny, loading }: Props) {
  const label = ACTION_LABELS[toolName] ?? toolName;

  return (
    <View className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <View className="px-4 py-3 bg-amber-100 flex-row items-center gap-2">
        <Ionicons name="warning-outline" size={16} color="#d97706" />
        <Text className="text-amber-800 font-semibold text-sm">{label}</Text>
      </View>

      <View className="px-4 py-3">
        <Text className="text-gray-700 text-sm mb-3">{description}</Text>

        <View className="bg-white rounded-lg border border-amber-100 p-3 mb-3">
          {Object.entries(toolInput)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([key, value]) => (
              <View key={key} className="flex-row mb-1">
                <Text className="text-gray-500 text-xs w-32 flex-shrink-0">
                  {key.replace(/_/g, ' ')}
                </Text>
                <Text className="text-gray-800 text-xs flex-1 font-medium">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </Text>
              </View>
            ))}
        </View>

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={onDeny}
            disabled={loading}
            className="flex-1 border border-gray-300 rounded-lg py-2 items-center"
          >
            <Text className="text-gray-600 font-medium text-sm">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            disabled={loading}
            className="flex-1 bg-primary-600 rounded-lg py-2 items-center"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-sm">Confirm</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
