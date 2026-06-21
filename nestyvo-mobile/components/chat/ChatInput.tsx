import { View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  loading: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, loading, disabled }: Props) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || loading || disabled) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <View className="flex-row items-end px-4 py-3 bg-white border-t border-gray-100 gap-3">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Ask me anything about scheduling…"
        placeholderTextColor="#9ca3af"
        multiline
        maxLength={500}
        className="flex-1 bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-800 max-h-28"
        onSubmitEditing={handleSend}
        editable={!disabled && !loading}
      />
      <TouchableOpacity
        onPress={handleSend}
        disabled={loading || disabled || !text.trim()}
        className={`w-10 h-10 rounded-full items-center justify-center ${
          loading || disabled || !text.trim() ? 'bg-gray-200' : 'bg-primary-600'
        }`}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="send" size={16} color={text.trim() ? '#fff' : '#9ca3af'} />
        )}
      </TouchableOpacity>
    </View>
  );
}
