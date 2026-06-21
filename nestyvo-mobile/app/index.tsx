import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../lib/store';
import { getStoredToken } from '../lib/auth';

export default function RootIndex() {
  const { token, role, setAuth } = useAuthStore();

  useEffect(() => {
    // Try to restore token from secure storage on cold start
    getStoredToken().then((stored) => {
      // Token exists but we don't have user info yet — redirect to login to re-auth
      // In production you'd decode the JWT here to restore role/userId
    });
  }, []);

  if (!token) return <Redirect href="/(auth)/login" />;

  if (role === 'scheduling_agent' || role === 'administrator' || role === 'practice_manager') {
    return <Redirect href="/(agent)" />;
  }

  if (role === 'provider') {
    return <Redirect href="/(provider)" />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator color="#2563eb" />
    </View>
  );
}
