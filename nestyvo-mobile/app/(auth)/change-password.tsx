import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Alert } from '../../lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { persistSession } from '../../lib/auth';
import { useAuthStore } from '../../lib/store';
import { api } from '../../lib/api';

// Two ways in: a fresh admin-issued temp password (firstLogin=1, token
// passed via route params, nothing persisted yet — see login.tsx) or a
// voluntary change from inside the app for an already-signed-in user
// (reached from Settings, currentPassword required). See
// PasswordAuthController.changePassword and PasswordChangeGuard.
export default function ChangePasswordScreen() {
  const params = useLocalSearchParams<{ token?: string; firstLogin?: string }>();
  const isFirstLogin = params.firstLogin === '1';
  const storeToken = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // params.token is only present coming straight from login.tsx's fresh
  // /auth/login response (nothing persisted to the store yet at that
  // point). Coming from the api.ts interceptor instead — a mid-session
  // password reset tripping PasswordChangeGuard — the store's own token is
  // still perfectly valid, that's what triggered the 403 in the first
  // place, so fall back to it.
  const activeToken = params.token ?? storeToken;

  async function handleSubmit() {
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Re-enter the new password to confirm it.');
      return;
    }
    if (!isFirstLogin && !currentPassword) {
      Alert.alert('Current password required', 'Enter your current password to confirm the change.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post(
        '/auth/change-password',
        { currentPassword: isFirstLogin ? undefined : currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${activeToken}` } },
      );

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

      if (isFirstLogin) {
        router.replace(user.role === 'provider' ? '/(provider)' : '/(agent)');
      } else {
        Alert.alert('Password updated', 'Your password has been changed.');
        router.back();
      }
    } catch (err: any) {
      Alert.alert('Could not update password', err?.response?.data?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-white">
      <View className="flex-1 px-8 justify-center">
        <View className="mb-10">
          <Text className="text-2xl font-bold text-gray-900">
            {isFirstLogin ? 'Set your password' : 'Change password'}
          </Text>
          <Text className="text-gray-500 mt-1.5">
            {isFirstLogin
              ? "You're signing in with a temporary password. Set a real one to continue."
              : 'Enter your current password and choose a new one.'}
          </Text>
        </View>

        <View className="gap-4">
          {!isFirstLogin && (
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Current password</Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
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
              placeholder="At least 8 characters"
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
              onSubmitEditing={handleSubmit}
              placeholderTextColor="#9ca3af"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            className="bg-primary-600 rounded-xl py-4 items-center mt-2"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">Save Password</Text>}
          </TouchableOpacity>

          {!isFirstLogin && (
            <TouchableOpacity onPress={() => router.back()} className="items-center py-2">
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
