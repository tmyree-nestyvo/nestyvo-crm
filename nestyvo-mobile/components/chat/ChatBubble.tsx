import { View, Text } from 'react-native';

interface Props {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatBubble({ role, content }: Props) {
  const isUser = role === 'user';
  return (
    <View className={`mb-3 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <View className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center mr-2 mt-1 flex-shrink-0">
          <Text className="text-white text-xs font-bold">AI</Text>
        </View>
      )}
      <View
        className={`max-w-[80%] px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-primary-600 rounded-tr-sm'
            : 'bg-white border border-gray-100 rounded-tl-sm shadow-sm'
        }`}
      >
        <Text className={`text-sm leading-5 ${isUser ? 'text-white' : 'text-gray-800'}`}>
          {content}
        </Text>
      </View>
    </View>
  );
}
