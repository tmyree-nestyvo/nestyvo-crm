import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { router } from 'expo-router';
import { persistSession } from '../../lib/auth';
import { useAuthStore } from '../../lib/store';
import { api } from '../../lib/api';

// Real email+password login (Charlene, Sep 30 2026 — production must not
// auto-log anyone in). Replaces the previous dev-mode screen entirely: no
// auto-populated email, no password-free "Sign In (Dev)" button, no quick-
// switch between accounts. See PasswordAuthController on the backend.
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email: email.trim(), password });

      if (data.mustChangePassword) {
        // Not signed in yet as far as the rest of the app is concerned —
        // PasswordChangeGuard on the backend would 403 anything else
        // anyway. Hand the one-time token to the change-password screen
        // via router params rather than persisting it, since this session
        // shouldn't survive a refresh until a real password is actually set.
        router.replace({
          pathname: '/(auth)/change-password',
          params: { token: data.token, firstLogin: '1' },
        });
        return;
      }

      const { data: user } = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${data.token}` },
      });

      setAuth(data.token, user.role, user.id, `${user.firstName} ${user.lastName}`, user.practiceId);
      await persistSession({
        token: data.token,
        role: user.role,
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        practiceId: user.practiceId ?? null,
      });

      router.replace(user.role === 'provider' ? '/(provider)' : '/(agent)');
    } catch (err: any) {
      Alert.alert('Login Failed', err?.response?.data?.message || 'Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <View className="flex-1 px-8 justify-center">
        <View className="mb-12">
          <View className="w-14 h-14 bg-primary-600 rounded-2xl items-center justify-center mb-4">
            <Text className="text-white text-2xl font-bold">N</Text>
          </View>
          <Text className="text-3xl font-bold text-gray-900">Nestyvo</Text>
          <Text className="text-gray-500 mt-1">Scheduling Operations Platform</Text>
        </View>

        <View className="gap-4">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@practice.com"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              onSubmitEditing={handleLogin}
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
            />
          </View>

          <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} className="self-end -mt-1">
            <Text className="text-primary-600 text-sm font-medium">Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading || !email.trim() || !password.trim()}
            className={`rounded-xl py-4 items-center mt-2 ${
              !email.trim() || !password.trim() ? 'bg-gray-300' : 'bg-primary-600'
            }`}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">Sign In</Text>}
          </TouchableOpacity>
        </View>

        <Text className="text-center text-xs text-gray-400 mt-8">HIPAA-compliant • Secured by Nestyvo Auth</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
