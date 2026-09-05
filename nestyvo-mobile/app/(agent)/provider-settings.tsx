import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { practicesApi, providersApi } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

type Option = { id: string; label: string };

function PickerField({
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

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DayWindow = { enabled: boolean; startTime: string; endTime: string };

function defaultDays(): DayWindow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    enabled: i >= 1 && i <= 5,
    startTime: '09:00',
    endTime: '17:00',
  }));
}

const TZ = 'America/Los_Angeles';
function fmtBlockDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

export default function ProviderSettingsScreen() {
  const queryClient = useQueryClient();
  const [practice, setPractice] = useState<Option | null>(null);
  const [provider, setProvider] = useState<Option | null>(null);
  const [days, setDays] = useState<DayWindow[]>(defaultDays());

  const [blockFrequency, setBlockFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [blockDay, setBlockDay] = useState(4); // Thursday default
  const [blockDayOfMonth, setBlockDayOfMonth] = useState('1');
  const [blockStart, setBlockStart] = useState('10:00');
  const [blockEnd, setBlockEnd] = useState('12:00');
  const [blockWeeks, setBlockWeeks] = useState('12');
  const [blockEndDate, setBlockEndDate] = useState(''); // optional YYYY-MM-DD, overrides blockWeeks/default range
  const [blockReason, setBlockReason] = useState('');

  const { data: practices = [] } = useQuery({ queryKey: ['practices'], queryFn: practicesApi.list });
  const { data: providers = [] } = useQuery({
    queryKey: ['providers', practice?.id],
    queryFn: () => providersApi.list(practice!.id),
    enabled: !!practice,
  });

  const { data: availability, isLoading: loadingAvailability } = useQuery({
    queryKey: ['provider-availability', provider?.id],
    queryFn: () => providersApi.getAvailability(provider!.id),
    enabled: !!provider,
  });

  const { data: blocks = [], isLoading: loadingBlocks } = useQuery({
    queryKey: ['provider-blocks', provider?.id],
    queryFn: () => providersApi.getBlocks(provider!.id),
    enabled: !!provider,
  });

  useEffect(() => {
    if (!availability) return;
    const next = defaultDays().map((d) => ({ ...d, enabled: false }));
    for (const w of availability) {
      next[w.dayOfWeek] = { enabled: true, startTime: w.startTime.slice(0, 5), endTime: w.endTime.slice(0, 5) };
    }
    setDays(next);
  }, [availability]);

  const practiceOptions: Option[] = practices.map((p: any) => ({ id: p.id, label: p.name }));
  const providerOptions: Option[] = providers.map((p: any) => ({
    id: p.id,
    label: `${p.firstName} ${p.lastName}${p.credentials ? ` ${p.credentials}` : ''}`,
  }));

  const saveAvailability = useMutation({
    mutationFn: () =>
      providersApi.replaceAvailability(
        provider!.id,
        days
          .map((d, i) => ({ ...d, dayOfWeek: i }))
          .filter((d) => d.enabled)
          .map((d) => ({ dayOfWeek: d.dayOfWeek, startTime: d.startTime, endTime: d.endTime })),
      ),
    onSuccess: () => {
      Alert.alert('Saved', 'Weekly hours updated.');
      queryClient.invalidateQueries({ queryKey: ['provider-availability', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
    },
    onError: (err: any) => {
      Alert.alert("Couldn't save hours", err?.response?.data?.message || 'Please check the times and try again.');
    },
  });

  const addRecurringBlock = useMutation({
    mutationFn: () =>
      providersApi.createRecurringBlock(provider!.id, {
        frequency: blockFrequency,
        dayOfWeek: blockFrequency === 'weekly' ? blockDay : undefined,
        dayOfMonth: blockFrequency === 'monthly' ? Number(blockDayOfMonth) || 1 : undefined,
        startTime: blockStart,
        endTime: blockEnd,
        endDate: blockEndDate || undefined,
        weeks: blockFrequency === 'weekly' && !blockEndDate ? Number(blockWeeks) || 12 : undefined,
        reason: blockReason || undefined,
      }),
    onSuccess: () => {
      setBlockReason('');
      queryClient.invalidateQueries({ queryKey: ['provider-blocks', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      Alert.alert('Added', 'Recurring block created.');
    },
    onError: (err: any) => {
      Alert.alert("Couldn't add block", err?.response?.data?.message || 'Please check the times and try again.');
    },
  });

  const removeBlock = useMutation({
    mutationFn: (blockId: string) => providersApi.deleteBlock(provider!.id, blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-blocks', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
    },
    onError: (err: any) => {
      Alert.alert("Couldn't remove block", err?.response?.data?.message || 'Please try again.');
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Provider Settings</Text>
          <Text className="text-xs text-gray-400 mt-0.5">Booking hours &amp; recurring blocks</Text>
        </View>
        <HomeButton href="/(agent)" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
        <PickerField
          label="Partner"
          placeholder="Select a partner practice"
          value={practice}
          options={practiceOptions}
          onSelect={(opt) => { setPractice(opt); setProvider(null); }}
        />

        <PickerField
          label="Provider"
          placeholder={practice ? 'Select a provider' : 'Select a partner first'}
          value={provider}
          options={providerOptions}
          onSelect={setProvider}
        />

        {provider ? (
          <>
            {/* Weekly hours */}
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5 mt-2">
              <Text className="text-base font-semibold text-gray-900 mb-1">Weekly Hours</Text>
              <Text className="text-gray-400 text-xs mb-4">
                The recurring days &amp; times {provider.label} accepts bookings.
              </Text>

              {loadingAvailability ? (
                <ActivityIndicator color="#2563eb" />
              ) : (
                days.map((d, i) => (
                  <View key={i} className="flex-row items-center gap-3 py-2 border-b border-gray-50 last:border-b-0">
                    <Switch
                      value={d.enabled}
                      onValueChange={(v) => setDays((prev) => prev.map((p, j) => (j === i ? { ...p, enabled: v } : p)))}
                    />
                    <Text className="text-gray-700 text-sm font-medium w-16">{DAY_SHORT[i]}</Text>
                    {d.enabled ? (
                      <View className="flex-row items-center gap-2 flex-1">
                        <TextInput
                          value={d.startTime}
                          onChangeText={(v) => setDays((prev) => prev.map((p, j) => (j === i ? { ...p, startTime: v } : p)))}
                          placeholder="09:00"
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 w-20 text-center"
                        />
                        <Text className="text-gray-400 text-xs">to</Text>
                        <TextInput
                          value={d.endTime}
                          onChangeText={(v) => setDays((prev) => prev.map((p, j) => (j === i ? { ...p, endTime: v } : p)))}
                          placeholder="17:00"
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 w-20 text-center"
                        />
                      </View>
                    ) : (
                      <Text className="text-gray-300 text-xs">Closed</Text>
                    )}
                  </View>
                ))
              )}

              <TouchableOpacity
                onPress={() => saveAvailability.mutate()}
                disabled={saveAvailability.isPending}
                className="bg-primary-600 rounded-xl py-3 items-center mt-4"
              >
                {saveAvailability.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-sm">Save Hours</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Recurring blocks */}
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
              <Text className="text-base font-semibold text-gray-900 mb-1">Recurring Blocks</Text>
              <Text className="text-gray-400 text-xs mb-4">
                e.g. "No bookings Thursdays 10am–12pm" — generates blocked slots on a repeating cadence, optionally through a specific end date.
              </Text>

              {/* Frequency */}
              <View className="flex-row gap-1.5 mb-3">
                {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setBlockFrequency(f)}
                    className={`px-3 py-1.5 rounded-full border capitalize ${blockFrequency === f ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                  >
                    <Text className={`text-xs font-medium capitalize ${blockFrequency === f ? 'text-white' : 'text-gray-600'}`}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {blockFrequency === 'weekly' && (
                <View className="flex-row flex-wrap gap-1.5 mb-3">
                  {DAY_SHORT.map((label, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setBlockDay(i)}
                      className={`px-3 py-1.5 rounded-full border ${blockDay === i ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                    >
                      <Text className={`text-xs font-medium ${blockDay === i ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {blockFrequency === 'monthly' && (
                <View className="flex-row items-center gap-2 mb-3">
                  <Text className="text-gray-400 text-xs">Day of month</Text>
                  <TextInput
                    value={blockDayOfMonth}
                    onChangeText={setBlockDayOfMonth}
                    placeholder="1"
                    keyboardType="number-pad"
                    className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 w-14 text-center"
                  />
                </View>
              )}

              <View className="flex-row items-center gap-2 mb-3">
                <TextInput
                  value={blockStart}
                  onChangeText={setBlockStart}
                  placeholder="10:00"
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 w-20 text-center"
                />
                <Text className="text-gray-400 text-xs">to</Text>
                <TextInput
                  value={blockEnd}
                  onChangeText={setBlockEnd}
                  placeholder="12:00"
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 w-20 text-center"
                />
                {blockFrequency === 'weekly' && !blockEndDate && (
                  <>
                    <Text className="text-gray-400 text-xs ml-2">for</Text>
                    <TextInput
                      value={blockWeeks}
                      onChangeText={setBlockWeeks}
                      placeholder="12"
                      keyboardType="number-pad"
                      className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 w-14 text-center"
                    />
                    <Text className="text-gray-400 text-xs">weeks</Text>
                  </>
                )}
              </View>

              <Text className="text-gray-500 text-xs font-medium mb-2">End date (optional)</Text>
              <TextInput
                value={blockEndDate}
                onChangeText={setBlockEndDate}
                placeholder="YYYY-MM-DD — leave blank for a default range"
                placeholderTextColor="#9ca3af"
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 mb-3"
              />

              <TextInput
                value={blockReason}
                onChangeText={setBlockReason}
                placeholder="Reason (optional)"
                placeholderTextColor="#9ca3af"
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 mb-3"
              />

              <TouchableOpacity
                onPress={() => addRecurringBlock.mutate()}
                disabled={addRecurringBlock.isPending}
                className="bg-gray-900 rounded-xl py-2.5 items-center mb-1"
              >
                {addRecurringBlock.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-sm">
                    Add — {blockFrequency === 'daily'
                      ? `Every day${blockEndDate ? ` through ${blockEndDate}` : ''}`
                      : blockFrequency === 'monthly'
                      ? `Monthly on the ${blockDayOfMonth || '1'}${blockEndDate ? ` through ${blockEndDate}` : ''}`
                      : `Every ${DAY_LABELS[blockDay]}${blockEndDate ? ` through ${blockEndDate}` : `, ${blockWeeks || '12'} weeks`}`}
                  </Text>
                )}
              </TouchableOpacity>

              {loadingBlocks ? (
                <ActivityIndicator color="#2563eb" style={{ marginTop: 12 }} />
              ) : blocks.length > 0 ? (
                <View className="mt-4 pt-4 border-t border-gray-50">
                  <Text className="text-gray-400 text-xs font-medium mb-2">
                    Upcoming blocks ({blocks.length})
                  </Text>
                  {blocks.map((b: any) => (
                    <View key={b.id} className="flex-row items-center justify-between py-1.5">
                      <Text className="text-gray-600 text-xs flex-1">
                        {fmtBlockDate(b.startAt)} – {new Date(b.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: TZ })}
                        {b.reason ? ` · ${b.reason}` : ''}
                      </Text>
                      <TouchableOpacity onPress={() => removeBlock.mutate(b.id)} className="p-1">
                        <Ionicons name="close-circle" size={16} color="#d1d5db" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
