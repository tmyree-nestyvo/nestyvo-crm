// @ts-expect-error – NativeWind CSS import, resolved by Metro
import '../global.css';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';

// Required by NativeWind v4 / react-native-css-interop on web
if (typeof StyleSheet.setFlag === 'function') {
  StyleSheet.setFlag('darkMode', 'class');
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

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
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(agent)" />
          <Stack.Screen name="(provider)" />
          <Stack.Screen name="cancel/[reminderId]" />
        </Stack>
      </QueryClientProvider>
    </Head.Provider>
  );
}
