import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientTagsApi } from '../../lib/api';
import { useAuthStore } from '../../lib/store';

export default function TagsScreen() {
  const { role } = useAuthStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['client-tags'],
    queryFn: clientTagsApi.list,
  });

  const createTag = useMutation({
    mutationFn: () => clientTagsApi.create(name.trim(), parseInt(minutes, 10)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-tags'] });
      setName('');
      setMinutes('');
    },
  });

  const removeTag = useMutation({
    mutationFn: (id: string) => clientTagsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-tags'] }),
  });

  if (role !== 'administrator' && role !== 'practice_manager') {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-6">
        <Text className="text-gray-400 text-sm">You don't have access to this page.</Text>
      </SafeAreaView>
    );
  }

  const canCreate = name.trim().length > 0 && parseInt(minutes, 10) > 0;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">Client Tags</Text>
          <Text className="text-xs text-gray-400 mt-0.5">Block-size classifications used to size and match slots</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8">
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
                <View>
                  <Text className="text-gray-900 text-sm font-medium">{t.name}</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">{t.blockMinutes} min</Text>
                </View>
                <TouchableOpacity onPress={() => removeTag.mutate(t.id)}>
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
