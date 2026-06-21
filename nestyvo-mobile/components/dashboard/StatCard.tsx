import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress?: () => void;
  badge?: number;
}

export function StatCard({ label, value, icon, color = '#2563eb', onPress, badge }: Props) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      className="bg-white rounded-2xl p-4 flex-1 shadow-sm border border-gray-100"
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        {badge !== undefined && badge > 0 && (
          <View className="bg-red-500 rounded-full px-2 py-0.5 min-w-[20px] items-center">
            <Text className="text-white text-xs font-bold">{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text className="text-2xl font-bold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
    </Wrapper>
  );
}
