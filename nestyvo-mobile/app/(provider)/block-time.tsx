import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const TZ = 'America/Los_Angeles';

// Next 30 days as date strings
function buildDays() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toLocaleDateString('en-CA', { timeZone: TZ });
    const label = i === 0
      ? 'Today'
      : i === 1
      ? 'Tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
    return { iso, label };
  });
}

const HOURS = Array.from({ length: 22 }, (_, i) => {
  const h = Math.floor(i / 2) + 7; // 7am to 5:30pm
  const m = i % 2 === 0 ? '00' : '30';
  const label = new Date(`2000-01-01T${String(h).padStart(2,'0')}:${m}:00`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { value: `${String(h).padStart(2,'0')}:${m}`, label };
});

const BLOCK_TYPES = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'personal', label: 'Personal' },
  { value: 'administrative', label: 'Admin' },
  { value: 'other', label: 'Other' },
];

export default function BlockTimeScreen() {
  const days = buildDays();
  const [selectedDate, setSelectedDate] = useState(days[0].iso);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('12:00');
  const [blockType, setBlockType] = useState('other');
  const [reason, setReason] = useState('');

  const queryClient = useQueryClient();

  const createBlock = useMutation({
    mutationFn: () => {
      const startAt = `${selectedDate}T${startTime}:00`;
      const endAt = `${selectedDate}T${endTime}:00`;
      return api.post('/providers/self/blocks', { startAt, endAt, blockType, reason: reason || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-dashboard'] });
      Alert.alert(
        'Time Blocked',
        `${selectedLabel} ${startLabel} – ${endLabel} is now blocked.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    },
    onError: () => Alert.alert('Error', 'Could not save block. Please try again.'),
  });

  const selectedDay = days.find((d) => d.iso === selectedDate)!;
  const selectedLabel = selectedDay?.label ?? selectedDate;
  const startLabel = HOURS.find((h) => h.value === startTime)?.label ?? startTime;
  const endLabel = HOURS.find((h) => h.value === endTime)?.label ?? endTime;

  const startIdx = HOURS.findIndex((h) => h.value === startTime);
  const validEndHours = HOURS.filter((_, i) => i > startIdx);

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Block Time</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">

        {/* Date */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-5">
          {days.slice(0, 14).map((d) => {
            const active = d.iso === selectedDate;
            return (
              <TouchableOpacity
                key={d.iso}
                onPress={() => setSelectedDate(d.iso)}
                className={`mx-1 px-4 py-2 rounded-full border ${
                  active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Start time */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Start time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-5">
          {HOURS.map((h) => {
            const active = h.value === startTime;
            return (
              <TouchableOpacity
                key={h.value}
                onPress={() => {
                  setStartTime(h.value);
                  // Push end time forward if needed
                  const si = HOURS.findIndex((x) => x.value === h.value);
                  const ei = HOURS.findIndex((x) => x.value === endTime);
                  if (ei <= si) setEndTime(HOURS[Math.min(si + 2, HOURS.length - 1)].value);
                }}
                className={`mx-1 px-4 py-2 rounded-full border ${
                  active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>
                  {h.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* End time */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">End time</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-5">
          {validEndHours.map((h) => {
            const active = h.value === endTime;
            return (
              <TouchableOpacity
                key={h.value}
                onPress={() => setEndTime(h.value)}
                className={`mx-1 px-4 py-2 rounded-full border ${
                  active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>
                  {h.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Block type */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Type</Text>
        <View className="flex-row gap-2 mb-5 flex-wrap">
          {BLOCK_TYPES.map((t) => {
            const active = t.value === blockType;
            return (
              <TouchableOpacity
                key={t.value}
                onPress={() => setBlockType(t.value)}
                className={`px-4 py-2 rounded-full border ${
                  active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'
                }`}
              >
                <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Reason */}
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Reason <Text className="font-normal normal-case">(optional)</Text>
        </Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Out of office, doctor's appointment…"
          placeholderTextColor="#9ca3af"
          className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 text-sm mb-6"
          multiline
          numberOfLines={2}
        />

        {/* Summary + Submit */}
        <View className="bg-primary-50 border border-primary-100 rounded-2xl p-4 mb-4">
          <Text className="text-primary-800 text-sm font-semibold mb-1">Block summary</Text>
          <Text className="text-primary-700 text-sm">
            {selectedLabel} · {startLabel} – {endLabel}
          </Text>
          <Text className="text-primary-500 text-xs mt-0.5 capitalize">{blockType}</Text>
        </View>

        <TouchableOpacity
          onPress={() => createBlock.mutate()}
          disabled={createBlock.isPending}
          className="bg-primary-600 rounded-2xl py-4 items-center"
        >
          <Text className="text-white font-semibold text-base">
            {createBlock.isPending ? 'Saving…' : 'Block This Time'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
