import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { practicesApi, providersApi, usersApi, UpsertPracticeInput } from '../../lib/api';
import { HomeButton } from '../../components/HomeButton';

// Admin-only partner onboarding (Charlene, Sep 24 2026): "a place in the
// admin login view to onboard a new partner — add all of their business
// info and create them a partner login." This screen covers the full loop:
// create the business (Practice), edit it later (incl. the subscription
// placeholder), and add one or more providers + logins under it.

type SubStatus = 'trial' | 'active' | 'past_due' | 'canceled';

const STATUS_CONFIG: Record<SubStatus, { label: string; color: string; bg: string }> = {
  trial: { label: 'Trial', color: '#6b7280', bg: '#f3f4f6' },
  active: { label: 'Active', color: '#16a34a', bg: '#f0fdf4' },
  past_due: { label: 'Past Due', color: '#d97706', bg: '#fffbeb' },
  canceled: { label: 'Canceled', color: '#dc2626', bg: '#fef2f2' },
};

function usePractices() {
  return useQuery({ queryKey: ['practices-admin'], queryFn: () => practicesApi.listAdmin() });
}

function usePracticeProviders(practiceId: string | null) {
  return useQuery({
    queryKey: ['practice-providers', practiceId],
    queryFn: () => providersApi.list(practiceId!),
    enabled: !!practiceId,
  });
}

function FormField({
  label, value, onChangeText, placeholder, keyboardType, multiline,
}: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad'; multiline?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        multiline={multiline}
        className="bg-white border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900"
      />
    </View>
  );
}

