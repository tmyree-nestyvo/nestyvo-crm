import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shared by (agent)/tickets.tsx and (provider)/tickets.tsx. Charlene, Oct 10
// recording (42:20–45:30): "who am I calling back?", "not very clear what
// the status is until we click on it", "it needs to have a clear history of
// what back and forth notes had occurred", "clear to each party… the note
// from the other party and the action that is being taken."

type Entry = { at: string; author: string; text: string };

/** History is stored server-side as "[Oct 10, 7:45 AM] Name: text" blocks. */
export function parseHistory(notes?: string | null): Entry[] {
  if (!notes) return [];
  return notes.split(/\n\n(?=\[)/).map((block) => {
    const m = block.match(/^\[([^\]]+)\] ([^:]+): ([\s\S]*)$/);
    return m ? { at: m[1], author: m[2], text: m[3] } : { at: '', author: '', text: block };
  });
}

const STATUS_LINE = /^(Marked (In Progress|Resolved)|Reopened this request|Closed this request)$/;

export function TicketHistory({ notes, maxHeight = 260 }: { notes?: string | null; maxHeight?: number }) {
  const entries = parseHistory(notes);
  if (!entries.length) {
    return <Text className="text-gray-400 text-sm mb-4">No replies yet.</Text>;
  }
  return (
    <ScrollView style={{ maxHeight }} className="mb-4">
      {entries.map((e, i) =>
        STATUS_LINE.test(e.text) ? (
          <View key={i} className="flex-row items-center gap-1.5 py-1.5">
            <Ionicons name="swap-horizontal" size={12} color="#9ca3af" />
            <Text className="text-gray-500 text-xs">
              <Text className="font-semibold">{e.author}</Text> {e.text.charAt(0).toLowerCase() + e.text.slice(1)} · {e.at}
            </Text>
          </View>
        ) : (
          <View key={i} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-2">
            <View className="flex-row justify-between mb-1">
              <Text className="text-gray-800 text-xs font-semibold">{e.author || 'Note'}</Text>
              <Text className="text-gray-400 text-xs">{e.at}</Text>
            </View>
            <Text className="text-gray-700 text-sm leading-5">{e.text}</Text>
          </View>
        ),
      )}
    </ScrollView>
  );
}

/** "Client: Brown Bear" — prominent, so nobody has to ask who a request is about. */
export function ClientLine({ patient, size = 'sm' }: { patient?: { firstName: string; lastName: string } | null; size?: 'sm' | 'md' }) {
  if (!patient) return <Text className="text-gray-400 text-xs mt-0.5">No client attached</Text>;
  return (
    <View className="flex-row items-center gap-1.5 mt-0.5">
      <Ionicons name="person-outline" size={size === 'md' ? 14 : 12} color="#2563eb" />
      <Text className={`text-primary-700 font-semibold ${size === 'md' ? 'text-sm' : 'text-xs'}`}>
        {patient.firstName} {patient.lastName}
      </Text>
    </View>
  );
}

/** Latest reply preview for a list row. */
export function LastActivity({ entry }: { entry?: Entry | null }) {
  if (!entry) return null;
  return (
    <Text className="text-gray-600 text-xs mt-2 leading-4" numberOfLines={2}>
      <Text className="font-semibold">{entry.author}</Text> · {entry.at}: {entry.text}
    </Text>
  );
}

export function ResolvedBanner({ ticket }: { ticket: any }) {
  if (!ticket || (ticket.status !== 'resolved' && ticket.status !== 'closed')) return null;
  const entries = parseHistory(ticket.resolutionNotes);
  const marker = [...entries].reverse().find((e) => STATUS_LINE.test(e.text) && /Resolved|Closed/.test(e.text));
  const lastNote = [...entries].reverse().find((e) => !STATUS_LINE.test(e.text));
  return (
    <View className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 mb-4">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
        <Text className="text-green-800 text-sm font-semibold">
          {ticket.status === 'closed' ? 'Closed' : 'Resolved'}
          {marker ? ` by ${marker.author} · ${marker.at}` : ''}
        </Text>
      </View>
      {lastNote ? (
        <Text className="text-green-900 text-sm mt-1 leading-5">Outcome: {lastNote.text}</Text>
      ) : null}
    </View>
  );
}
