import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } from './constants';

const TOKEN_KEY = 'nestyvo_id_token';
const REFRESH_KEY = 'nestyvo_refresh_token';

// SecureStore is native-only — fall back to localStorage on web
const storage = {
  async set(key: string, value: string) {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

// Lazily initialized — only used in production (Cognito path)
let _userPool: CognitoUserPool | null = null;
function getUserPool(): CognitoUserPool {
  if (!_userPool) {
    if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
      throw new Error('Cognito is not configured. Set EXPO_PUBLIC_COGNITO_USER_POOL_ID and EXPO_PUBLIC_COGNITO_CLIENT_ID.');
    }
    _userPool = new CognitoUserPool({
      UserPoolId: COGNITO_USER_POOL_ID,
      ClientId: COGNITO_CLIENT_ID,
    });
  }
  return _userPool;
}

export async function signIn(email: string, password: string): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: getUserPool() });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess: async (session) => {
        await storage.set(TOKEN_KEY, session.getIdToken().getJwtToken());
        await storage.set(REFRESH_KEY, session.getRefreshToken().getToken());
        resolve(session);
      },
      onFailure: reject,
      newPasswordRequired: () => reject(new Error('NEW_PASSWORD_REQUIRED')),
    });
  });
}

export async function signOut(): Promise<void> {
  await storage.remove(TOKEN_KEY);
  await storage.remove(REFRESH_KEY);
}

export async function getStoredToken(): Promise<string | null> {
  return storage.get(TOKEN_KEY);
}
