import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { persistSession } from '../../lib/auth';
import { useAuthStore } from '../../lib/store';

// Reached from forgot-password.tsx with ?token= already filled in, or
// pasted manually if someone has the token but not the link. Successful
// reset signs the user straight in (same pattern as change-password.tsx's
// first-login flow) rather than sending them back to re-type the password
// they just chose.
export default function ResetPasswordScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [token, setToken] = useState(tokenParam ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token: token.trim(), newPassword });

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
      setError(err?.response?.data?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-white px-8 justify-center">
      <View className="mb-8">
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="mb-6 self-start">
          <Text className="text-sm text-gray-400">← Back to Login</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900">Reset Password</Text>
      </View>

      <View className="gap-4">
        {!tokenParam && (
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Reset token</Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste your reset token"
              placeholderTextColor="#9ca3af"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
            />
          </View>
        )}
        <View>
          <Text className="text-sm font-medium text-gray-700 mb-1.5">New password</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="8+ characters"
            placeholderTextColor="#9ca3af"
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
          />
        </View>
        <View>
          <Text className="text-sm font-medium text-gray-700 mb-1.5">Confirm new password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="8+ characters"
            placeholderTextColor="#9ca3af"
            onSubmitEditing={handleSubmit}
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
          />
        </View>
        {error && <Text className="text-sm text-red-500">{error}</Text>}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading || !token.trim()}
          className={`rounded-xl py-4 items-center mt-2 ${!token.trim() ? 'bg-gray-300' : 'bg-primary-600'}`}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">Reset Password</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
