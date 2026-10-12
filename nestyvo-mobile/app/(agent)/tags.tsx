import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientTagsApi, practicesApi } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { hasRole, OFFICE_STAFF, ADMIN_AND_AGENT } from '../../lib/role-groups';
import { HomeButton } from '../../components/HomeButton';

export default function TagsScreen() {
  const { role, practiceId: myPracticeId } = useAuthStore();
  const deepLink = useLocalSearchParams<{ practiceId?: string }>();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');

  // Charlene, Oct 5 2026 — "Admin AND Agent users must be able to create
  // new custom client tag names." Widened from practice_manager-only.
  // Admin/Agent are cross-practice (no fixed practiceId of their own —
  // same reason providers.service.ts's targetPracticeId branches exist),
  // so they need an explicit practice picker here; practice_manager just
  // always works in their own.
  const isCrossPractice = hasRole(role, ADMIN_AND_AGENT);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(deepLink.practiceId ?? null);
  const effectivePracticeId = isCrossPractice ? selectedPracticeId : myPracticeId ?? null;

  const { data: practices = [] } = useQuery({
    queryKey: ['practices'],
    queryFn: practicesApi.list,
    enabled: isCrossPractice,
  });

  // Deep-linked from a specific client's profile (patients/[id].tsx) —
  // preselect their practice so a cross-practice user doesn't have to
  // hunt for it.
  useEffect(() => {
    if (deepLink.practiceId && !selectedPracticeId) setSelectedPracticeId(deepLink.practiceId);
  }, [deepLink.practiceId]);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['client-tags', effectivePracticeId],
    queryFn: () => clientTagsApi.list(effectivePracticeId!),
    enabled: !!effectivePracticeId,
  });

  const createTag = useMutation({
    mutationFn: () => clientTagsApi.create(name.trim(), parseInt(minutes, 10), effectivePracticeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-tags', effectivePracticeId] });
      setName('');
      setMinutes('');
    },
  });

  // Charlene, Oct 11 Full Pass (P2 05:00) — "I just can't edit the time
  // length." Inline edit of a tag's name and Smart Fill minutes.
  const [editing, setEditing] = useState<{ id: string; name: string; minutes: string } | null>(null);
  const updateTag = useMutation({
    mutationFn: (e: { id: string; name: string; minutes: string }) =>
      clientTagsApi.update(e.id, { name: e.name.trim(), blockMinutes: parseInt(e.minutes, 10), practiceId: effectivePracticeId! }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-tags'] });
      setEditing(null);
    },
  });
  const canSaveEdit = !!editing && editing.name.trim().length > 0 && parseInt(editing.minutes, 10) > 0;

  const removeTag = useMutation({
    mutationFn: (id: string) => clientTagsApi.remove(id, effectivePracticeId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-tags', effectivePracticeId] }),
  });

  if (!hasRole(role, OFFICE_STAFF)) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-6">
        <Text className="text-gray-400 text-sm">You don't have access to this page.</Text>
      </SafeAreaView>
    );
  }

  const canCreate = !!effectivePracticeId && name.trim().length > 0 && parseInt(minutes, 10) > 0;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <HomeButton href="/(agent)" />
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Client Tags</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            Classify clients to help Smart Fill match them to the right slot — doesn't set appointment duration.
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
        {isCrossPractice && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerClassName="gap-2 pr-2">
            {practices.map((p: any) => {
              const active = p.id === effectivePracticeId;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedPracticeId(p.id)}
                  className={`px-4 py-2 rounded-full border ${active ? 'bg-primary-600 border-primary-600' : 'bg-white border-gray-200'}`}
                >
                  <Text className={`text-sm font-medium ${active ? 'text-white' : 'text-gray-700'}`}>{p.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!effectivePracticeId ? (
          <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center">
            <Ionicons name="business-outline" size={32} color="#d1d5db" />
            <Text className="text-gray-400 text-sm mt-2 text-center">Pick a business above to see and manage its tags.</Text>
          </View>
        ) : (
          <>
            <View className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
              <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">New Tag</Text>
              <View className="flex-row gap-2">
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. 1 Hour Client"
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                />
                <TextInput
                  value={minutes}
                  onChangeText={setMinutes}
                  placeholder="Min"
                  keyboardType="number-pad"
                  className="w-20 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                />
              </View>
              <Text className="text-xs text-gray-400 mt-2">
                Minutes feeds Smart Fill's matching only — it never sets or limits an actual appointment's duration.
              </Text>
              <TouchableOpacity
                onPress={() => createTag.mutate()}
                disabled={!canCreate || createTag.isPending}
                className={`mt-3 rounded-xl py-2.5 items-center ${canCreate ? 'bg-primary-600' : 'bg-gray-200'}`}
              >
                {createTag.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-sm">Add Tag</Text>
                )}
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <View className="items-center py-12">
                <ActivityIndicator color="#2563eb" />
              </View>
            ) : tags.length === 0 ? (
              <View className="bg-white rounded-2xl border border-gray-100 p-8 items-center">
                <Ionicons name="pricetags-outline" size={36} color="#e5e7eb" />
                <Text className="text-gray-400 text-sm mt-3 text-center">No tags yet — add one above.</Text>
              </View>
            ) : (
              <View className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {tags.map((t: any, i: number) => (
                  <View
                    key={t.id}
                    className={`px-4 py-3.5 flex-row items-center justify-between ${i < tags.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    {editing?.id === t.id ? (
                      <View className="flex-1 gap-2">
                        <View className="flex-row gap-2">
                          <TextInput
                            value={editing?.name}
                            onChangeText={(v) => setEditing((e) => e && { ...e, name: v })}
                            placeholder="Tag name"
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                          />
                          <TextInput
                            value={editing?.minutes}
                            onChangeText={(v) => setEditing((e) => e && { ...e, minutes: v })}
                            placeholder="Min"
                            keyboardType="number-pad"
                            className="w-20 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                          />
                        </View>
                        {updateTag.isError ? (
                          <Text className="text-red-600 text-xs">Couldn't save — please try again.</Text>
                        ) : null}
                        <View className="flex-row gap-2">
                          <TouchableOpacity
                            onPress={() => editing && updateTag.mutate(editing)}
                            disabled={!canSaveEdit || updateTag.isPending}
                            className={`rounded-xl px-4 py-2 ${canSaveEdit ? 'bg-primary-600' : 'bg-gray-200'}`}
                          >
                            {updateTag.isPending ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-sm font-semibold">Save</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { setEditing(null); updateTag.reset(); }} className="rounded-xl px-4 py-2 border border-gray-200">
                            <Text className="text-gray-600 text-sm">Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <>
                        <View className="flex-1">
                          <Text className="text-gray-900 text-sm font-medium">{t.name}</Text>
                          <Text className="text-gray-400 text-xs mt-0.5">Smart Fill: {t.blockMinutes} min</Text>
                        </View>
                        <View className="flex-row items-center gap-4">
                          <TouchableOpacity
                            onPress={() => { updateTag.reset(); setEditing({ id: t.id, name: t.name, minutes: String(t.blockMinutes) }); }}
                            accessibilityLabel={`Edit ${t.name}`}
                          >
                            <Ionicons name="create-outline" size={18} color="#2563eb" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeTag.mutate(t.id)} accessibilityLabel={`Delete ${t.name}`}>
                            <Ionicons name="trash-outline" size={18} color="#dc2626" />
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
