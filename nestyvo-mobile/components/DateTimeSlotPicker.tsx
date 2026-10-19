import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { monthSlotRange, MAX_DAYS_AHEAD } from '../lib/slotRange';

// Charlene, Oct 9-10 2026 (second recording): "imagine a maybe an iPhone
// calendar here... you can just see a block of the month and select what
// date you want... when you click on the date, you should see it just like
// the admin sees it where it has all the open times, so the provider can
// just select the time." The provider side's booking/reschedule screens
// only ever had blind YYYY-MM-DD / HH:MM text boxes — no visibility into
// what's actually open, and no validation beyond format. This replaces
// both with one shared month-grid date picker + real open-slot list, reused
// by book-appointment.tsx and appointments/[id].tsx rather than built twice.
//
// Pulls from the exact same endpoint available-slots.tsx already uses
// (GET /dashboard/provider/available-slots) — the real computed grid
// (availability minus booked/blocked/external, already excludes the
// provider's own busy time), not a second slot-computation. Picking a time
// here only fixes the *start*; the caller still owns duration, and the
// backend's assertNoConflict is still the real safety net either way.

const TZ = 'America/Los_Angeles';
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
// Builds a calendar-date key directly from (year, month, day) rather than
// round-tripping through a local Date + timezone conversion — the exact
// trap this codebase has hit before (see the Aug 27 2026 timezone-bug
// note elsewhere): a system-local midnight Date formatted in Pacific time
// can roll to the adjacent day depending on the machine's own offset.
function cellIso(y: number, m0: number, d: number) {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}
// "Today," and the end of the booking window, as real instants formatted
// directly into Pacific calendar dates — safe, since this isn't a
// round-trip through local Date fields, just formatting a moment in time.
function todayIsoPT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
function daysInMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 0).getDate();
}
function firstDOW(y: number, m0: number) {
  return new Date(y, m0, 1).getDay();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}
