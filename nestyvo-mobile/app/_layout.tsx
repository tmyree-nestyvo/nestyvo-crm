// @ts-expect-error – NativeWind CSS import, resolved by Metro
import '../global.css';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { AlertHost } from '../components/AlertHost';
import { useAuthStore } from '../lib/store';
import { loadPersistedSession, clearPersistedSession } from '../lib/auth';
import { api } from '../lib/api';

// Required by NativeWind v4 / react-native-css-interop on web
if (typeof StyleSheet.setFlag === 'function') {
  StyleSheet.setFlag('darkMode', 'class');
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// Runs once at boot to restore a persisted session — see lib/auth.ts's
// persistSession/loadPersistedSession. `app/index.tsx` previously had a
// stubbed-out TODO here ("In production you'd decode the JWT here to
// restore role/userId") that did nothing, so a page refresh or a direct
// link silently dropped every session, real-password ones included.
//
// Doesn't block rendering — it marks the store `hydrated` when done, and
// `app/index.tsx` (the only route-level gate today) waits on that before
// deciding "logged out" vs. "still checking." A stored session is
// re-verified against GET /users/me rather than trusted blindly, since a
// token can have expired (8h) or been revoked since it was stored.
function AuthHydrator() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    (async () => {
      const session = await loadPersistedSession();
      if (!session) {
        setHydrated();
        return;
      }
      try {
        const { data: user } = await api.get('/users/me', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        setAuth(session.token, user.role, user.id, `${user.firstName} ${user.lastName}`, user.practiceId);
      } catch {
        // Expired/revoked token — don't leave a dead session lying around.
        await clearPersistedSession();
      } finally {
        setHydrated();
      }
    })();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <Head.Provider>
      {/* PWA installability (Sep 24 2026 — Charlene: partners need phone
          access to their own schedule). output:"single" web builds don't
          honor app/+html.tsx (that's a static/SSG-export-only mechanism —
          tried it first, had no effect here), so these are injected at
          runtime via expo-router's Head (react-helmet-async under the
          hood) instead. No service worker/offline support — this repo's
          netlify.toml sets Cache-Control: no-cache on everything, which
          would fight a caching service worker, and full offline wasn't
          asked for; this is installability polish only. */}
      <Head>
        <title>Nestyvo</title>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Nestyvo" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
      </Head>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <AuthHydrator />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(agent)" />
          <Stack.Screen name="(provider)" />
          <Stack.Screen name="cancel/[reminderId]" />
        </Stack>
        {/* Mounted after the navigator so alerts paint above every screen.
            react-native-web's own Alert.alert is an empty no-op — see
            lib/alert.ts. */}
        <AlertHost />
      </QueryClientProvider>
    </Head.Provider>
  );
}
