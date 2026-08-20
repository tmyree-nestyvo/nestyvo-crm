import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { remindersApi } from '../../lib/api';

export default function CancelScreen() {
  const { reminderId } = useLocalSearchParams<{ reminderId: string }>();
  const [cancelled, setCancelled] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reminder', reminderId],
    queryFn: () => remindersApi.get(reminderId),
    enabled: !!reminderId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => remindersApi.cancel(reminderId),
    onSuccess: () => setCancelled(true),
  });

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator color="#2563eb" />
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <Message
        icon="alert-circle-outline"
        color="#dc2626"
        title="Link not found"
        body="This cancellation link is invalid. Please call the office directly."
      />
    );
  }

  if (cancelled) {
    return (
      <Message
        icon="checkmark-circle-outline"
        color="#16a34a"
        title="Appointment cancelled"
        body="You're all set. We'll reach out if you'd like to rebook."
      />
    );
  }

  if (!data.canCancel) {
    return (
      <Message
        icon="time-outline"
        color="#6b7280"
        title="This link has expired"
        body="Please call the office to cancel or reschedule your appointment."
      />
    );
  }

  const when = new Date(data.startAt).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <SafeAreaView className="flex-1 bg-surface items-center justify-center px-6">
      <View className="bg-white rounded-2xl border border-gray-100 p-6 w-full max-w-sm">
        <Text className="text-lg font-bold text-gray-900 mb-1">Your appointment</Text>
        <Text className="text-gray-500 text-sm mb-4">
          with {data.provider} on {when}
        </Text>
        <TouchableOpacity
          onPress={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
          className="bg-red-50 border border-red-100 rounded-xl py-3 items-center"
        >
          {cancelMutation.isPending ? (
            <ActivityIndicator color="#dc2626" />
          ) : (
            <Text className="text-red-600 font-semibold">Cancel my appointment</Text>
          )}
        </TouchableOpacity>
        {cancelMutation.isError && (
          <Text className="text-red-500 text-xs mt-3 text-center">
            This link is no longer valid. Please call the office.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

function Message({
  icon,
  color,
  title,
  body,
}: {
  icon: any;
  color: string;
  title: string;
  body: string;
}) {
  return (
    <SafeAreaView className="flex-1 bg-surface items-center justify-center px-6">
      <Ionicons name={icon} size={40} color={color} />
      <Text className="text-lg font-bold text-gray-900 mt-4">{title}</Text>
      <Text className="text-gray-500 text-sm text-center mt-1">{body}</Text>
    </SafeAreaView>
  );
}
