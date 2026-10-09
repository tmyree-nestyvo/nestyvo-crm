import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AgentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#f3f4f6',
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="copilot"
        options={{
          title: 'Copilot',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="patients/index"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
        // Oct 9 2026 — Charlene/Troy call: after a reschedule, returning to
        // the Calendar tab kept showing "pick a new time" and wouldn't let
        // go, even after Home and back. React Navigation's tab navigator
        // restores each tab's last screen state by default — calendar.tsx's
        // own reschedule mode is driven entirely by URL params
        // (rescheduleAppointmentId etc.), so the restored instance still
        // carried them even though the reschedule had already succeeded and
        // navigated away. Reschedule's own success handler already
        // navigates to a clean appointment-detail route — the gap was
        // getting back to Calendar afterward. Forcing a clean, param-free
        // replace on every tab press (not just the first) means the tab bar
        // can never hand back a stale reschedule/booking state again.
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.replace('/(agent)/calendar');
          },
        }}
      />
      <Tabs.Screen name="open-slots" options={{ href: null }} />
      <Tabs.Screen name="stats" options={{ href: null }} />
      <Tabs.Screen name="patients/[id]" options={{ href: null }} />
      <Tabs.Screen name="appointments/[id]" options={{ href: null }} />
      <Tabs.Screen name="patients/new" options={{ href: null }} />
      <Tabs.Screen name="fill-slot" options={{ href: null }} />
      <Tabs.Screen name="book-slot" options={{ href: null }} />
      <Tabs.Screen name="callbacks" options={{ href: null }} />
      <Tabs.Screen name="cancellations" options={{ href: null }} />
      <Tabs.Screen name="waitlist" options={{ href: null }} />
      <Tabs.Screen name="tags" options={{ href: null }} />
      <Tabs.Screen name="tickets" options={{ href: null }} />
      <Tabs.Screen name="provider-settings" options={{ href: null }} />
      <Tabs.Screen name="partners" options={{ href: null }} />
      <Tabs.Screen name="import-clients" options={{ href: null }} />
    </Tabs>
  );
}
