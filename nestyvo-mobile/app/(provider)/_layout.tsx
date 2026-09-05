import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ProviderLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { borderTopWidth: 1, borderTopColor: '#f3f4f6', height: 60 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Schedule',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients/index"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="waitlist"
        options={{
          title: 'Waitlist',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => <Ionicons name="flag" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="block-time" options={{ href: null }} />
      <Tabs.Screen name="clients/[id]" options={{ href: null }} />
      <Tabs.Screen name="cancellations" options={{ href: null }} />
      <Tabs.Screen name="available-slots" options={{ href: null }} />
      <Tabs.Screen name="calendar-export" options={{ href: null }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
    </Tabs>
  );
}
