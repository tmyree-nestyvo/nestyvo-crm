import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Platform } from 'react-native';
import { Alert } from '../../lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { practicesApi, providersApi, patientsApi } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { hasRole, ADMIN_AND_AGENT } from '../../lib/role-groups';
import { HomeButton } from '../../components/HomeButton';

// Charlene, Oct 6 2026 (Tax Refund 1040 pilot, item 8) — "Admin also
// needs a clear place to import an existing client directory into a
// provider/business during onboarding... we should not have to manually
// recreate Gloria's existing client base one client at a time." The only
// prior capability was scripts/import-*-clients.ts, a one-off CLI script
// per practice, unreachable from the app. CSV only (not real .xlsx — no
// spreadsheet-parsing library is installed; flagged, not silently
// claimed). See patientsApi.import + patients.service.ts importClients
// for the actual column-matching and tag-surfacing logic.

type Option = { id: string; label: string };

export default function ImportClientsScreen() {
  const { role, practiceId: myPracticeId } = useAuthStore();
  const isCrossPractice = hasRole(role, ADMIN_AND_AGENT);
  const params = useLocalSearchParams<{ presetPracticeId?: string; presetProviderId?: string; presetProviderName?: string }>();

  const [practice, setPractice] = useState<Option | null>(null);
  const [provider, setProvider] = useState<Option | null>(
    params.presetProviderId ? { id: params.presetProviderId, label: params.presetProviderName ?? '' } : null,
  );
  const [practicePickerOpen, setPracticePickerOpen] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    skippedNoName?: number;
    skippedDuplicate?: number;
    unmatchedTags: { row: string; tag: string }[];
  } | null>(null);

  const effectivePracticeId = isCrossPractice ? (practice?.id ?? params.presetPracticeId) : myPracticeId ?? undefined;

  const { data: practices = [] } = useQuery({
    queryKey: ['practices'],
    queryFn: practicesApi.list,
    enabled: isCrossPractice,
  });
  const { data: providers = [] } = useQuery({
    queryKey: ['providers', effectivePracticeId],
    queryFn: () => providersApi.list(effectivePracticeId),
    enabled: !!effectivePracticeId,
  });

  const pickFile = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Not available', 'Client import is only available in the web app right now.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => setCsvText(String(reader.result ?? ''));
      reader.readAsText(file);
    };
    input.click();
  };

  const importMutation = useMutation({
    mutationFn: () => patientsApi.import({ practiceId: effectivePracticeId!, assignedProviderId: provider?.id, csvText: csvText! }),
    onSuccess: (data) => setResult(data),
    onError: (err: any) => Alert.alert("Couldn't import", err?.response?.data?.message || 'Please try again.'),
  });

  const canImport = !!effectivePracticeId && !!csvText && !importMutation.isPending;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-3 pb-4 flex-row items-center gap-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-900 flex-1">Import Clients</Text>
        <HomeButton href="/(agent)" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 py-5 pb-10">
        {result ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-6 items-center">
            <Ionicons name="checkmark-circle" size={40} color="#16a34a" />
            <Text className="text-gray-900 font-bold text-base mt-3">Import complete</Text>
            <Text className="text-gray-500 text-sm mt-1 text-center">
              {result.imported} client{result.imported !== 1 ? 's' : ''} imported
            </Text>
            {/* Oct 9 2026 — this used to blame every skip on "already in
                this practice" regardless of actual cause, which is exactly
                what made a real header-matching failure (every row skipped
                for having no detectable Name column) look identical to a
                real duplicate-import. Shown separately now. */}
            {!!result.skippedDuplicate && (
              <Text className="text-gray-400 text-xs mt-1 text-center">
                {result.skippedDuplicate} skipped — already in this practice
              </Text>
            )}
            {!!result.skippedNoName && (
              <Text className="text-amber-600 text-xs mt-1 text-center">
                {result.skippedNoName} skipped — no name found for that row (check the Name/First Name column)
              </Text>
            )}
            {result.unmatchedTags.length > 0 && (
              <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 w-full">
                <Text className="text-amber-800 text-xs font-semibold mb-1">
                  {result.unmatchedTags.length} client{result.unmatchedTags.length !== 1 ? 's' : ''} imported without a tag
                </Text>
                <Text className="text-amber-700 text-xs mb-2">
                  These tag names didn't match any existing Client Tag for this provider — create or rename a tag to match, then edit these clients.
                </Text>
                {result.unmatchedTags.map((u, i) => (
                  <Text key={i} className="text-amber-700 text-xs">• {u.row} — "{u.tag}"</Text>
                ))}
              </View>
            )}
            <TouchableOpacity
              onPress={() => { setResult(null); setCsvText(null); setFileName(null); }}
              className="mt-5 bg-primary-600 rounded-xl px-6 py-3"
            >
              <Text className="text-white font-semibold text-sm">Import Another File</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {isCrossPractice && (
              <>
                <Text className="text-gray-500 text-xs font-medium mb-2">Business / Practice</Text>
                <TouchableOpacity
                  onPress={() => setPracticePickerOpen(true)}
                  className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-4"
                >
                  <Text className={practice ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>{practice ? practice.label : 'Select a practice'}</Text>
                  <Ionicons name="chevron-down" size={16} color="#9ca3af" />
                </TouchableOpacity>
              </>
            )}

            <Text className="text-gray-500 text-xs font-medium mb-2">Provider (optional)</Text>
            <TouchableOpacity
              onPress={() => setProviderPickerOpen(true)}
              disabled={!effectivePracticeId}
              className="flex-row items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 mb-1"
            >
              <Text className={provider ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>
                {provider ? provider.label : effectivePracticeId ? 'Assign all imported clients to one provider' : 'Pick a practice first'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>
            <Text className="text-gray-400 text-xs mb-5">Leave unset to import clients without a provider assigned.</Text>

            <Text className="text-gray-500 text-xs font-medium mb-2">Client Directory (CSV)</Text>
            <Text className="text-gray-400 text-xs mb-3">
              Columns: Name (or First/Last Name), Phone, Email, Tag. A Tag value is matched against this practice's existing Client Tags.
            </Text>
            <TouchableOpacity
              onPress={pickFile}
              className="flex-row items-center justify-center gap-2 bg-gray-50 border border-dashed border-gray-300 rounded-xl px-3 py-6 mb-1"
            >
              <Ionicons name="document-attach-outline" size={20} color="#6b7280" />
              <Text className="text-gray-600 text-sm font-medium">{fileName ?? 'Choose CSV file…'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => importMutation.mutate()}
              disabled={!canImport}
              className={`rounded-xl py-3.5 items-center mt-5 ${canImport ? 'bg-primary-600' : 'bg-gray-200'}`}
            >
              {importMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-sm">Import Clients</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={practicePickerOpen} transparent animationType="slide" onRequestClose={() => setPracticePickerOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[70%]">
            <Text className="text-base font-bold text-gray-900 mb-4">Select Practice</Text>
            <ScrollView>
              {practices.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setPractice({ id: p.id, label: p.name }); setProvider(null); setPracticePickerOpen(false); }}
                  className="px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                >
                  <Text className="text-gray-800 font-medium text-sm">{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setPracticePickerOpen(false)} className="mt-1 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={providerPickerOpen} transparent animationType="slide" onRequestClose={() => setProviderPickerOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10 max-h-[70%]">
            <Text className="text-base font-bold text-gray-900 mb-4">Select Provider</Text>
            <ScrollView>
              {providers.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setProvider({ id: p.id, label: `${p.firstName} ${p.lastName}` }); setProviderPickerOpen(false); }}
                  className="px-4 py-3.5 rounded-xl border border-gray-100 bg-gray-50 mb-2"
                >
                  <Text className="text-gray-800 font-medium text-sm">{p.firstName} {p.lastName}</Text>
                </TouchableOpacity>
              ))}
              {providers.length === 0 && <Text className="text-gray-400 text-sm text-center py-4">No providers for this practice yet.</Text>}
            </ScrollView>
            {provider && (
              <TouchableOpacity onPress={() => { setProvider(null); setProviderPickerOpen(false); }} className="mt-2 items-center py-2">
                <Text className="text-red-500 text-sm">Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setProviderPickerOpen(false)} className="mt-1 items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