function fmtTrigger(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

type Slot = { startAt: string; endAt: string; durationMin: number };

export function DateTimeSlotPicker({
  value,
  onSelect,
  label = 'Date & time',
  placeholder = 'Pick a date & time',
  daysWindow = MAX_DAYS_AHEAD,
  initialDate,
}: {
  /** Currently chosen start time, as an ISO instant, or null/undefined if nothing picked yet. */
  value?: string | null;
  onSelect: (startAt: string) => void;
  label?: string;
  placeholder?: string;
  /** How far out to offer dates — the provider's own available-slots window, widened past the 30-day default so a real "book into next month" ask isn't boxed out. */
  daysWindow?: number;
  /** Preselect this date (YYYY-MM-DD) when first opened and nothing is chosen yet — e.g. the day the provider tapped "Add Appointment" from. */
  initialDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<{ y: number; m0: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Loads the month being shown, not one long window from today (Oct 16
  // 2026 — open times used to stop 90 days out).
  const range = viewMonth ? monthSlotRange(viewMonth.y, viewMonth.m0) : null;
  const { data, isLoading } = useQuery({
    queryKey: ['provider-available-slots-picker', range?.from, range?.to],
    queryFn: () => api.get('/dashboard/provider/available-slots', { params: range! }).then((r) => r.data),
    enabled: open && !!range,
    staleTime: 30_000,
  });

  const slotsByDate: Record<string, Slot[]> = useMemo(() => {
    const map: Record<string, Slot[]> = {};
    for (const day of data?.slotsByDate ?? []) map[day.date] = day.slots;
    return map;
  }, [data]);

  const todayIso = todayIsoPT();
  const maxIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + daysWindow);
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
  }, [daysWindow]);
  const [todayY, todayM0] = [Number(todayIso.slice(0, 4)), Number(todayIso.slice(5, 7)) - 1];
  const [maxY, maxM0] = [Number(maxIso.slice(0, 4)), Number(maxIso.slice(5, 7)) - 1];

  // Reset to a sensible starting point each time the picker opens — the
  // existing value's month/date if one's set, else the preset date, else
  // the earliest date that actually has open slots, else just this month.
  useEffect(() => {
    if (!open) return;
    const seedIso = value ? new Date(value).toLocaleDateString('en-CA', { timeZone: TZ }) : (initialDate || null);
    if (seedIso) {
      setSelectedDate(seedIso);
      setViewMonth({ y: Number(seedIso.slice(0, 4)), m0: Number(seedIso.slice(5, 7)) - 1 });
    } else if (!viewMonth) {
      setViewMonth({ y: todayY, m0: todayM0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Once slots load, if nothing's selected yet, jump straight to the
  // earliest day that actually has openings instead of leaving an empty
  // "pick a day" screen staring back.
  useEffect(() => {
    if (!open || selectedDate || !data) return;
    const first = data.slotsByDate?.[0]?.date;
    if (first) {
      setSelectedDate(first);
      setViewMonth({ y: Number(first.slice(0, 4)), m0: Number(first.slice(5, 7)) - 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data]);

  const vm = viewMonth ?? { y: todayY, m0: todayM0 };
  const canGoPrev = vm.y > todayY || (vm.y === todayY && vm.m0 > todayM0);
  const canGoNext = vm.y < maxY || (vm.y === maxY && vm.m0 < maxM0);

  const leadBlanks = firstDOW(vm.y, vm.m0);
  const totalDays = daysInMonth(vm.y, vm.m0);
  const cells: (number | null)[] = [...Array(leadBlanks).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  const daySlots = selectedDate ? slotsByDate[selectedDate] ?? [] : [];

  const close = () => setOpen(false);

  return (
    <>
      <Text className="text-gray-500 text-xs font-medium mb-1.5">{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 mb-3"
      >
        <Text className={value ? 'text-gray-900 text-sm font-medium' : 'text-gray-400 text-sm'}>
          {value ? fmtTrigger(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={16} color="#9ca3af" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-8 max-h-[85%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-base font-bold text-gray-900">{label}</Text>
              <TouchableOpacity onPress={close} className="p-1">
                <Ionicons name="close" size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Month nav */}
              <View className="flex-row items-center justify-between mb-3">
                <TouchableOpacity
                  onPress={() => canGoPrev && setViewMonth({ y: vm.m0 === 0 ? vm.y - 1 : vm.y, m0: vm.m0 === 0 ? 11 : vm.m0 - 1 })}
                  disabled={!canGoPrev}
                  className="p-2"
                >
                  <Ionicons name="chevron-back" size={18} color={canGoPrev ? '#374151' : '#e5e7eb'} />
                </TouchableOpacity>
                <Text className="text-sm font-semibold text-gray-900">{MONTH_NAMES[vm.m0]} {vm.y}</Text>
                <TouchableOpacity
                  onPress={() => canGoNext && setViewMonth({ y: vm.m0 === 11 ? vm.y + 1 : vm.y, m0: vm.m0 === 11 ? 0 : vm.m0 + 1 })}
                  disabled={!canGoNext}
                  className="p-2"
                >
                  <Ionicons name="chevron-forward" size={18} color={canGoNext ? '#374151' : '#e5e7eb'} />
                </TouchableOpacity>
              </View>

              {/* Weekday header */}
              <View className="flex-row mb-1">
                {DOW.map((d, i) => (
                  <View key={i} style={{ width: '14.28%' }} className="items-center">
                    <Text className="text-gray-400 text-[11px] font-medium">{d}</Text>
                  </View>
                ))}
              </View>

              {/* Day grid */}
              <View className="flex-row flex-wrap mb-4">
                {cells.map((day, i) => {
                  if (day === null) return <View key={`b${i}`} style={{ width: '14.28%' }} className="h-11" />;
                  const iso = cellIso(vm.y, vm.m0, day);
                  const inWindow = iso >= todayIso && iso <= maxIso;
                  const isSelected = iso === selectedDate;
                  const hasSlots = (slotsByDate[iso]?.length ?? 0) > 0;
                  return (
                    <TouchableOpacity
                      key={iso}
                      disabled={!inWindow}
                      onPress={() => setSelectedDate(iso)}
                      style={{ width: '14.28%' }}
                      className="h-11 items-center justify-center"
                    >
                      <View className={`w-8 h-8 rounded-full items-center justify-center ${isSelected ? 'bg-primary-600' : ''}`}>
                        <Text
                          className={`text-sm ${
                            isSelected ? 'text-white font-semibold' : inWindow ? 'text-gray-900' : 'text-gray-300'
                          }`}
                        >
                          {day}
                        </Text>
                      </View>
                      {hasSlots && !isSelected ? <View className="w-1 h-1 rounded-full bg-primary-500 mt-0.5" /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Open times for the selected date */}
              {selectedDate ? (
                <>
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Open times — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  {isLoading ? (
                    <ActivityIndicator color="#2563eb" style={{ marginVertical: 12 }} />
                  ) : daySlots.length === 0 ? (
                    <Text className="text-gray-400 text-sm text-center py-4">No open times this day.</Text>
                  ) : (
                    <View className="flex-row flex-wrap gap-2 mb-2">
                      {daySlots.map((slot) => (
                        <TouchableOpacity
                          key={slot.startAt}
                          onPress={() => { onSelect(slot.startAt); close(); }}
                          className="px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50"
                        >
                          <Text className="text-gray-800 text-sm font-medium">{fmtTime(slot.startAt)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <Text className="text-gray-400 text-sm text-center py-4">Pick a date to see open times.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
