import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Switch, Modal } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { practicesApi, providersApi, externalCalendarsApi, ExternalCalendarSource } from '../../lib/api';
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

// The API validates times as strict HH:mm. Typing "9:00" — the single most
// natural thing to do in a free-text time box — was rejected with a 400,
// and because Alert.alert is a no-op on web (see lib/alert.ts) that error
// was invisible: the hours just silently never saved. Charlene hit exactly
// this on Sep 29 (Peace of Mind had zero availability rows afterward).
// Accept what people actually type and normalize it instead of rejecting.
function normalizeTime(raw: string): string | null {
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
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const TZ = 'America/Los_Angeles';
function fmtBlockDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

const SOURCE_LABEL: Record<ExternalCalendarSource, string> = { rula: 'Rula', headway: 'Headway', other: 'Other' };

function timeAgo(iso: string | null) {
  if (!iso) return 'Never synced';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Synced just now';
  if (mins < 60) return `Synced ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Synced ${hrs}h ago`;
  return `Synced ${Math.floor(hrs / 24)}d ago`;
}

function ExternalCalendarsSection({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState<ExternalCalendarSource>('rula');
  const [feedUrl, setFeedUrl] = useState('');
  const [label, setLabel] = useState('');

  const { data: feeds = [], isLoading } = useQuery({
    queryKey: ['external-calendars', providerId],
    queryFn: () => externalCalendarsApi.list(providerId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['external-calendars', providerId] });

  const addFeed = useMutation({
    mutationFn: () => externalCalendarsApi.add(providerId, { source, feedUrl: feedUrl.trim(), label: label.trim() || undefined }),
    onSuccess: (created: any) => {
      invalidate();
      setFeedUrl(''); setLabel(''); setAdding(false);
      if (created?.lastSyncError) {
        Alert.alert('Calendar added, but the first sync failed', created.lastSyncError + '\n\nYou can retry with the sync button.');
      } else {
        Alert.alert('Calendar added', 'Synced successfully — its busy times will now be kept out of Nestyvo\'s open slots.');
      }
    },
    onError: (err: any) => Alert.alert('Could not add calendar', err?.response?.data?.message || 'Check the URL and try again.'),
  });

  const syncFeed = useMutation({
    mutationFn: (feedId: string) => externalCalendarsApi.sync(providerId, feedId),
    onSuccess: (result: any) => {
      invalidate();
      Alert.alert('Synced', `${result.imported} appointment${result.imported === 1 ? '' : 's'} found${result.removed ? `, ${result.removed} removed` : ''}.`);
    },
    onError: (err: any) => Alert.alert('Sync failed', err?.response?.data?.message || 'Please try again.'),
  });

  const removeFeed = useMutation({
    mutationFn: (feedId: string) => externalCalendarsApi.remove(providerId, feedId),
    onSuccess: invalidate,
    onError: (err: any) => Alert.alert('Could not remove calendar', err?.response?.data?.message || 'Please try again.'),
  });

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-semibold text-gray-900">External Calendars</Text>
        <TouchableOpacity
          onPress={() => setAdding((v) => !v)}
          className="flex-row items-center gap-1 bg-primary-50 px-3 py-1.5 rounded-full"
        >
          <Ionicons name={adding ? 'close' : 'add'} size={14} color="#2563eb" />
          <Text className="text-primary-700 text-xs font-semibold">{adding ? 'Cancel' : 'Add'}</Text>
        </TouchableOpacity>
      </View>
      <Text className="text-gray-400 text-xs mb-3">
        Read-only Rula/Headway (or other) calendar-export links — synced every 15 minutes so Nestyvo never offers a slot
        that overlaps one of this provider's outside appointments.
      </Text>

      {adding && (
        <View className="bg-gray-50 rounded-xl border border-gray-100 p-3 mb-3">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Source</Text>
          <View className="flex-row gap-1.5 mb-3">
            {(Object.keys(SOURCE_LABEL) as ExternalCalendarSource[]).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSource(s)}
                className={`px-3 py-1.5 rounded-full border ${source === s ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
              >
                <Text className={`text-xs font-medium ${source === s ? 'text-white' : 'text-gray-600'}`}>{SOURCE_LABEL[s]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Feed URL</Text>
          <TextInput
            value={feedUrl}
            onChangeText={setFeedUrl}
            placeholder="https://…/feed.ics"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 mb-3"
          />
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Label (optional)</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Personal Rula calendar"
            placeholderTextColor="#9ca3af"
            className="bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 mb-3"
          />
          <TouchableOpacity
            onPress={() => addFeed.mutate()}
            disabled={!feedUrl.trim() || addFeed.isPending}
            className={`rounded-xl py-2.5 items-center ${!feedUrl.trim() ? 'bg-gray-300' : 'bg-gray-900'}`}
          >
            {addFeed.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Add & Sync</Text>}
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color="#2563eb" className="mt-2" />
      ) : feeds.length === 0 ? (
        !adding && <Text className="text-gray-400 text-sm text-center py-3">No external calendars yet.</Text>
      ) : (
        feeds.map((f) => (
          <View key={f.id} className="flex-row items-center gap-2 py-2.5 border-t border-gray-50">
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <View className="bg-gray-100 rounded-full px-2 py-0.5">
                  <Text className="text-gray-600 text-xs font-semibold">{SOURCE_LABEL[f.source]}</Text>
                </View>
                {f.label ? <Text className="text-gray-700 text-xs font-medium">{f.label}</Text> : null}
              </View>
              <Text className={`text-xs mt-1 ${f.lastSyncError ? 'text-red-500' : 'text-gray-400'}`} numberOfLines={1}>
                {f.lastSyncError ? `Sync error: ${f.lastSyncError}` : timeAgo(f.lastSyncedAt)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => syncFeed.mutate(f.id)} disabled={syncFeed.isPending} className="p-1.5">
              <Ionicons name="sync" size={16} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeFeed.mutate(f.id)} disabled={removeFeed.isPending} className="p-1.5">
              <Ionicons name="trash-outline" size={16} color="#d1d5db" />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
}

export default function ProviderSettingsScreen() {
  const deepLink = useLocalSearchParams<{ practiceId?: string; providerId?: string }>();
  const queryClient = useQueryClient();
  const [practice, setPractice] = useState<Option | null>(null);
  const [provider, setProvider] = useState<Option | null>(null);
  const [days, setDays] = useState<DayWindow[]>(defaultDays());

  const [blockFrequency, setBlockFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [blockDays, setBlockDays] = useState<number[]>([4]); // Thursday default; multi-select
  const toggleBlockDay = (i: number) =>
    setBlockDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()));
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

  // Preselect when deep-linked from a specific provider in Partners, so the
  // two pickers aren't re-navigated by hand every time (Charlene, Sep 30
  // 2026 — this screen is now reached from the provider it belongs to).
  useEffect(() => {
    if (!deepLink.practiceId || practice) return;
    const match = practiceOptions.find((o) => o.id === deepLink.practiceId);
    if (match) setPractice(match);
  }, [deepLink.practiceId, practiceOptions, practice]);

  useEffect(() => {
    if (!deepLink.providerId || provider) return;
    const match = providerOptions.find((o) => o.id === deepLink.providerId);
    if (match) setProvider(match);
  }, [deepLink.providerId, providerOptions, provider]);

  type Window = { dayOfWeek: number; startTime: string; endTime: string };

  const saveAvailability = useMutation({
    mutationFn: (windows: Window[]) => providersApi.replaceAvailability(provider!.id, windows),
    onSuccess: () => {
      Alert.alert('Saved', 'Weekly hours updated.');
      queryClient.invalidateQueries({ queryKey: ['provider-availability', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
    },
    onError: (err: any) => {
      Alert.alert("Couldn't save hours", err?.response?.data?.message || 'Please check the times and try again.');
    },
  });

  // Normalize + validate before sending, and name the offending day rather
  // than surfacing the API's generic "must be HH:mm".
  function handleSaveHours() {
    const enabled = days.map((d, i) => ({ ...d, dayOfWeek: i })).filter((d) => d.enabled);
    if (!enabled.length) {
      Alert.alert('No days selected', 'Turn on at least one day before saving.');
      return;
    }
    const windows: Window[] = [];
    for (const d of enabled) {
      const startTime = normalizeTime(d.startTime);
      const endTime = normalizeTime(d.endTime);
      if (!startTime || !endTime) {
        Alert.alert(`Check ${DAY_LABELS[d.dayOfWeek]}'s hours`, 'Use a 24-hour time like 9:00 or 17:30.');
        return;
      }
      if (toMinutes(startTime) >= toMinutes(endTime)) {
        Alert.alert(
          `Check ${DAY_LABELS[d.dayOfWeek]}'s hours`,
          `Start (${startTime}) has to be before end (${endTime}).`,
        );
        return;
      }
      windows.push({ dayOfWeek: d.dayOfWeek, startTime, endTime });
    }
    // Show the normalized values back, so what's on screen matches what saved.
    setDays((prev) =>
      prev.map((p, i) => {
        const w = windows.find((x) => x.dayOfWeek === i);
        return w ? { ...p, startTime: w.startTime, endTime: w.endTime } : p;
      }),
    );
    saveAvailability.mutate(windows);
  }

  const addRecurringBlock = useMutation({
    mutationFn: () => {
      // Same HH:mm strictness as weekly hours above — normalize rather than
      // let the API reject it.
      const startTime = normalizeTime(blockStart);
      const endTime = normalizeTime(blockEnd);
      if (!startTime || !endTime) {
        throw new Error('Use a 24-hour time like 9:00 or 17:30.');
      }
      if (toMinutes(startTime) >= toMinutes(endTime)) {
        throw new Error(`Start (${startTime}) has to be before end (${endTime}).`);
      }
      return providersApi.createRecurringBlock(provider!.id, {
        frequency: blockFrequency,
        daysOfWeek: blockFrequency === 'weekly' ? blockDays : undefined,
        dayOfMonth: blockFrequency === 'monthly' ? Number(blockDayOfMonth) || 1 : undefined,
        startTime,
        endTime,
        endDate: blockEndDate || undefined,
        weeks: blockFrequency === 'weekly' && !blockEndDate ? Number(blockWeeks) || 12 : undefined,
        reason: blockReason || undefined,
      });
    },
    onSuccess: () => {
      setBlockReason('');
      queryClient.invalidateQueries({ queryKey: ['provider-blocks', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      Alert.alert('Added', 'Recurring block created.');
    },
    onError: (err: any) => {
      Alert.alert(
        "Couldn't add block",
        err?.response?.data?.message || err?.message || 'Please check the times and try again.',
      );
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

        {practice && providerOptions.length === 0 ? (
          // Charlene (Sep 28 2026): hit this exact dead end with a
          // brand-new partner that had no providers yet — the two pickers
          // above are all this screen has (it's booking-hours/recurring-
          // blocks, both provider-level, not partner-level info), so with
          // no provider there's nothing else to show. Rather than leave
          // that silent, point her straight at where a provider gets added.
          <View className="bg-white rounded-2xl border border-gray-100 p-5 items-center mt-1 mb-5">
            <Ionicons name="person-add-outline" size={26} color="#d1d5db" />
            <Text className="text-gray-500 text-sm text-center mt-2 mb-3">
              {practice.label} doesn't have any providers yet. Hours and recurring blocks are set per
              provider, so add one first — the partner's own business info and subscription status can
              still be edited from Partners without a provider.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/(agent)/partners')}
              className="flex-row items-center gap-1.5 bg-primary-600 px-4 py-2.5 rounded-full"
            >
              <Ionicons name="briefcase-outline" size={14} color="#fff" />
              <Text className="text-white text-xs font-semibold">Go to Partners</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
                          // Tidy "9" / "9:00" / "900" into 09:00 as soon as
                          // they tab away, so the accepted format is obvious
                          // before they ever press Save.
                          onBlur={() =>
                            setDays((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, startTime: normalizeTime(p.startTime) ?? p.startTime } : p)),
                            )
                          }
                          placeholder="09:00"
                          className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 w-20 text-center"
                        />
                        <Text className="text-gray-400 text-xs">to</Text>
                        <TextInput
                          value={d.endTime}
                          onChangeText={(v) => setDays((prev) => prev.map((p, j) => (j === i ? { ...p, endTime: v } : p)))}
                          onBlur={() =>
                            setDays((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, endTime: normalizeTime(p.endTime) ?? p.endTime } : p)),
                            )
                          }
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
                onPress={handleSaveHours}
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
                <>
                  <Text className="text-gray-400 text-xs mb-1.5">Repeats on (pick one or more days)</Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {DAY_SHORT.map((label, i) => {
                      const active = blockDays.includes(i);
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => toggleBlockDay(i)}
                          className={`px-3 py-1.5 rounded-full border ${active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                        >
                          <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
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
                disabled={addRecurringBlock.isPending || (blockFrequency === 'weekly' && blockDays.length === 0)}
                className={`rounded-xl py-2.5 items-center mb-1 ${
                  blockFrequency === 'weekly' && blockDays.length === 0 ? 'bg-gray-300' : 'bg-gray-900'
                }`}
              >
                {addRecurringBlock.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-sm">
                    Add — {blockFrequency === 'daily'
                      ? `Every day${blockEndDate ? ` through ${blockEndDate}` : ''}`
                      : blockFrequency === 'monthly'
                      ? `Monthly on the ${blockDayOfMonth || '1'}${blockEndDate ? ` through ${blockEndDate}` : ''}`
                      : blockDays.length === 0
                      ? 'Pick at least one day'
                      : `Every ${blockDays.map((d) => DAY_LABELS[d]).join(', ')}${blockEndDate ? ` through ${blockEndDate}` : `, ${blockWeeks || '12'} weeks`}`}
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

            <ExternalCalendarsSection providerId={provider.id} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
