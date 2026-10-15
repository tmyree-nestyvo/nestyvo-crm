import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Block-time pieces shared by the admin's Provider Settings and the
// provider's own Block Time screen (Charlene, Oct 14 "Last Review" 7:30 —
// the provider screen should look like the admin one).

export type Option = { id: string; label: string };

export function PickerField({
  label, placeholder, value, options, onSelect,
}: {
  label: string; placeholder: string; value: Option | null; options: Option[]; onSelect: (opt: Option) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Text className="text-gray-500 text-xs font-medium mb-2">{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-4"
      >
        <Text className={value ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>{value ? value.label : placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color="#9ca3af" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[70%]">
            <Text className="text-base font-bold text-gray-900 mb-4">{label}</Text>
            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                  className="px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                >
                  <Text className="text-gray-800 font-medium text-sm">{opt.label}</Text>
                </TouchableOpacity>
              ))}
              {options.length === 0 ? (
                <Text className="text-gray-400 text-sm text-center py-4">Nothing to pick from yet.</Text>
              ) : null}
            </ScrollView>
            <TouchableOpacity onPress={() => setOpen(false)} className="mt-1 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// Charlene, Oct 5 2026 — "Use easy start/end time dropdown/select
// controls" instead of free-text HH:mm entry. 15-min increments, reusing
// the PickerField component already defined above rather than a new
// time-picker widget.
export const TIME_OPTIONS: Option[] = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { id: `${hh}:${mm}`, label: `${h12}:${mm} ${period}` };
});
export function timeLabel(value: string) {
  return TIME_OPTIONS.find((t) => t.id === value)?.label ?? value;
}

// The API validates times as strict HH:mm. Typing "9:00" — the single most
// natural thing to do in a free-text time box — was rejected with a 400,
// and because Alert.alert is a no-op on web (see lib/alert.ts) that error
// was invisible: the hours just silently never saved. Charlene hit exactly
// this on Sep 29 (Peace of Mind had zero availability rows afterward).
// Accept what people actually type and normalize it instead of rejecting.
export function normalizeTime(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2})\s*:?\s*(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Compare as minutes, not strings — "9:00" > "17:00" lexicographically. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export const TZ = 'America/Los_Angeles';
export function fmtBlockDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

// Charlene, Oct 10 recording (25:28) — "we probably don't need to list every
// single date that has a block because it looks like this is a recurring
// block… just a clean list… otherwise this list could be very lengthy over
// time." Recurring blocks are stored as one row per date, so this groups
// rows with the same time-of-day and reason into one line ("Daily, 1:45 PM –
// 2:45 PM, Oct 10 – Dec 31 · 58 dates") that expands to the individual dates.
function blockSeriesKey(b: any) {
  const t = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  return `${t(b.startAt)}|${t(b.endAt)}|${b.reason ?? ''}`;
}
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BlockList({ blocks, onEdit, onRemove }: {
  blocks: any[]; onEdit: (b: any) => void; onRemove: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const groups = new Map<string, any[]>();
  for (const b of [...blocks].sort((x, y) => +new Date(x.startAt) - +new Date(y.startAt))) {
    const k = blockSeriesKey(b);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
  return (
    <>
      <Text className="text-gray-400 text-xs font-medium mb-2">
        Upcoming blocks ({groups.size === blocks.length ? blocks.length : `${blocks.length} dates`})
      </Text>
      {[...groups.entries()].map(([key, rows]) => {
        const [start, end, reason] = key.split('|');
        if (rows.length === 1) {
          const b = rows[0];
          return (
            <View key={b.id} className="flex-row items-center justify-between py-1.5">
              <Text className="text-gray-600 text-xs flex-1">
                {fmtBlockDate(b.startAt)} – {end}{reason ? ` · ${reason}` : ''}
              </Text>
              <TouchableOpacity onPress={() => onEdit(b)} className="p-1 ml-1">
                <Ionicons name="pencil-outline" size={15} color="#9ca3af" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onRemove([b.id])} className="p-1">
                <Ionicons name="close-circle" size={16} color="#d1d5db" />
              </TouchableOpacity>
            </View>
          );
        }
        const days = new Set(rows.map((r) => new Date(new Date(r.startAt).toLocaleString('en-US', { timeZone: TZ })).getDay()));
        const pattern = days.size === 7 ? 'Daily' : `Every ${[...days].sort().map((d) => DOW_SHORT[d]).join(', ')}`;
        const expanded = open === key;
        return (
          <View key={key} className="py-1.5">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity onPress={() => setOpen(expanded ? null : key)} className="flex-1 flex-row items-center gap-1">
                <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={13} color="#9ca3af" />
                <Text className="text-gray-700 text-xs flex-1">
                  <Text className="font-semibold">{pattern}, {start} – {end}</Text>
                  {reason ? ` · ${reason}` : ''} · {fmtDay(rows[0].startAt)} – {fmtDay(rows[rows.length - 1].startAt)} ({rows.length} dates)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (confirmKey !== key) { setConfirmKey(key); return; }
                  setConfirmKey(null);
                  onRemove(rows.map((r) => r.id));
                }}
                className="p-1 ml-1"
              >
                <Text className="text-red-500 text-[11px] font-medium">
                  {confirmKey === key ? `Remove ${rows.length} dates?` : 'Remove all'}
                </Text>
              </TouchableOpacity>
            </View>
            {expanded && rows.map((b) => (
              <View key={b.id} className="flex-row items-center justify-between py-1 pl-5">
                <Text className="text-gray-500 text-xs flex-1">{fmtBlockDate(b.startAt)}</Text>
                <TouchableOpacity onPress={() => onEdit(b)} className="p-1 ml-1">
                  <Ionicons name="pencil-outline" size={14} color="#9ca3af" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onRemove([b.id])} className="p-1">
                  <Ionicons name="close-circle" size={15} color="#d1d5db" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}
