import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi, patientsApi, clientTagsApi } from '../../../lib/api';
import { HomeButton } from '../../../components/HomeButton';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: '#d97706', bg: '#fffbeb' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  resolved: { label: 'Resolved', color: '#16a34a', bg: '#f0fdf4' },
  closed: { label: 'Closed', color: '#6b7280', bg: '#f9fafb' },
};

const PRIORITY_COLOR: Record<string, string> = { low: '#9ca3af', normal: '#6b7280', high: '#dc2626' };

// Charlene, Phase 8 item 22 — see the identical note in (agent)/tickets.tsx.
// Read-only history here, but legacy categories can still appear on older
// tickets, so the fallback entries stay.
const CATEGORY_LABEL: Record<string, string> = {
  outbound_call: 'Outbound Call',
  reschedule_request: 'Reschedule Request',
  technical: 'Technical',
  other: 'Other',
  scheduling: 'Scheduling',
  billing: 'Billing',
  clinical: 'Clinical',
};

function daysAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'Today'; // <= : a just-created row can read a hair in the future (clock skew)
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

// Full Pass recording (Oct 11 2026) — Charlene: tapping a client should let
// a provider "edit all her profile, her tag, and just see her history", and
// Back should return to the client list, not the home screen. This used to
// be ticket history only, behind router.back().

const CONTACT_OPTIONS = [
  { id: 'phone', label: 'Phone' },
  { id: 'sms', label: 'Text' },
  { id: 'email', label: 'Email' },
];

const APPT_STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: '#2563eb' },
  completed: { label: 'Completed', color: '#16a34a' },
  cancelled: { label: 'Cancelled', color: '#dc2626' },
  no_show: { label: 'No-show', color: '#d97706' },
  rescheduled: { label: 'Rescheduled', color: '#6b7280' },
};

const inputClass = 'bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View className="flex-row py-1.5">
      <Text className="text-gray-400 text-sm w-32">{label}</Text>
      <Text className={`text-sm flex-1 ${value ? 'text-gray-900' : 'text-gray-300'}`}>{value || 'Not set'}</Text>
    </View>
  );
}

