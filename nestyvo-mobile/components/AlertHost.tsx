import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subscribeToAlerts, dismissAlert, type AlertRequest } from '../lib/alert';

// Renders whatever lib/alert.ts is holding. Mounted once at the root, after
// the navigator, so it paints above every screen. See lib/alert.ts for why
// this replacement exists at all.

// react-native-web passes position straight through to CSS, and `fixed` is
// what keeps toasts pinned while a screen scrolls underneath them. RN's own
// types don't know about it, hence the cast.
const OVERLAY_POSITION = (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute';

function ToastCard({ item }: { item: AlertRequest }) {
  const isError = item.kind === 'error';
  return (
    <View
      className={`flex-row items-start gap-2.5 rounded-xl border px-4 py-3 mb-2 ${
        isError ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
      }`}
      style={{
        width: '100%',
        maxWidth: 420,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
    >
      <Ionicons
        name={isError ? 'alert-circle' : 'checkmark-circle'}
        size={18}
        color={isError ? '#dc2626' : '#16a34a'}
      />
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${isError ? 'text-red-900' : 'text-gray-900'}`}>
          {item.title}
        </Text>
        {item.message ? (
          <Text className={`text-xs mt-0.5 ${isError ? 'text-red-700' : 'text-gray-500'}`}>
            {item.message}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={() => dismissAlert(item.id)} className="p-0.5" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color="#9ca3af" />
      </TouchableOpacity>
    </View>
  );
}

function DialogCard({ item }: { item: AlertRequest }) {
  const buttons = item.buttons?.length ? item.buttons : [{ text: 'OK' }];
  return (
    <View
      style={{
        position: OVERLAY_POSITION,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10001,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15,23,42,0.45)',
        padding: 24,
      }}
    >
      <View className="bg-white rounded-2xl p-5 w-full" style={{ maxWidth: 400 }}>
        <Text className="text-base font-bold text-gray-900 mb-1">{item.title}</Text>
        {item.message ? (
          <Text className="text-sm text-gray-500 mb-4">{item.message}</Text>
        ) : (
          <View className="mb-4" />
        )}
        <View className="flex-row justify-end gap-2">
          {buttons.map((b, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                dismissAlert(item.id);
                b.onPress?.();
              }}
              className={`px-4 py-2.5 rounded-xl ${
                b.style === 'destructive'
                  ? 'bg-red-600'
                  : b.style === 'cancel'
                  ? 'bg-gray-100'
                  : 'bg-primary-600'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  b.style === 'cancel' ? 'text-gray-700' : 'text-white'
                }`}
              >
                {b.text ?? 'OK'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

export function AlertHost() {
  const [items, setItems] = useState<AlertRequest[]>([]);
  useEffect(() => subscribeToAlerts(setItems), []);

  if (!items.length) return null;

  const toasts = items.filter((i) => i.variant === 'toast');
  // Only one dialog at a time — stacking blocking dialogs would trap the user.
  const dialog = items.find((i) => i.variant === 'dialog');

  return (
    <>
      {toasts.length > 0 ? (
        <View
          pointerEvents="box-none"
          style={{
            position: OVERLAY_POSITION,
            top: 12,
            left: 0,
            right: 0,
            zIndex: 10000,
            alignItems: 'center',
            paddingHorizontal: 16,
          }}
        >
          {toasts.map((t) => (
            <ToastCard key={t.id} item={t} />
          ))}
        </View>
      ) : null}
      {dialog ? <DialogCard item={dialog} /> : null}
    </>
  );
}
