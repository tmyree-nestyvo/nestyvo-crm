import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../lib/api';

// Built Oct 1 2026 after Charlene got locked out with no self-service way
// back in and suggested exactly this ("maybe this is a good opportunity to
// add a forgot pw button"). Ported from sal_tax_app's identical screen —
// same backend pattern (POST /auth/forgot-password), same honest handling
// of the real constraint: no email-sending provider exists yet, so the
// reset link is shown directly on this screen instead of silently
// pretending an email went out. Troy/an admin is the one relaying it for
// now, same as a temp password for a new login.
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ message: string; devResetToken?: string }>(
        '/auth/forgot-password',
        { email: email.trim() },
      );
      setDevToken(data.devResetToken ?? null);
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
        <Text className="text-2xl font-bold text-gray-900">Forgot Password</Text>
        <Text className="text-gray-500 mt-1.5">Enter your account email and we'll generate a reset link.</Text>
      </View>

      {devToken ? (
        <View className="gap-3">
          <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Text className="text-amber-800 text-xs leading-relaxed">
              No email delivery is wired up yet — here's the reset link directly. An admin would normally
              relay this to you the same way a new login's temporary password gets shared today.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(auth)/reset-password', params: { token: devToken } })}
            className="bg-primary-600 rounded-xl py-4 items-center"
          >
            <Text className="text-white font-semibold text-base">Continue to reset password →</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
              onSubmitEditing={handleSubmit}
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
            />
          </View>
          {error && <Text className="text-sm text-red-500">{error}</Text>}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || !email.trim()}
            className={`rounded-xl py-4 items-center ${!email.trim() ? 'bg-gray-300' : 'bg-primary-600'}`}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">Send reset link</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
