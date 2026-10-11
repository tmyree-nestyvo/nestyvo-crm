import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Charlene, repeatedly across multiple rounds of testing — "this big
// string of numbers right here... this just needs to be more functional
// from a calendar side... imagine a maybe an iPhone calendar here, where
// you can just see a block of the month and select what date you want."
// That complaint was always about the horizontal day-strip on My Schedule
// (a fixed 30-day scroll with no way to go further), never about this
// month grid — Calendar's own Month view already looked and worked like
// this. Extracted out of app/(provider)/calendar.tsx verbatim (same
// visuals/behavior, zero change there) so My Schedule can show the exact
// same real "iPhone calendar" grid instead of a second, lesser widget.

const TZ = 'America/Los_Angeles';
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDOW(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function isoOf(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// Compact form for the tight month-grid cells, e.g. "10a" / "2:30p" — no
// room there for a full "10:00 AM".
function fmtTimeCompact(iso: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', hour12: true, timeZone: TZ,
  }).formatToParts(new Date(iso));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const ampm = parts.find((p) => p.type === 'dayPeriod')?.value?.charAt(0).toLowerCase() ?? '';
  return minute === '00' ? `${hour}${ampm}` : `${hour}:${minute}${ampm}`;
}

function DayApptTime({ appts }: { appts: { startAt: string }[] }) {
  if (!appts.length) return null;
  const label = fmtTimeCompact(appts[0].startAt);
  return (
    <Text className="text-[9px] font-bold text-primary-600 mt-0.5" numberOfLines={1}>
      {label}{appts.length > 1 ? ` +${appts.length - 1}` : ''}
    </Text>
  );
}

export function MonthCalendarGrid({
  year, month, today, selectedDate, apptsByDate, onPrevMonth, onNextMonth, onSelectDay, scroll = true,
  compact = false, openDates,
}: {
  year: number; month: number; today: string; selectedDate: string;
  apptsByDate: Record<string, { startAt: string }[]>;
  onPrevMonth: () => void; onNextMonth: () => void; onSelectDay: (iso: string) => void;
  /** Set false when the caller already wraps this in its own ScrollView (avoids nesting two vertical scrollers). */
  scroll?: boolean;
  /** Fixed-height cells instead of squares — square cells on a wide desktop
   * window are ~200px tall each, which pushed My Schedule's day panel (open
   * times + appointments) below the fold (Charlene, Oct 10 recording 11:04:
   * "this view needs to be a little more concise"). */
  compact?: boolean;
  /** Dates (YYYY-MM-DD) with at least one open slot — marked with a green dot. */
  openDates?: Set<string>;
}) {
  const numDays = daysInMonth(year, month);
  const leadingBlanks = firstDOW(year, month);
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: numDays }, (_, i) => i + 1)];

  const body = (
    <>
      <View className="flex-row items-center justify-between mb-3 mt-1">
        <TouchableOpacity onPress={onPrevMonth} className="p-2"><Ionicons name="chevron-back" size={20} color="#374151" /></TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={onNextMonth} className="p-2"><Ionicons name="chevron-forward" size={20} color="#374151" /></TouchableOpacity>
      </View>

      <View className="flex-row mb-1">
        {DOW.map((d) => (
          <Text key={d} className="flex-1 text-center text-xs font-semibold text-gray-400">{d}</Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((day, i) => {
          if (day === null) return <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className={compact ? 'h-12' : 'aspect-square'} />;
          const iso = isoOf(year, month, day);
          const isToday = iso === today;
          const isSelected = iso === selectedDate;
          const appts = apptsByDate[iso] ?? [];
          return (
            <TouchableOpacity
              key={iso}
              onPress={() => onSelectDay(iso)}
              style={{ width: `${100 / 7}%` }}
              className={compact ? 'h-12 items-center justify-center' : 'aspect-square items-center justify-center'}
            >
              <View className={`w-8 h-8 rounded-full items-center justify-center ${isSelected ? 'bg-primary-600' : isToday ? 'bg-primary-50' : ''}`}>
                <Text className={`text-sm ${isSelected ? 'text-white font-bold' : isToday ? 'text-primary-700 font-bold' : 'text-gray-700'}`}>
                  {day}
                </Text>
              </View>
              {compact ? (
                // Compact cells have no room for a time label — dots instead:
                // blue = something booked, green = open times available.
                <View className="flex-row gap-0.5 mt-0.5 h-1.5">
                  {appts.length > 0 && <View className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                  {openDates?.has(iso) && <View className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                </View>
              ) : (
                <DayApptTime appts={appts} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  if (!scroll) return <View>{body}</View>;
  return <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">{body}</ScrollView>;
}
