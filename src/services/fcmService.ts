import { getApp } from 'firebase/app';
import { type User } from 'firebase/auth';
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from 'firebase/messaging';
import { NotificationTopic } from '../types/broadcast';
import { saveFcmSubscriptionToFirestore } from './firestoreSync';
import {
  getActiveSwRegistration,
  isNativeAndroidApp,
  requestSystemNotificationPermission,
  showAndroidSystemNotification,
} from './systemNotifications';

const FCM_TOKEN_STORAGE_KEY = 'kotv_fcm_token_v1';
const FCM_TOPICS_STORAGE_KEY = 'kotv_fcm_topics_v1';
const WEBPUSH_ENDPOINT_STORAGE_KEY = 'kotv_webpush_endpoint_v1';
const REMINDERS_ENABLED_STORAGE_KEY = 'kotv_reminders_enabled_v1';

export const DEFAULT_NOTIFICATION_TOPICS: NotificationTopic[] = [
  'news',
  'sports',
  'tvGuide',
  'live',
];

export interface ForegroundPushPayload {
  title: string;
  body: string;
  category?: NotificationTopic;
  channelId?: string;
}

function getPlatformTag(): string {
  if (isNativeAndroidApp()) return 'android-apk';
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
    return 'android-web';
  }
  if (typeof navigator !== 'undefined' && /mobile/i.test(navigator.userAgent)) {
    return 'mobile-web';
  }
  return 'web';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function readStoredTopics(): NotificationTopic[] {
  try {
    const raw = localStorage.getItem(FCM_TOPICS_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_TOPICS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_NOTIFICATION_TOPICS;
    return parsed.filter((t): t is NotificationTopic =>
      ['news', 'sports', 'tvGuide', 'live'].includes(String(t))
    );
  } catch {
    return DEFAULT_NOTIFICATION_TOPICS;
  }
}

export function writeStoredTopics(topics: NotificationTopic[]) {
  try {
    localStorage.setItem(FCM_TOPICS_STORAGE_KEY, JSON.stringify(topics));
  } catch {
    // Ignore storage errors
  }
}

export function readRemindersEnabled(): boolean {
  try {
    return localStorage.getItem(REMINDERS_ENABLED_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeRemindersEnabled(enabled: boolean) {
  try {
    localStorage.setItem(REMINDERS_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors
  }
}

export function readStoredFcmToken(): string | null {
  try {
    return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readStoredWebPushActive(): boolean {
  try {
    return Boolean(localStorage.getItem(WEBPUSH_ENDPOINT_STORAGE_KEY));
  } catch {
    return false;
  }
}

async function getMessagingInstance(): Promise<Messaging | null> {
  try {
    const supported = await isSupported();
    if (!supported) return null;
    return getMessaging(getApp());
  } catch {
    return null;
  }
}

// Keep FCM messaging worker in its own scope so it never replaces the root PWA SW (/sw.js)
export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });
  } catch {
    return null;
  }
}

export async function getExistingWebPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await getActiveSwRegistration(1500);
    if (!reg || !('pushManager' in reg)) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function subscribeBrowserWebPush(): Promise<PushSubscription | null> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return null;
  }

  try {
    const reg = await getActiveSwRegistration(3000);
    if (!reg || !('pushManager' in reg)) return null;

    const keyRes = await fetch('/api/push/vapid-public-key').catch(() => null);
    if (!keyRes || !keyRes.ok) return null;
    const keyData = (await keyRes.json()) as { ok?: boolean; publicKey?: string };
    const publicKey = keyData.publicKey?.trim();
    if (!publicKey) return null;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    return sub;
  } catch {
    return null;
  }
}

export async function enablePushNotifications(params: {
  topics: NotificationTopic[];
  firebaseUser: User | null;
}): Promise<{
  ok: boolean;
  permission: NotificationPermission | 'unsupported';
  token: string | null;
  webPushActive: boolean;
  message: string;
}> {
  writeStoredTopics(params.topics);
  const platform = getPlatformTag();

  // 1. Native Android APK Path (Android Notification Channels + AlarmManager + System Tray)
  if (isNativeAndroidApp()) {
    const perm = await requestSystemNotificationPermission();
    if (perm !== 'granted') {
      return {
        ok: false,
        permission: perm,
        token: null,
        webPushActive: false,
        message:
          perm === 'denied'
            ? 'Android blocked notifications. Tap Open OS Notification Settings below to allow them.'
            : 'Notification permission prompt was dismissed.',
      };
    }

    return {
      ok: true,
      permission: 'granted',
      token: null,
      webPushActive: true,
      message:
        'Android System Notifications active. Breaking news, live alerts, and TV guide reminders will appear in your Android status bar & shade.',
    };
  }

  // 2. Android Chrome / PWA / Web Browser Path
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      ok: false,
      permission: 'unsupported',
      token: null,
      webPushActive: false,
      message: 'System notifications are not supported in this browser.',
    };
  }

  const permission = await requestSystemNotificationPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      permission,
      token: null,
      webPushActive: false,
      message:
        permission === 'denied'
          ? 'Notifications are blocked in your Android Chrome / browser site settings.'
          : 'Notification permission request was dismissed.',
    };
  }

  // Standard Web Push VAPID Subscription on active root PWA Service Worker
  const webPushSub = await subscribeBrowserWebPush();
  let webPushJson: string | undefined;
  let webPushActive = false;

  if (webPushSub) {
    const jsonObj = webPushSub.toJSON();
    webPushJson = JSON.stringify(jsonObj);
    webPushActive = true;
    try {
      localStorage.setItem(WEBPUSH_ENDPOINT_STORAGE_KEY, webPushSub.endpoint);
    } catch {
      // Ignore storage errors
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: jsonObj,
        topics: params.topics,
        platform,
        uid: params.firebaseUser?.uid,
      }),
    }).catch(() => undefined);
  }

  // Optional FCM token minting in its dedicated non-colliding scope
  const fcmSwReg = await registerFcmServiceWorker();
  const messaging = await getMessagingInstance();
  const vapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
  let fcmToken: string | null = null;

  if (messaging && fcmSwReg && vapidKey) {
    try {
      fcmToken = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: fcmSwReg,
      });
    } catch {
      fcmToken = null;
    }
  } else if (messaging && fcmSwReg) {
    try {
      fcmToken = await getToken(messaging, {
        serviceWorkerRegistration: fcmSwReg,
      });
    } catch {
      fcmToken = null;
    }
  }

  if (fcmToken) {
    try {
      localStorage.setItem(FCM_TOKEN_STORAGE_KEY, fcmToken);
    } catch {
      // Ignore storage errors
    }

    await fetch('/api/fcm/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fcmToken,
        topics: params.topics,
        platform,
        uid: params.firebaseUser?.uid,
      }),
    }).catch(() => undefined);
  }

  if (
    params.firebaseUser &&
    params.firebaseUser.emailVerified &&
    (fcmToken || webPushJson)
  ) {
    const fallbackDocToken = fcmToken || `webpush:${params.firebaseUser.uid}`;
    await saveFcmSubscriptionToFirestore({
      uid: params.firebaseUser.uid,
      token: fallbackDocToken,
      topics: params.topics,
      platform,
      webPushJson,
    }).catch(() => undefined);
  }

  if (webPushActive && fcmToken) {
    return {
      ok: true,
      permission: 'granted',
      token: fcmToken,
      webPushActive: true,
      message:
        'Android System Push (Web Push + FCM) enabled. Alerts arrive in your system tray even when the app is closed.',
    };
  }

  if (webPushActive) {
    return {
      ok: true,
      permission: 'granted',
      token: null,
      webPushActive: true,
      message:
        'Android & Web Push notifications enabled! Closed-app system tray alerts are active for your selected topics.',
    };
  }

  return {
    ok: true,
    permission: 'granted',
    token: fcmToken,
    webPushActive: false,
    message:
      'System notifications allowed. Real-time station alerts and TV Guide reminders are active.',
  };
}

