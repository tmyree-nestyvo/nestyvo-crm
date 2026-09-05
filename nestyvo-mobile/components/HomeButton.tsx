import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// "Take us back to the home dashboard view" from any screen — Charlene's
// Sep 5 ask. `href` is the dashboard route for whichever tab group the
// screen lives in ('/(agent)' or '/(provider)'); replace (not push) so it
// doesn't stack up a long back history behind the dashboard.
export function HomeButton({ href }: { href: '/(agent)' | '/(provider)' }) {
  return (
    <TouchableOpacity onPress={() => router.replace(href)} className="p-1">
      <Ionicons name="home-outline" size={22} color="#374151" />
    </TouchableOpacity>
  );
}
