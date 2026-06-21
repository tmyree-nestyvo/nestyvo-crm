import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ChatBubble } from '../../components/chat/ChatBubble';
import { ChatInput } from '../../components/chat/ChatInput';
import { PendingActionCard } from '../../components/chat/PendingActionCard';
import { agentChat, agentConfirm, AgentMessage } from '../../lib/api';

type MessageItem =
  | { type: 'message'; id: string; role: 'user' | 'assistant'; content: string }
  | { type: 'pending'; id: string; toolName: string; description: string; toolInput: Record<string, any>; toolUseId: string };

const STARTER_PROMPTS = [
  "Who's on Dr. Smith's waitlist for Tuesdays?",
  "Fill today's open cancellation slot",
  "Look up patient Maria Gonzalez",
  "What's available this week for new patients?",
];

export default function CopilotScreen() {
  const { prefill } = useLocalSearchParams<{ prefill?: string }>();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Auto-send prefill message when navigated from "Fill slot" button
  useEffect(() => {
    if (prefill && messages.length === 0) {
      sendMessage(prefill);
    }
  }, [prefill]);

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const hasPending = messages.some((m) => m.type === 'pending');

  const sendMessage = useCallback(async (text: string) => {
    if (loading || hasPending) return;

    const userMsg: AgentMessage = { role: 'user', content: text };
    const msgId = `msg-${Date.now()}`;

    setMessages((prev) => [...prev, { type: 'message', id: msgId, role: 'user', content: text }]);
    setLoading(true);
    scrollToBottom();

    try {
      const result = await agentChat(history, text);
      const newHistory: AgentMessage[] = [...history, userMsg, { role: 'assistant', content: result.message }];
      setHistory(newHistory);

      if (result.pendingAction && result.toolUseId) {
        setMessages((prev) => [
          ...prev,
          { type: 'message', id: `assist-${Date.now()}`, role: 'assistant', content: result.message },
          {
            type: 'pending',
            id: `pending-${Date.now()}`,
            toolName: result.pendingAction!.toolName,
            description: result.pendingAction!.description,
            toolInput: result.pendingAction!.toolInput,
            toolUseId: result.toolUseId!,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { type: 'message', id: `assist-${Date.now()}`, role: 'assistant', content: result.message },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { type: 'message', id: `err-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [loading, hasPending, history]);

  const confirmAction = useCallback(async (item: Extract<MessageItem, { type: 'pending' }>) => {
    setConfirmLoading(true);
    setMessages((prev) => prev.filter((m) => m.id !== item.id));

    try {
      const result = await agentConfirm(history, item.toolUseId, item.toolName, item.toolInput);
      setHistory((prev) => [...prev, { role: 'assistant', content: result.message }]);
      setMessages((prev) => [
        ...prev,
        { type: 'message', id: `confirm-${Date.now()}`, role: 'assistant', content: result.message },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { type: 'message', id: `cerr-${Date.now()}`, role: 'assistant', content: 'Action failed. Please try again.' },
      ]);
    } finally {
      setConfirmLoading(false);
      scrollToBottom();
    }
  }, [history]);

  const denyAction = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setMessages((prev) => [
      ...prev,
      { type: 'message', id: `deny-${Date.now()}`, role: 'assistant', content: 'Got it, action cancelled. What else would you like to do?' },
    ]);
  }, []);

  const clearChat = () => {
    setMessages([]);
    setHistory([]);
  };

  const renderItem = ({ item }: { item: MessageItem }) => {
    if (item.type === 'message') {
      return (
        <View className="px-4">
          <ChatBubble role={item.role} content={item.content} />
        </View>
      );
    }
    return (
      <PendingActionCard
        toolName={item.toolName}
        description={item.description}
        toolInput={item.toolInput}
        onConfirm={() => confirmAction(item)}
        onDeny={() => denyAction(item.id)}
        loading={confirmLoading}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="px-5 py-4 flex-row items-center justify-between border-b border-gray-100 bg-white">
        <View className="flex-row items-center gap-3">
          <View className="w-9 h-9 bg-primary-600 rounded-xl items-center justify-center">
            <Ionicons name="sparkles" size={16} color="#fff" />
          </View>
          <View>
            <Text className="font-semibold text-gray-900">Scheduling Copilot</Text>
            <Text className="text-xs text-green-500">● Online</Text>
          </View>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={clearChat} className="p-2">
            <Ionicons name="trash-outline" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          // Empty state with starter prompts
          <View className="flex-1 px-5 pt-8">
            <Text className="text-center text-gray-400 text-sm mb-6">
              I can schedule appointments, search waitlists, look up patients, and more.
            </Text>
            <View className="gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  onPress={() => sendMessage(prompt)}
                  className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex-row items-center gap-3 shadow-sm"
                >
                  <Ionicons name="arrow-forward-circle-outline" size={18} color="#2563eb" />
                  <Text className="text-gray-700 text-sm flex-1">{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingVertical: 16 }}
            className="flex-1 bg-surface"
            onContentSizeChange={scrollToBottom}
          />
        )}

        <ChatInput onSend={sendMessage} loading={loading} disabled={hasPending} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