function StatusPicker({ value, onChange }: { value: SubStatus; onChange: (v: SubStatus) => void }) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Subscription status</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {(Object.keys(STATUS_CONFIG) as SubStatus[]).map((s) => {
          const active = value === s;
          const cfg = STATUS_CONFIG[s];
          return (
            <TouchableOpacity
              key={s}
              onPress={() => onChange(s)}
              className="px-3.5 py-2 rounded-full border"
              style={{ backgroundColor: active ? cfg.color : '#fff', borderColor: active ? cfg.color : '#e5e7eb' }}
            >
              <Text className="text-sm font-medium" style={{ color: active ? '#fff' : '#374151' }}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function PracticeForm({
  initial, onSubmit, submitting, submitLabel,
}: {
  initial?: Partial<UpsertPracticeInput>; onSubmit: (v: UpsertPracticeInput) => void; submitting: boolean; submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [contactName, setContactName] = useState(initial?.contactName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [status, setStatus] = useState<SubStatus>((initial?.subscriptionStatus as SubStatus) ?? 'trial');
  const [expiresAt, setExpiresAt] = useState(initial?.subscriptionExpiresAt ?? '');

  return (
    <View>
      <FormField label="Business name" value={name} onChangeText={setName} placeholder="e.g. Ortiz & Associates" />
      <FormField label="Primary contact" value={contactName} onChangeText={setContactName} placeholder="e.g. Gloria Ortiz" />
      <FormField label="Phone" value={phone} onChangeText={setPhone} placeholder="(555) 555-0100" keyboardType="phone-pad" />
      <FormField label="Email" value={email} onChangeText={setEmail} placeholder="office@practice.com" keyboardType="email-address" />
      <FormField label="Address" value={address} onChangeText={setAddress} placeholder="Street, city, state" />
      <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Anything else worth knowing" multiline />
      <StatusPicker value={status} onChange={setStatus} />
      <FormField
        label="Subscription expires"
        value={expiresAt}
        onChangeText={setExpiresAt}
        placeholder="YYYY-MM-DD — leave blank if unknown"
      />
      <TouchableOpacity
        onPress={() =>
          onSubmit({
            name: name.trim(),
            contactName: contactName.trim() || undefined,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            address: address.trim() || undefined,
            notes: notes.trim() || undefined,
            subscriptionStatus: status,
            subscriptionExpiresAt: expiresAt.trim() || undefined,
          })
        }
        disabled={submitting || !name.trim()}
        className={`rounded-2xl py-3.5 items-center mt-2 ${!name.trim() ? 'bg-gray-300' : 'bg-primary-600'}`}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">{submitLabel}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function AddProviderForm({ practiceId, onDone }: { practiceId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [credentials, setCredentials] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loginEmail, setLoginEmail] = useState('');

  const create = useMutation({
    mutationFn: () =>
      providersApi.create({
        practiceId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        credentials: credentials.trim() || undefined,
        specialty: specialty.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        loginEmail: loginEmail.trim() || undefined,
      }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['practice-providers', practiceId] });
      if (result?.tempPassword) {
        // Shown once — see ProviderRow's identical note on why this is the
        // real hand-off mechanism until there's real email delivery.
        Alert.alert(
          'Provider added',
          `${firstName} ${lastName} can sign in with:\n\nEmail: ${loginEmail.trim()}\nTemporary password: ${result.tempPassword}\n\nThey'll be asked to set their own password on first sign-in.`,
        );
      } else {
        Alert.alert(
          'Provider added',
          loginEmail.trim()
            ? `${firstName} ${lastName} can now sign in with ${loginEmail.trim()}.`
            : `${firstName} ${lastName} was added. No login was created — you can add one later.`,
        );
      }
      onDone();
    },
    onError: (err: any) => Alert.alert('Could not add provider', err?.response?.data?.message || 'Please try again.'),
  });

  const canSubmit = firstName.trim() && lastName.trim();

  return (
    <View className="bg-gray-50 rounded-2xl border border-gray-100 p-4 mt-3">
      <Text className="text-sm font-semibold text-gray-900 mb-3">New Provider</Text>
      <View className="flex-row gap-2">
        <View className="flex-1"><FormField label="First name" value={firstName} onChangeText={setFirstName} /></View>
        <View className="flex-1"><FormField label="Last name" value={lastName} onChangeText={setLastName} /></View>
      </View>
      <FormField label="Credentials" value={credentials} onChangeText={setCredentials} placeholder="e.g. LCSW, PhD" />
      <FormField label="Specialty" value={specialty} onChangeText={setSpecialty} placeholder="e.g. Tax preparation" />
      <FormField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <FormField label="Contact email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <FormField
        label="Login email"
        value={loginEmail}
        onChangeText={setLoginEmail}
        placeholder="Leave blank to add a login later"
        keyboardType="email-address"
      />
      <Text className="text-xs text-gray-400 mb-3 -mt-2">
        If set, they can sign in immediately with this email — same dev sign-in every other account uses.
      </Text>
      <TouchableOpacity
        onPress={() => create.mutate()}
        disabled={!canSubmit || create.isPending}
        className={`rounded-xl py-3 items-center ${!canSubmit ? 'bg-gray-300' : 'bg-gray-900'}`}
      >
        {create.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Add Provider</Text>}
      </TouchableOpacity>
    </View>
  );
}

// Charlene (Sep 30 2026) onboarded a partner leaving the login email blank,
// then found no way back in to add it — providers could be created but never
// edited. Each row now expands into an edit form, and shows at a glance
// whether a login exists at all (the thing that actually blocks a partner
// from signing in).
function ProviderRow({ provider, practiceId }: { provider: any; practiceId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(provider.firstName ?? '');
  const [lastName, setLastName] = useState(provider.lastName ?? '');
  const [credentials, setCredentials] = useState(provider.credentials ?? '');
  const [specialty, setSpecialty] = useState(provider.specialty ?? '');
  const [phone, setPhone] = useState(provider.phone ?? '');
  const [email, setEmail] = useState(provider.email ?? '');
  const [loginEmail, setLoginEmail] = useState('');

  const hasLogin = !!provider.userId;

  const save = useMutation({
    mutationFn: () =>
      providersApi.update(provider.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        credentials: credentials.trim() || undefined,
        specialty: specialty.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        loginEmail: !hasLogin && loginEmail.trim() ? loginEmail.trim() : undefined,
      }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['practice-providers', practiceId] });
      if (result?.tempPassword) {
        // There's no real email delivery yet — this is the actual hand-off
        // mechanism: shown once, here, for the admin to relay directly
        // (same "she relays it herself" pattern as everything else in
        // partner onboarding). It's never retrievable again after this.
        Alert.alert(
          'Login created',
          `${firstName} ${lastName} can sign in with:\n\nEmail: ${loginEmail.trim()}\nTemporary password: ${result.tempPassword}\n\nThey'll be asked to set their own password on first sign-in.`,
        );
      } else {
        Alert.alert('Saved', 'Provider details updated.');
      }
      setLoginEmail('');
      setEditing(false);
    },
    onError: (err: any) => Alert.alert('Could not save provider', err?.response?.data?.message || 'Please try again.'),
  });

  const resetPassword = useMutation({
    mutationFn: () => providersApi.resetPassword(provider.id),
    onSuccess: (result) => {
      Alert.alert(
        'Password reset',
        `${provider.firstName} ${provider.lastName}'s new temporary password:\n\n${result.tempPassword}\n\nThey'll be asked to set their own on next sign-in. Their old password no longer works.`,
      );
    },
    onError: (err: any) => Alert.alert('Could not reset password', err?.response?.data?.message || 'Please try again.'),
  });

  return (
    <View className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 mb-2">
      <TouchableOpacity onPress={() => setEditing((v) => !v)} className="flex-row items-center gap-3">
        <View className="w-9 h-9 bg-primary-100 rounded-full items-center justify-center">
          <Text className="text-primary-700 font-bold text-xs">{provider.firstName?.[0]}{provider.lastName?.[0]}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-gray-900 font-semibold text-sm">
            {provider.firstName} {provider.lastName}{provider.credentials ? `, ${provider.credentials}` : ''}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Ionicons
              name={hasLogin ? 'key' : 'key-outline'}
              size={11}
              color={hasLogin ? '#16a34a' : '#d97706'}
            />
            <Text className={`text-xs ${hasLogin ? 'text-green-700' : 'text-amber-700'}`}>
              {hasLogin ? 'Login active' : 'No login yet'}
            </Text>
            {provider.specialty ? <Text className="text-gray-400 text-xs">· {provider.specialty}</Text> : null}
          </View>
        </View>
        <Ionicons name={editing ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
      </TouchableOpacity>

      {editing && (
        <View className="mt-3 pt-3 border-t border-gray-50">
          <View className="flex-row gap-2">
            <View className="flex-1"><FormField label="First name" value={firstName} onChangeText={setFirstName} /></View>
            <View className="flex-1"><FormField label="Last name" value={lastName} onChangeText={setLastName} /></View>
          </View>
          <FormField label="Credentials" value={credentials} onChangeText={setCredentials} placeholder="e.g. LMFT" />
          <FormField label="Specialty" value={specialty} onChangeText={setSpecialty} />
          <FormField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <FormField label="Contact email" value={email} onChangeText={setEmail} keyboardType="email-address" />

          {hasLogin ? (
            <View className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-3 flex-row items-center justify-between gap-2">
              <Text className="text-gray-600 text-xs flex-1">
                Has an active sign-in. Resetting issues a new temporary password and invalidates the old one immediately.
              </Text>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    `Reset ${provider.firstName}'s password?`,
                    'Their current password stops working right away.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reset', style: 'destructive', onPress: () => resetPassword.mutate() },
                    ],
                  )
                }
                disabled={resetPassword.isPending}
                className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5"
              >
                {resetPassword.isPending ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text className="text-gray-700 text-xs font-semibold">Reset</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <FormField
                label="Login email"
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="Creates their sign-in"
                keyboardType="email-address"
              />
              <Text className="text-xs text-gray-400 mb-3 -mt-2">
                Set this to let them sign in and manage their own schedule.
              </Text>
            </>
          )}

          <TouchableOpacity
            onPress={() => save.mutate()}
            disabled={save.isPending || !firstName.trim() || !lastName.trim()}
            className={`rounded-xl py-3 items-center ${!firstName.trim() || !lastName.trim() ? 'bg-gray-300' : 'bg-primary-600'}`}
          >
            {save.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Save Provider</Text>}
          </TouchableOpacity>

          {/* Where the old standalone gear icon's screen now lives — reached
              from the provider it belongs to, already preselected, instead of
              being a separate top-level destination with its own two pickers. */}
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/(agent)/provider-settings',
                params: { practiceId, providerId: provider.id },
              })
            }
            className="flex-row items-center justify-center gap-1.5 mt-2 py-3 rounded-xl border border-gray-200"
          >
            <Ionicons name="time-outline" size={14} color="#374151" />
            <Text className="text-gray-700 text-sm font-medium">Hours, blocks &amp; calendars</Text>
            <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function PracticeDetail({ practiceId, onBack }: { practiceId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: practice, isLoading } = useQuery({ queryKey: ['practice', practiceId], queryFn: () => practicesApi.get(practiceId) });
  const { data: providers = [], isLoading: loadingProviders } = usePracticeProviders(practiceId);
  const [addingProvider, setAddingProvider] = useState(false);

  const update = useMutation({
    mutationFn: (input: Partial<UpsertPracticeInput>) => practicesApi.update(practiceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice', practiceId] });
      queryClient.invalidateQueries({ queryKey: ['practices-admin'] });
      Alert.alert('Saved', 'Partner details updated.');
    },
    onError: (err: any) => Alert.alert('Could not save', err?.response?.data?.message || 'Please try again.'),
  });

  const remove = useMutation({
    mutationFn: () => practicesApi.remove(practiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practices-admin'] });
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      Alert.alert('Partner removed', `${practice?.name ?? 'The partner'} no longer appears in Nestyvo.`);
      onBack();
    },
    onError: (err: any) => Alert.alert('Could not remove partner', err?.response?.data?.message || 'Please try again.'),
  });

  function confirmRemove() {
    Alert.alert(
      `Remove ${practice?.name ?? 'this partner'}?`,
      'They disappear from every list and picker. Their history is kept, so this can be undone if it was a mistake.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
      ],
    );
  }

  if (isLoading || !practice) {
    return (
      <View className="flex-1 items-center justify-center py-20">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
      <TouchableOpacity onPress={onBack} className="flex-row items-center gap-1.5 mb-4 mt-1">
        <Ionicons name="chevron-back" size={18} color="#6b7280" />
        <Text className="text-gray-500 text-sm">All Partners</Text>
      </TouchableOpacity>

      <Text className="text-xl font-bold text-gray-900 mb-4">{practice.name}</Text>

      <PracticeForm
        initial={practice}
        onSubmit={(v) => update.mutate(v)}
        submitting={update.isPending}
        submitLabel="Save Changes"
      />

      <View className="h-px bg-gray-100 my-6" />

      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base font-semibold text-gray-900">Providers ({providers.length})</Text>
        <TouchableOpacity
          onPress={() => setAddingProvider((v) => !v)}
          className="flex-row items-center gap-1 bg-primary-50 px-3 py-1.5 rounded-full"
        >
          <Ionicons name={addingProvider ? 'close' : 'add'} size={14} color="#2563eb" />
          <Text className="text-primary-700 text-xs font-semibold">{addingProvider ? 'Cancel' : 'Add Provider'}</Text>
        </TouchableOpacity>
      </View>

      {addingProvider && (
        <AddProviderForm practiceId={practiceId} onDone={() => setAddingProvider(false)} />
      )}

      {loadingProviders ? (
        <ActivityIndicator color="#2563eb" className="mt-4" />
      ) : providers.length === 0 ? (
        <View className="bg-white rounded-2xl border border-gray-100 p-6 items-center mt-2">
          <Ionicons name="person-outline" size={28} color="#d1d5db" />
          <Text className="text-gray-400 text-sm mt-2">No providers yet</Text>
        </View>
      ) : (
        providers.map((p: any) => <ProviderRow key={p.id} provider={p} practiceId={practiceId} />)
      )}

      <View className="h-px bg-gray-100 my-6" />

      <TouchableOpacity
        onPress={confirmRemove}
        disabled={remove.isPending}
        className="flex-row items-center justify-center gap-2 border border-red-200 bg-red-50 rounded-2xl py-3"
      >
        {remove.isPending ? (
          <ActivityIndicator color="#dc2626" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={15} color="#dc2626" />
            <Text className="text-red-600 font-semibold text-sm">Remove this partner</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

export default function PartnersScreen() {
  const { data: practices = [], isLoading } = usePractices();
  const [mode, setMode] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createPractice = useMutation({
    mutationFn: (input: UpsertPracticeInput) => practicesApi.create(input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['practices-admin'] });
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      setSelectedId(created.id);
      setMode('detail');
      // Charlene (Sep 28 2026): the screen let her create a partner but gave
      // no confirmation it actually saved — she had to go check Settings'
      // partner dropdown to infer it worked. Landing on the new partner's
      // detail screen (above) already showed it existed; this alert makes
      // that explicit instead of implicit.
      Alert.alert('Partner added', `${created.name} was created. Add their providers below whenever you're ready.`);
    },
    onError: (err: any) => Alert.alert('Could not create partner', err?.response?.data?.message || 'Please try again.'),
  });

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900 flex-1">Partners</Text>
        {mode === 'list' && (
          <TouchableOpacity
            onPress={() => setMode('create')}
            className="flex-row items-center gap-1.5 bg-primary-600 px-3.5 py-2 rounded-full"
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text className="text-white text-xs font-semibold">New Partner</Text>
          </TouchableOpacity>
        )}
        <HomeButton href="/(agent)" />
      </View>

      {mode === 'detail' && selectedId ? (
        <PracticeDetail practiceId={selectedId} onBack={() => setMode('list')} />
      ) : mode === 'create' ? (
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
          <TouchableOpacity onPress={() => setMode('list')} className="flex-row items-center gap-1.5 mb-4 mt-1">
            <Ionicons name="chevron-back" size={18} color="#6b7280" />
            <Text className="text-gray-500 text-sm">All Partners</Text>
          </TouchableOpacity>
          <Text className="text-xs text-gray-400 mb-4">
            Add a new partner business. Once created, you'll add their providers and logins on the next screen.
          </Text>
          <PracticeForm onSubmit={(v) => createPractice.mutate(v)} submitting={createPractice.isPending} submitLabel="Create Partner" />
        </ScrollView>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10">
          {isLoading ? (
            <ActivityIndicator color="#2563eb" className="mt-8" />
          ) : practices.length === 0 ? (
            <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center mt-4">
              <Ionicons name="briefcase-outline" size={36} color="#d1d5db" />
              <Text className="text-gray-400 text-sm mt-3">No partners yet</Text>
            </View>
          ) : (
            practices.map((p: any) => {
              const cfg = STATUS_CONFIG[(p.subscriptionStatus as SubStatus) ?? 'trial'];
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setSelectedId(p.id); setMode('detail'); }}
                  className="bg-white rounded-2xl border border-gray-100 p-4 mb-3"
                >
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-gray-900 font-semibold text-base flex-1" numberOfLines={1}>{p.name}</Text>
                    <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: cfg.bg }}>
                      <Text className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</Text>
                    </View>
                  </View>
                  {p.contactName ? <Text className="text-gray-500 text-xs">{p.contactName}</Text> : null}
                  <View className="flex-row items-center gap-3 mt-1.5">
                    {p.phone ? (
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="call-outline" size={12} color="#9ca3af" />
                        <Text className="text-gray-400 text-xs">{p.phone}</Text>
                      </View>
                    ) : null}
                    {p.subscriptionExpiresAt ? (
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                        <Text className="text-gray-400 text-xs">Expires {p.subscriptionExpiresAt}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