function DetailsCard({ client }: { client: any }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const reset = () =>
    setForm({
      firstName: client.firstName ?? '',
      lastName: client.lastName ?? '',
      phone: client.phone ?? '',
      email: client.email ?? '',
      dob: client.dob ?? '',
      preferredContact: client.preferredContact ?? 'phone',
      referralSource: client.referralSource ?? '',
    });
  useEffect(reset, [client]);

  const save = useMutation({
    mutationFn: () => patientsApi.update(client.id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', client.id] });
      queryClient.invalidateQueries({ queryKey: ['provider-roster'] });
      queryClient.invalidateQueries({ queryKey: ['provider-waitlist'] });
      setEditing(false);
      setMessage('Saved');
    },
    onError: (e: any) => setMessage(e?.response?.data?.message ?? 'Could not save'),
  });

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dobOk = !form.dob || /^\d{4}-\d{2}-\d{2}$/.test(form.dob.trim());
  const canSave = !!form.firstName?.trim() && !!form.lastName?.trim() && dobOk && !save.isPending;

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Details</Text>
        {!editing ? (
          <TouchableOpacity onPress={() => { setMessage(null); setEditing(true); }} className="flex-row items-center gap-1">
            <Ionicons name="create-outline" size={15} color="#2563eb" />
            <Text className="text-primary-600 text-sm font-medium">Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!editing ? (
        <>
          <Row label="Phone" value={client.phone} />
          <Row label="Email" value={client.email} />
          <Row label="Date of birth" value={client.dob} />
          <Row label="Prefers" value={CONTACT_OPTIONS.find((o) => o.id === client.preferredContact)?.label} />
          <Row label="Referred by" value={client.referralSource} />
          {message ? <Text className="text-green-600 text-xs mt-2">{message}</Text> : null}
        </>
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-2">
            <TextInput value={form.firstName} onChangeText={set('firstName')} placeholder="First name" className={`${inputClass} flex-1`} />
            <TextInput value={form.lastName} onChangeText={set('lastName')} placeholder="Last name" className={`${inputClass} flex-1`} />
          </View>
          <TextInput value={form.phone} onChangeText={set('phone')} placeholder="Phone" keyboardType="phone-pad" className={inputClass} />
          <TextInput value={form.email} onChangeText={set('email')} placeholder="Email" autoCapitalize="none" keyboardType="email-address" className={inputClass} />
          <TextInput value={form.dob} onChangeText={set('dob')} placeholder="Date of birth (YYYY-MM-DD)" className={`${inputClass} ${dobOk ? '' : 'border-red-400'}`} />
          <View className="flex-row gap-2 items-center">
            <Text className="text-gray-400 text-sm mr-1">Prefers</Text>
            {CONTACT_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.id}
                onPress={() => set('preferredContact')(o.id)}
                className={`px-3 py-1.5 rounded-full border ${form.preferredContact === o.id ? 'bg-primary-600 border-primary-600' : 'border-gray-200'}`}
              >
                <Text className={`text-xs font-medium ${form.preferredContact === o.id ? 'text-white' : 'text-gray-600'}`}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput value={form.referralSource} onChangeText={set('referralSource')} placeholder="Referred by" className={inputClass} />
          {message ? <Text className="text-red-500 text-xs">{message}</Text> : null}
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => save.mutate()}
              disabled={!canSave}
              className={`flex-1 rounded-xl py-2.5 items-center ${canSave ? 'bg-primary-600' : 'bg-gray-200'}`}
            >
              {save.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-sm font-semibold">Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { reset(); setMessage(null); setEditing(false); }} className="flex-1 rounded-xl py-2.5 items-center border border-gray-200">
              <Text className="text-gray-600 text-sm font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function TagCard({ client }: { client: any }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { data: tags = [] } = useQuery({
    queryKey: ['client-tags', client.practiceId],
    queryFn: () => clientTagsApi.list(client.practiceId),
    enabled: !!client.practiceId,
  });
  const setTag = useMutation({
    mutationFn: (tagId: string | null) => clientTagsApi.setPatientTag(client.id, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', client.id] });
      queryClient.invalidateQueries({ queryKey: ['fill-candidates'] });
      setSaved(true);
    },
  });
  const current = client.tag?.id ?? null;

  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Client Tag</Text>
        {setTag.isPending ? <ActivityIndicator size="small" color="#2563eb" /> : saved ? <Text className="text-green-600 text-xs">Saved</Text> : null}
      </View>
      {tags.length === 0 ? (
        <Text className="text-gray-400 text-sm">No tags set up for this practice yet.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {tags.map((t: any) => {
            const on = t.id === current;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => { setSaved(false); setTag.mutate(on ? null : t.id); }}
                className={`px-3 py-1.5 rounded-full border ${on ? 'bg-primary-600 border-primary-600' : 'border-gray-200'}`}
              >
                <Text className={`text-xs font-medium ${on ? 'text-white' : 'text-gray-600'}`}>{t.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

function AppointmentsCard({ client }: { client: any }) {
  const appts: any[] = client.recentAppointments ?? [];
  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Appointments</Text>
      {appts.length === 0 ? (
        <Text className="text-gray-400 text-sm">No appointments yet.</Text>
      ) : (
        appts.map((a) => {
          const d = new Date(a.startAt);
          const st = APPT_STATUS[a.status] ?? { label: a.status, color: '#6b7280' };
          return (
            <TouchableOpacity
              key={a.id}
              onPress={() =>
                router.push({
                  pathname: '/(provider)/appointments/[id]',
                  params: { id: a.id, providerId: a.providerId, returnTo: `/(provider)/clients/${client.id}` },
                })
              }
              className="flex-row items-center gap-3 py-2.5 border-t border-gray-50"
            >
              <View className="w-14 items-center">
                <Text className="text-gray-400 text-[11px] uppercase">{d.toLocaleDateString('en-US', { month: 'short' })}</Text>
                <Text className="text-gray-900 text-lg font-bold leading-6">{d.getDate()}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 text-sm font-medium">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}, {d.getFullYear()} · {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">{[a.type, a.patient].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text className="text-xs font-medium" style={{ color: st.color }}>{st.label}</Text>
              <Ionicons name="chevron-forward" size={14} color="#d1d5db" />
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

export default function ProviderClientDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const { data: client, isLoading: clientLoading, isError } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id),
    enabled: !!id,
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ['tickets', 'patient', id],
    queryFn: () => ticketsApi.list(undefined, id),
    enabled: !!id,
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.replace('/(provider)/clients')} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <HomeButton href="/(provider)" />
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">{client?.name ?? name ?? 'Client'}</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {client ? [client.practiceName, client.tag?.name].filter(Boolean).join(' · ') : ' '}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
        {clientLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : isError || !client ? (
          <Text className="text-gray-400 text-sm py-6">This client's profile couldn't be loaded.</Text>
        ) : (
          <>
            <DetailsCard client={client} />
            <TagCard client={client} />
            <AppointmentsCard client={client} />
          </>
        )}

        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2 mb-2">Requests &amp; interaction history</Text>
        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : data.length === 0 ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center">
            <Ionicons name="chatbox-ellipses-outline" size={40} color="#d1d5db" />
            <Text className="text-gray-700 font-semibold mt-3">No history yet</Text>
            <Text className="text-gray-400 text-sm mt-1 text-center">
              No tickets have been filed for this client.
            </Text>
          </View>
        ) : (
          data.map((t: any) => {
            const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.open;
            return (
              <View
                key={t.id}
                className="bg-white rounded-2xl border border-gray-100 mb-3 px-4 py-3.5"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="text-gray-300 text-[10px] font-semibold tracking-wide mb-0.5">#T-{t.ticketNumber}</Text>
                    <Text className="text-gray-900 font-semibold text-sm">{t.subject}</Text>
                  </View>
                  <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: cfg.bg }}>
                    <Text className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</Text>
                  </View>
                </View>
                <Text className="text-gray-500 text-sm mt-2 leading-5">{t.description}</Text>
                {t.resolutionNotes ? (
                  <View className="mt-2.5 pt-2.5 border-t border-gray-50">
                    <Text className="text-gray-400 text-xs font-medium mb-0.5">Resolution</Text>
                    <Text className="text-gray-600 text-sm leading-5">{t.resolutionNotes}</Text>
                  </View>
                ) : null}
                <View className="flex-row items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[t.priority] }} />
                  <Text className="text-gray-400 text-xs">
                    <Text className="capitalize">{t.priority}</Text> · {CATEGORY_LABEL[t.category] ?? t.category}
                  </Text>
                  <Text className="text-gray-300 text-xs ml-auto">
                    {t.createdByUser ? `${t.createdByUser.firstName} · ` : ''}{daysAgo(t.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
