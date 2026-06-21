import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { signIn } from '../../lib/auth';
import { useAuthStore } from '../../lib/store';
import { api, API_BASE_URL } from '../../lib/api';

const IS_DEV = API_BASE_URL.includes('localhost');

export default function LoginScreen() {
  const [email, setEmail] = useState(IS_DEV ? 'agent@nestyvo.com' : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      let token: string;

      if (IS_DEV) {
        // Dev bypass: POST /dev/login returns a local JWT, no Cognito needed
        const { data } = await api.post('/dev/login', { email: email.trim() });
        token = data.token;
      } else {
        if (!password.trim()) { setLoading(false); return; }
        const session = await signIn(email.trim(), password);
        token = session.getIdToken().getJwtToken();
      }

      const { data: user } = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      setAuth(token, user.role, user.id, `${user.firstName} ${user.lastName}`, user.practiceId);

      if (user.role === 'provider') {
        router.replace('/(provider)');
      } else {
        router.replace('/(agent)');
      }
    } catch (err: any) {
      Alert.alert('Login Failed', err.message ?? 'Please check your credentials and try again.');
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
        {/* Logo / Wordmark */}
        <View className="mb-12">
          <View className="w-14 h-14 bg-primary-600 rounded-2xl items-center justify-center mb-4">
            <Text className="text-white text-2xl font-bold">N</Text>
          </View>
          <Text className="text-3xl font-bold text-gray-900">Nestyvo</Text>
          <Text className="text-gray-500 mt-1">Scheduling Operations Platform</Text>
          {IS_DEV && (
            <View className="mt-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg self-start">
              <Text className="text-amber-700 text-xs font-medium">Dev Mode — no password needed</Text>
            </View>
          )}
        </View>

        {/* Form */}
        <View className="gap-4">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@practice.com"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
            />
          </View>

          {!IS_DEV && (
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900"
              />
            </View>
          )}

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            className="bg-primary-600 rounded-xl py-4 items-center mt-2"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">
                {IS_DEV ? 'Sign In (Dev)' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          {IS_DEV && (
            <View className="gap-2">
              <Text className="text-xs text-gray-400 text-center">Quick switch:</Text>
              <View className="flex-row gap-2">
                {['agent@nestyvo.com', 'admin@nestyvo.com'].map((e) => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => setEmail(e)}
                    className={`flex-1 py-2 rounded-lg border items-center ${
                      email === e ? 'border-primary-600 bg-primary-50' : 'border-gray-200'
                    }`}
                  >
                    <Text className={`text-xs font-medium ${email === e ? 'text-primary-700' : 'text-gray-500'}`}>
                      {e.split('@')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <Text className="text-center text-xs text-gray-400 mt-8">
          {IS_DEV ? 'Development build' : 'HIPAA-compliant • Secured by AWS Cognito'}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
