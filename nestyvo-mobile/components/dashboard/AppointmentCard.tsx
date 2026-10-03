import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Appointment {
  id: string;
  startAt: string;
  patient: string | null;
  type?: string | null;
  status: string | null;
  locationType: 'virtual' | 'in_person' | null;
  // Present on rows synced from a provider's external calendar (Rula/
  // Headway) — see ExternalCalendarSyncService. These carry no patient
  // name (the source feed itself has none, confirmed by direct raw-feed
  // inspection, not an implementation gap — see that service's comment),
  // just a generic label.
  source?: 'nestyvo' | 'external';
  externalSource?: 'rula' | 'headway' | 'other';
  // Workstream C (Oct 3 2026) — real per-event fields pulled from the raw
  // feed (telehealth join link, Headway's "Telehealth" location), not
  // previously surfaced past the sync.
  telehealthLink?: string | null;
  externalLocation?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#16a34a',
  completed: '#6b7280',
  cancelled: '#dc2626',
  no_show: '#d97706',
  rescheduled: '#7c3aed',
};

const EXTERNAL_SOURCE_LABEL: Record<string, string> = { rula: 'Rula', headway: 'Headway', other: 'External' };

export function AppointmentCard({ appt, onPress }: { appt: Appointment; onPress?: () => void }) {
  const time = new Date(appt.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isExternal = appt.source === 'external';
  const statusColor = isExternal ? '#6b7280' : STATUS_COLORS[appt.status ?? ''] ?? '#6b7280';
  const badgeText = isExternal ? EXTERNAL_SOURCE_LABEL[appt.externalSource ?? 'other'] : appt.status;

  return (
    <View
      className={`rounded-xl border mb-2 ${isExternal ? 'bg-gray-50 border-gray-100 border-dashed' : 'bg-white border-gray-100'}`}
    >
      <TouchableOpacity onPress={onPress} disabled={!onPress} className="p-4 flex-row items-center gap-3">
        <View className="items-center w-14">
          <Text className={`font-bold text-sm ${isExternal ? 'text-gray-500' : 'text-primary-700'}`}>{time}</Text>
          <View
            className="mt-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${statusColor}18` }}
          >
            <Text className="text-xs font-medium" style={{ color: statusColor }}>
              {badgeText}
            </Text>
          </View>
        </View>

        <View className="w-px h-10 bg-gray-100" />

        <View className="flex-1">
          <Text className={`font-semibold text-sm ${isExternal ? 'text-gray-500' : 'text-gray-900'}`}>
            {isExternal ? appt.type ?? 'Busy' : appt.patient}
          </Text>
          {isExternal ? (
            appt.externalLocation ? (
              <Text className="text-gray-400 text-xs mt-0.5">{appt.externalLocation}</Text>
            ) : null
          ) : (
            <Text className="text-gray-500 text-xs mt-0.5">{appt.type ?? 'Appointment'}</Text>
          )}
        </View>

        {appt.locationType ? (
          <Ionicons
            name={appt.locationType === 'virtual' ? 'videocam-outline' : 'location-outline'}
            size={16}
            color="#9ca3af"
          />
        ) : isExternal && !appt.telehealthLink ? (
          <Ionicons name="link-outline" size={16} color="#c4c9d4" />
        ) : null}
      </TouchableOpacity>

      {isExternal && appt.telehealthLink && (
        <TouchableOpacity
          onPress={() => Linking.openURL(appt.telehealthLink!)}
          className="flex-row items-center gap-1.5 px-4 pb-3 -mt-1"
        >
          <Ionicons name="videocam" size={13} color="#2563eb" />
          <Text className="text-primary-600 text-xs font-medium">Join session</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