export async function syncTopicPreferencesToServer(params: {
  topics: NotificationTopic[];
  firebaseUser: User | null;
}): Promise<void> {
  writeStoredTopics(params.topics);
  const platform = getPlatformTag();
  const fcmToken = readStoredFcmToken();
  const sub = await getExistingWebPushSubscription();
  const webPushJson = sub ? JSON.stringify(sub.toJSON()) : undefined;

  if (sub) {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        topics: params.topics,
        platform,
        uid: params.firebaseUser?.uid,
      }),
    }).catch(() => undefined);
  }

  if (fcmToken) {
    await fetch('/api/fcm/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fcmToken,
        topics: params.topics,
        platform,
        uid: params.firebaseUser?.uid,
      }),
    }).catch(() => undefined);
  }

  if (
    params.firebaseUser &&
    params.firebaseUser.emailVerified &&
    (fcmToken || webPushJson)
  ) {
    await saveFcmSubscriptionToFirestore({
      uid: params.firebaseUser.uid,
      token: fcmToken || `webpush:${params.firebaseUser.uid}`,
      topics: params.topics,
      platform,
      webPushJson,
    }).catch(() => undefined);
  }
}

export async function sendTestSystemNotification(params?: {
  channelId?: string;
}): Promise<{ ok: boolean; message: string }> {
  const title = 'Kakumiro Online TV';
  const body =
    'System notifications are active. Breaking news, live shows & programme reminders will appear here.';
  const tag = 'kotv-test-notification';

  const localShown = await showAndroidSystemNotification({
    id: tag,
    title,
    body,
    category: 'live',
    channelId: params?.channelId,
  });

  if (isNativeAndroidApp()) {
    return localShown
      ? {
          ok: true,
          message: 'Test Android system notification sent to your status bar.',
        }
      : {
          ok: false,
          message:
            'Please grant Android notification permission first to receive system notifications.',
        };
  }

  const sub = await getExistingWebPushSubscription();
  if (sub) {
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          title,
          body,
          channelId: params?.channelId || '',
        }),
      });
      if (res.ok) {
        return {
          ok: true,
          message:
            'Test notification sent via OS & Web Push Service Worker. Check your Android notification shade!',
        };
      }
    } catch {
      // Fallback handled by localShown check below
    }
  }

  if (localShown) {
    return {
      ok: true,
      message:
        'Test system notification displayed! Check your device notification shade.',
    };
  }

  return {
    ok: false,
    message:
      'Tap "Enable Android System Notifications" above and allow notifications when prompted.',
  };
}

export async function subscribeForegroundFcm(
  onPayload: (payload: ForegroundPushPayload) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  const unsubscribe = onMessage(messaging, (msg) => {
    const title =
      msg.notification?.title || msg.data?.title || 'Kakumiro Online TV';
    const body =
      msg.notification?.body || msg.data?.body || 'New live update available.';
    const category = msg.data?.category as NotificationTopic | undefined;
    const channelId = msg.data?.channelId;
    onPayload({ title, body, category, channelId });
  });

  return unsubscribe;
}
