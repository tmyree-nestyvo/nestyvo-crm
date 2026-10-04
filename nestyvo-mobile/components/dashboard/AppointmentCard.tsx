import { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Appointment {
  id: string;
  startAt: string;
  endAt?: string;
  patient: string | null;
  type?: string | null;
  status: string | null;
  locationType: 'virtual' | 'in_person' | null;
  // Present on rows synced from a provider's external calendar (Rula/
  // Headway) — see ExternalCalendarSyncService. These carry no patient
  // name (the source feed itself has none, confirmed by direct raw-feed
  // inspection AND the provider's own subscribed-calendar screenshots,
  // Oct 4 2026 — not an implementation gap), just the source's own event
  // title.
  source?: 'nestyvo' | 'external';
  externalSource?: 'rula' | 'headway' | 'other';
  // Workstream C (Oct 3-4 2026) — real per-event fields pulled from the
  // raw feed: telehealth join link, a separate platform-management link
  // (Rula's provider portal / Headway's per-event deep link), and
  // Headway's real "Telehealth" location.
  telehealthLink?: string | null;
  managementLink?: string | null;
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

const TZ = 'America/Los_Angeles';
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

// Charlene, Oct 4 2026 — "Clicking an external appointment displays its
// available source details and links" + "External appointments should
// remain read-only with respect to the source platform." All the data
// this needs is already on the row (no server round-trip), so this is a
// self-contained modal rather than a new screen/endpoint.
function ExternalEventDetail({ appt, visible, onClose }: { appt: Appointment; visible: boolean; onClose: () => void }) {
  const sourceLabel = EXTERNAL_SOURCE_LABEL[appt.externalSource ?? 'other'];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
          <View className="flex-row items-center justify-between mb-1">
            <View className="bg-gray-100 rounded-full px-2.5 py-1">
              <Text className="text-gray-600 text-xs font-semibold">{sourceLabel}</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-1">
              <Ionicons name="close" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <Text className="text-gray-900 font-bold text-lg mt-2">{appt.type ?? 'Busy'}</Text>
          <Text className="text-gray-500 text-sm mt-1">{fmtDateTime(appt.startAt)}</Text>
          {appt.endAt && (
            <Text className="text-gray-400 text-xs mt-0.5">
              {Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000)} min
              {appt.externalLocation ? ` · ${appt.externalLocation}` : ''}
            </Text>
          )}

          <View className="gap-2 mt-5">
            {appt.telehealthLink && (
              <TouchableOpacity
                onPress={() => Linking.openURL(appt.telehealthLink!)}
                className="flex-row items-center justify-center gap-2 bg-primary-600 rounded-xl py-3.5"
              >
                <Ionicons name="videocam" size={16} color="#fff" />
                <Text className="text-white font-semibold text-sm">Join Telehealth Session</Text>
              </TouchableOpacity>
            )}
            {appt.managementLink && (
              <TouchableOpacity
                onPress={() => Linking.openURL(appt.managementLink!)}
                className="flex-row items-center justify-center gap-2 bg-gray-50 border border-gray-200 rounded-xl py-3.5"
              >
                <Ionicons name="open-outline" size={16} color="#374151" />
                <Text className="text-gray-700 font-semibold text-sm">Open in {sourceLabel}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View className="flex-row items-start gap-2 mt-5 bg-gray-50 rounded-xl p-3">
            <Ionicons name="information-circle-outline" size={15} color="#9ca3af" style={{ marginTop: 1 }} />
            <Text className="text-gray-400 text-xs flex-1">
              Read-only — this appointment lives in {sourceLabel}. Changes made there sync back into Nestyvo; it
              can't be edited here.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AppointmentCard({ appt, onPress }: { appt: Appointment; onPress?: () => void }) {
  const [externalDetail, setExternalDetail] = useState(false);
  const time = new Date(appt.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isExternal = appt.source === 'external';
  const statusColor = isExternal ? '#6b7280' : STATUS_COLORS[appt.status ?? ''] ?? '#6b7280';
  const badgeText = isExternal ? EXTERNAL_SOURCE_LABEL[appt.externalSource ?? 'other'] : appt.status;
  const hasLinks = !!(appt.telehealthLink || appt.managementLink);

  return (
    <>
      <View
        className={`rounded-xl border mb-2 ${isExternal ? 'bg-gray-50 border-gray-100 border-dashed' : 'bg-white border-gray-100'}`}
      >
        <TouchableOpacity
          onPress={isExternal ? () => setExternalDetail(true) : onPress}
          disabled={!isExternal && !onPress}
          className="p-4 flex-row items-center gap-3"
        >
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
          ) : isExternal ? (
            <Ionicons name={hasLinks ? 'chevron-forward' : 'link-outline'} size={16} color="#c4c9d4" />
          ) : null}
        </TouchableOpacity>
      </View>

      {isExternal && (
        <ExternalEventDetail appt={appt} visible={externalDetail} onClose={() => setExternalDetail(false)} />
      )}
    </>
  );
}
