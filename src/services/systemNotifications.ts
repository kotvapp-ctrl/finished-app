import { Capacitor, registerPlugin } from '@capacitor/core';

export type SystemNotificationPermission =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export type SystemNotificationMode =
  | 'native-android'
  | 'web-push-sw'
  | 'desktop-notification'
  | 'unsupported';

export interface SystemNotificationStatus {
  supported: boolean;
  permission: SystemNotificationPermission;
  mode: SystemNotificationMode;
  webPushSubscribed: boolean;
}

export interface SystemNotificationPayload {
  id?: string;
  title: string;
  body: string;
  category?: string;
  channelId?: string;
  url?: string;
}

interface KOTVNotificationsPluginInterface {
  checkPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
  requestPermissions(): Promise<{ display: 'granted' | 'denied' | 'prompt' }>;
  showSystemNotification(options: {
    id?: string;
    title: string;
    body: string;
    category?: string;
    channelId?: string;
  }): Promise<{ ok: boolean; id: number }>;
  scheduleReminder(options: {
    id: string;
    triggerAtMs: number;
    title: string;
    body: string;
    channelId?: string;
  }): Promise<{ scheduled: boolean }>;
  cancelReminder(options: { id: string }): Promise<void>;
  openSystemNotificationSettings(): Promise<void>;
  getPendingChannelId(): Promise<{ channelId?: string }>;
}

const KOTVNotifications =
  registerPlugin<KOTVNotificationsPluginInterface>('KOTVNotifications');

export function isNativeAndroidApp(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    );
  } catch {
    return false;
  }
}

export async function getActiveSwRegistration(
  timeoutMs = 2500
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const direct = await navigator.serviceWorker.getRegistration('/');
    if (direct) return direct;

    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length > 0) {
      return regs[0];
    }

    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), timeoutMs)
    );
    return await Promise.race([readyPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export async function getSystemNotificationStatus(): Promise<SystemNotificationStatus> {
  if (isNativeAndroidApp()) {
    try {
      const res = await KOTVNotifications.checkPermissions();
      const permission: SystemNotificationPermission =
        res.display === 'granted'
          ? 'granted'
          : res.display === 'denied'
            ? 'denied'
            : 'default';
      return {
        supported: true,
        permission,
        mode: 'native-android',
        webPushSubscribed: permission === 'granted',
      };
    } catch {
      return {
        supported: true,
        permission: 'default',
        mode: 'native-android',
        webPushSubscribed: false,
      };
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      supported: false,
      permission: 'unsupported',
      mode: 'unsupported',
      webPushSubscribed: false,
    };
  }

  const permission = Notification.permission as SystemNotificationPermission;
  const hasSw = 'serviceWorker' in navigator;
  let webPushSubscribed = false;

  if (hasSw) {
    try {
      const reg = await getActiveSwRegistration(1200);
      if (reg && 'pushManager' in reg) {
        const sub = await reg.pushManager.getSubscription();
        webPushSubscribed = Boolean(sub);
      }
    } catch {
      webPushSubscribed = false;
    }
  }

  return {
    supported: true,
    permission,
    mode:
      hasSw && 'PushManager' in window
        ? 'web-push-sw'
        : 'desktop-notification',
    webPushSubscribed,
  };
}

export async function requestSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  if (isNativeAndroidApp()) {
    try {
      const res = await KOTVNotifications.requestPermissions();
      if (res.display === 'granted') return 'granted';
      if (res.display === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'denied';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result as SystemNotificationPermission;
  } catch {
    return 'denied';
  }
}

export async function openSystemNotificationSettings(): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await KOTVNotifications.openSystemNotificationSettings();
  } catch {
    // Ignore unsupported platform calls
  }
}

export async function showAndroidSystemNotification(
  payload: SystemNotificationPayload
): Promise<boolean> {
  const title = payload.title || 'Kakumiro Online TV';
  const body = payload.body || 'New live broadcast update available.';
  const category = payload.category || 'live';
  const channelId = payload.channelId || '';
  const tag = payload.id || `kotv-${category}-${Date.now()}`;
  const url =
    payload.url ||
    (channelId ? `/?channel=${encodeURIComponent(channelId)}` : '/');

  if (isNativeAndroidApp()) {
    try {
      const check = await KOTVNotifications.checkPermissions();
      if (check.display !== 'granted') return false;
      await KOTVNotifications.showSystemNotification({
        id: tag,
        title,
        body,
        category,
        channelId,
      });
      return true;
    } catch {
      return false;
    }
  }

  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return false;
  }

  const swReg = await getActiveSwRegistration(1500);
  if (swReg && typeof swReg.showNotification === 'function') {
    const options: NotificationOptions & {
      renotify?: boolean;
      vibrate?: number[];
      actions?: { action: string; title: string }[];
    } = {
      body,
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: category === 'news',
      data: {
        url,
        channelId,
        category,
        alertId: tag,
      },
      actions: [
        { action: 'watch', title: channelId ? 'Watch Live' : 'Open App' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    try {
      await swReg.showNotification(title, options);
      return true;
    } catch {
      try {
        if (swReg.active) {
          swReg.active.postMessage({
            type: 'KOTV_SHOW_SYSTEM_NOTIFICATION',
            payload: { title, body, category, channelId, url, tag },
          });
          return true;
        }
      } catch {
        // Continue to desktop fallback below
      }
    }
  }

  // Fallback for desktop browsers without an active Service Worker (Android Chrome throws TypeError on new Notification)
  const isAndroidBrowser =
    typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  if (!isAndroidBrowser) {
    try {
      new Notification(title, {
        body,
        icon: '/pwa-icon-192.png',
        tag,
      });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function scheduleAndroidProgrammeReminder(params: {
  key: string;
  title: string;
  body: string;
  triggerAtMs: number;
  channelId?: string;
}): Promise<boolean> {
  if (!isNativeAndroidApp()) return false;
  try {
    const res = await KOTVNotifications.scheduleReminder({
      id: params.key,
      triggerAtMs: params.triggerAtMs,
      title: params.title,
      body: params.body,
      channelId: params.channelId || '',
    });
    return Boolean(res?.scheduled);
  } catch {
    return false;
  }
}

export async function cancelAndroidProgrammeReminder(
  key: string
): Promise<void> {
  if (!isNativeAndroidApp()) return;
  try {
    await KOTVNotifications.cancelReminder({ id: key });
  } catch {
    // Ignore native alarm cancellation errors
  }
}

export function subscribeNotificationTapListener(
  onChannelId: (channelId: string) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleSwMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; channelId?: string } | null;
    if (data?.type === 'KOTV_OPEN_CHANNEL' && data.channelId) {
      onChannelId(data.channelId);
    }
  };

  const handleNativeEvent = (event: Event) => {
    const custom = event as CustomEvent<{ channelId?: string }>;
    if (custom.detail?.channelId) {
      onChannelId(custom.detail.channelId);
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
  }
  window.addEventListener('kotv-open-channel', handleNativeEvent);

  if (isNativeAndroidApp()) {
    void KOTVNotifications.getPendingChannelId()
      .then((res) => {
        if (res?.channelId) {
          onChannelId(res.channelId);
        }
      })
      .catch(() => undefined);
  }

  return () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    }
    window.removeEventListener('kotv-open-channel', handleNativeEvent);
  };
}
