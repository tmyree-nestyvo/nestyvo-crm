import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../lib/store';
import { hasRole, OFFICE_STAFF, PROVIDER_ONLY } from '../lib/role-groups';

export default function RootIndex() {
  const { token, role, hydrated } = useAuthStore();

  // Session restore (see app/_layout.tsx's AuthHydrator) runs async — wait
  // for it before treating "no token yet" as "logged out." Without this, a
  // page refresh with a perfectly valid persisted session bounced straight
  // to the login screen for the instant before hydration finished.
  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (!token) return <Redirect href="/(auth)/login" />;

  if (hasRole(role, OFFICE_STAFF)) {
    return <Redirect href="/(agent)" />;
  }

  if (hasRole(role, PROVIDER_ONLY)) {
    return <Redirect href="/(provider)" />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator color="#2563eb" />
    </View>
  );
}
