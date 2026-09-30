import { Alert as RNAlert, Platform } from 'react-native';

// Drop-in replacement for react-native's Alert (Sep 30 2026).
//
// Why this exists: react-native-web ships `Alert.alert()` as a literally
// empty function —
//     class Alert { static alert() {} }
// — so on web every alert in this app was a silent no-op. Charlene uses the
// web build, which meant *every* success confirmation and *every* error
// message had been invisible to her for the entire project. That's the root
// cause behind a whole class of "it looked like it saved but didn't"
// reports (Aug 21's "tag reassignment appeared not to save" was nominally
// fixed by adding onError alerts — those alerts never rendered either), and
// most recently the Sep 29 "partner was added" confirmation she asked for,
// which shipped as an Alert and therefore never appeared.
//
// The API deliberately mirrors RN's exactly (title, message, buttons) so
// every existing call site works unchanged — each screen only swaps its
// import. Native keeps using the real OS dialog; only web is substituted.

export type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  kind: 'success' | 'error';
  /** Multi-button alerts need a real blocking dialog; the rest are toasts. */
  variant: 'toast' | 'dialog';
};

type Listener = (items: AlertRequest[]) => void;

let items: AlertRequest[] = [];
let listeners: Listener[] = [];
let nextId = 1;

function emit() {
  const snapshot = [...items];
  listeners.forEach((l) => l(snapshot));
}

export function subscribeToAlerts(listener: Listener) {
  listeners.push(listener);
  listener([...items]);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function dismissAlert(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

// Call sites pass human-written titles, not a severity flag, so severity is
// inferred rather than requiring all 35 of them to be rewritten. Existing
// copy is consistent enough for this ("Could not save", "Sync failed",
// "Couldn't update ticket"); anything unmatched renders as success, which
// is the safe default since errors are the ones that read as alarming.
const ERROR_PATTERN =
  /could ?n[o']?t|couldn|cannot|can'?t|fail|error|invalid|unable|not found|denied|problem|wrong|no .*found/i;

function classify(title: string, message?: string): 'success' | 'error' {
  return ERROR_PATTERN.test(title) || (!!message && ERROR_PATTERN.test(message)) ? 'error' : 'success';
}

function show(title: string, message?: string, buttons?: AlertButton[]) {
  const variant: AlertRequest['variant'] = (buttons?.length ?? 0) > 1 ? 'dialog' : 'toast';
  const req: AlertRequest = {
    id: nextId++,
    title,
    message,
    buttons,
    kind: classify(title, message),
    variant,
  };
  items = [...items, req];
  emit();

  // Dialogs wait for a button press; toasts self-dismiss. Errors linger
  // longer than confirmations — they're the ones worth reading.
  if (variant === 'toast') {
    const ttl = req.kind === 'error' ? 7000 : 4000;
    setTimeout(() => dismissAlert(req.id), ttl);
  }
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: unknown) {
    if (Platform.OS !== 'web') {
      // Native has a real, accessible, OS-provided dialog — no reason to
      // replace it, and doing so would mean shipping untested UI to the
      // one platform that already worked.
      RNAlert.alert(title, message, buttons as never, options as never);
      return;
    }
    show(title, message, buttons);
  },
};
