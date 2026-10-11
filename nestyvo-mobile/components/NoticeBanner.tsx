import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Charlene, Oct 10 recording (07:20, 14:00) — after a reschedule "this
// screen should just be a completion screen… wrap up and go back to our
// calendar view so that it's very clear that was a rescheduled
// appointment." Reschedules now land back on the calendar, on the new day,
// with this confirmation at the top. Shown whenever a `notice` route param
// is present; dismissible.
export function NoticeBanner({ message }: { message?: string }) {
  const [visible, setVisible] = useState(!!message);
  useEffect(() => setVisible(!!message), [message]);
  if (!visible || !message) return null;
  return (
    <View className="mx-5 mb-3 flex-row items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
      <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
      <Text className="flex-1 text-green-800 text-sm font-medium">{message}</Text>
      <TouchableOpacity onPress={() => setVisible(false)} className="p-1">
        <Ionicons name="close" size={16} color="#15803d" />
      </TouchableOpacity>
    </View>
  );
}

const TZ = 'America/Los_Angeles';
/** "Rescheduled Rainbow Green to Tue, Oct 20 at 10:00 AM" */
export function rescheduledNotice(patientName: string | undefined, startAt: string) {
  const when = new Date(startAt).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  }).replace(/, (\d{1,2}:\d{2})/, ' at $1');
  return `Rescheduled${patientName ? ` ${patientName}` : ''} to ${when}`;
}
export function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}
