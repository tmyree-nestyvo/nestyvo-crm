import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, providersApi } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';
import { Option, PickerField, TIME_OPTIONS, timeLabel, toMinutes, TZ, BlockList } from '../../components/BlockTimeParts';

// Charlene, Oct 14 "Last Review" (7:30–8:30, 10:40–11:10): the old screen —
// rows of date and time chips, plus Type and Reason — was "a little hard for
// the provider to look at". It now matches the admin's Hours & Blocks card:
// One-time / Daily / Weekly / Monthly, start and end dropdowns, and the
// upcoming blocks grouped into collapsible series with "Remove all".
// Type and Reason are gone ("we don't need type or reason really").

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Frequency = 'once' | 'daily' | 'weekly' | 'monthly';

function dateOptions(days: number): Option[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const id = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
    return { id, label };
  });
}
const DATES = dateOptions(120);
const END_DATES = dateOptions(366);
const dateLabel = (opts: Option[], id: string) => opts.find((o) => o.id === id)?.label ?? id;

export default function BlockTimeScreen() {
  const queryClient = useQueryClient();
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [date, setDate] = useState(DATES[0].id);
  const [weeklyDays, setWeeklyDays] = useState<number[]>([new Date().getDay()]);
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [ends, setEnds] = useState<'indefinite' | 'date'>('indefinite');
  const [endDate, setEndDate] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ['provider-self-blocks'],
    queryFn: providersApi.getSelfBlocks,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['provider-self-blocks'] });
    queryClient.invalidateQueries({ queryKey: ['provider-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['provider-available-slots'] });
    queryClient.invalidateQueries({ queryKey: ['provider-schedule'] });
  };

  const resetForm = () => {
    setFrequency('once');
    setDate(DATES[0].id);
    setStart('09:00');
    setEnd('12:00');
    setEnds('indefinite');
    setEndDate(null);
    setEditingId(null);
  };

  const toggleDay = (i: number) =>
    setWeeklyDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()));

  const save = useMutation({
    mutationFn: async () => {
      if (toMinutes(start) >= toMinutes(end)) {
        throw new Error(`Start (${timeLabel(start)}) has to be before end (${timeLabel(end)}).`);
      }
      // Editing one date = replace it, same as the admin screen.
      if (editingId) await providersApi.deleteSelfBlock(editingId);
      if (frequency === 'once') {
        return api.post('/providers/self/blocks', { startAt: `${date}T${start}:00`, endAt: `${date}T${end}:00` });
      }
      const indefinite = ends === 'indefinite';
      return api.post('/providers/self/recurring-block', {
        frequency,
        daysOfWeek: frequency === 'weekly' ? weeklyDays : undefined,
        dayOfMonth: frequency === 'monthly' ? Number(dayOfMonth) || 1 : undefined,
        startTime: start,
        endTime: end,
        endDate: indefinite ? undefined : endDate ?? undefined,
        // Rides the service's own cap, as the admin screen does.
        weeks: indefinite ? 999 : undefined,
      });
    },
    onSuccess: () => {
      const wasEditing = !!editingId;
      resetForm();
      refresh();
      Alert.alert(wasEditing ? 'Updated' : 'Time blocked', wasEditing ? 'Block updated.' : 'Your block is saved.');
    },
    onError: (err: any) =>
      Alert.alert("Couldn't save block", err?.response?.data?.message || err?.message || 'Please try again.'),
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => providersApi.deleteSelfBlock(id))),
    onSuccess: refresh,
    onError: (err: any) => Alert.alert("Couldn't remove block", err?.response?.data?.message || 'Please try again.'),
  });

  const startEdit = (b: any) => {
    const s = new Date(b.startAt);
    setEditingId(b.id);
    setFrequency('once');
    setDate(s.toLocaleDateString('en-CA', { timeZone: TZ }));
    setStart(s.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }));
    setEnd(new Date(b.endAt).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }));
  };

  const needsDays = frequency === 'weekly' && weeklyDays.length === 0;
  const needsEndDate = frequency !== 'once' && ends === 'date' && !endDate;
  const summary =
    frequency === 'once' ? `${dateLabel(DATES, date)}, ${timeLabel(start)} – ${timeLabel(end)}`
    : `${frequency === 'daily' ? 'Every day'
        : frequency === 'weekly' ? `Every ${weeklyDays.map((d) => DAY_LABELS[d]).join(', ') || '…'}`
        : `Monthly on day ${Number(dayOfMonth) || 1}`}, ${timeLabel(start)} – ${timeLabel(end)}${
        ends === 'date' && endDate ? `, through ${dateLabel(END_DATES, endDate)}` : ', indefinitely'}`;

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full border ${active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`;
  const chipText = (active: boolean) => `text-xs font-medium ${active ? 'text-white' : 'text-gray-600'}`;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900 flex-1">Block Time</Text>
        <HomeButton href="/(provider)" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
        <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-base font-semibold text-gray-900">{editingId ? 'Edit Block' : 'Block Time'}</Text>
            {editingId && (
              <TouchableOpacity onPress={resetForm}>
                <Text className="text-gray-400 text-xs font-medium">Cancel edit</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text className="text-gray-400 text-xs mb-4">Time you're unavailable — once, or on a repeating cadence.</Text>

          <View className="flex-row flex-wrap gap-1.5 mb-4">
            {(['once', 'daily', 'weekly', 'monthly'] as const).map((f) => (
              <TouchableOpacity key={f} onPress={() => setFrequency(f)} className={chip(frequency === f)}>
                <Text className={`${chipText(frequency === f)} capitalize`}>{f === 'once' ? 'One-time' : f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {frequency === 'once' && (
            <PickerField
              label="Date"
              placeholder="Pick a date"
              value={{ id: date, label: dateLabel(DATES, date) }}
              options={DATES}
              onSelect={(o) => setDate(o.id)}
            />
          )}

          {frequency === 'weekly' && (
            <>
              <Text className="text-gray-500 text-xs font-medium mb-2">Repeats on (pick one or more days)</Text>
              <View className="flex-row flex-wrap gap-1.5 mb-4">
                {DAY_SHORT.map((label, i) => (
                  <TouchableOpacity key={i} onPress={() => toggleDay(i)} className={chip(weeklyDays.includes(i))}>
                    <Text className={chipText(weeklyDays.includes(i))}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {frequency === 'monthly' && (
            <PickerField
              label="Day of the month"
              placeholder="Pick a day"
              value={{ id: dayOfMonth, label: `Day ${dayOfMonth}` }}
              options={Array.from({ length: 28 }, (_, i) => ({ id: String(i + 1), label: `Day ${i + 1}` }))}
              onSelect={(o) => setDayOfMonth(o.id)}
            />
          )}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <PickerField label="Start time" placeholder="Select" value={{ id: start, label: timeLabel(start) }}
                options={TIME_OPTIONS} onSelect={(o) => setStart(o.id)} />
            </View>
            <View className="flex-1">
              <PickerField label="End time" placeholder="Select" value={{ id: end, label: timeLabel(end) }}
                options={TIME_OPTIONS} onSelect={(o) => setEnd(o.id)} />
            </View>
          </View>

          {frequency !== 'once' && (
            <>
              <Text className="text-gray-500 text-xs font-medium mb-2">Ends</Text>
              <View className="flex-row gap-1.5 mb-4">
                {(['indefinite', 'date'] as const).map((opt) => (
                  <TouchableOpacity key={opt} onPress={() => setEnds(opt)} className={chip(ends === opt)}>
                    <Text className={chipText(ends === opt)}>{opt === 'indefinite' ? 'Indefinitely' : 'Through a date'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {ends === 'date' && (
                <PickerField
                  label="Through"
                  placeholder="Pick the last date"
                  value={endDate ? { id: endDate, label: dateLabel(END_DATES, endDate) } : null}
                  options={END_DATES}
                  onSelect={(o) => setEndDate(o.id)}
                />
              )}
            </>
          )}

          <TouchableOpacity
            onPress={() => save.mutate()}
            disabled={save.isPending || needsDays || needsEndDate}
            className={`rounded-xl py-3.5 items-center ${needsDays || needsEndDate ? 'bg-gray-300' : 'bg-gray-900'}`}
          >
            {save.isPending ? <ActivityIndicator color="#fff" /> : (
              <Text className="text-white font-semibold text-sm">
                {needsDays ? 'Pick at least one day' : needsEndDate ? 'Pick an end date' : `${editingId ? 'Save' : 'Add'} — ${summary}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-2xl border border-gray-100 p-4">
          {isLoading ? (
            <ActivityIndicator color="#2563eb" />
          ) : blocks.length === 0 ? (
            <Text className="text-gray-400 text-sm">No upcoming blocks.</Text>
          ) : (
            <BlockList blocks={blocks} onEdit={startEdit} onRemove={(ids) => remove.mutate(ids)} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
