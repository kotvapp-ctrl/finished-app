/* Kakumiro Online TV Android & Web System Notification Worker Handler */
const KOTV_ICON = '/pwa-icon-192.png';
const KOTV_BADGE = '/pwa-icon-192.png';

function buildNotificationOptions(payload) {
  const channelId = payload.channelId || '';
  const targetUrl =
    payload.url || (channelId ? `/?channel=${encodeURIComponent(channelId)}` : '/');
  const category = payload.category || 'live';
  const tag = payload.tag || payload.alertId || `kotv-${category}-${Date.now()}`;

  return {
    body: payload.body || 'New live broadcast update available.',
    icon: payload.icon || KOTV_ICON,
    badge: payload.badge || KOTV_BADGE,
    tag,
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: category === 'news',
    timestamp: Date.now(),
    data: {
      url: targetUrl,
      channelId,
      category,
      alertId: payload.alertId || '',
    },
    actions: [
      { action: 'watch', title: channelId ? 'Watch Live' : 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let parsed = {};
  try {
    parsed = event.data.json();
  } catch {
    try {
      parsed = { body: event.data.text() };
    } catch {
      parsed = {};
    }
  }

  // Skip duplicating FCM compat payload when FCM compat already displays it
  if (parsed && parsed.from && parsed.notification && self.__kotvFcmCompatActive) {
    return;
  }

  const notif = parsed.notification || {};
  const data = parsed.data || {};
  const title = notif.title || parsed.title || data.title || 'Kakumiro Online TV';
  const body =
    notif.body || parsed.body || data.body || 'New live broadcast update available.';
  const channelId = data.channelId || parsed.channelId || '';
  const alertId = data.alertId || parsed.alertId || '';
  const category = data.category || parsed.category || 'live';
  const url =
    (parsed.fcmOptions && parsed.fcmOptions.link) ||
    data.url ||
    parsed.url ||
    (channelId ? `/?channel=${encodeURIComponent(channelId)}` : '/');

  event.waitUntil(
    self.registration.showNotification(
      title,
      buildNotificationOptions({ title, body, channelId, alertId, category, url })
    )
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'KOTV_SHOW_SYSTEM_NOTIFICATION' && msg.payload) {
    const title = msg.payload.title || 'Kakumiro Online TV';
    event.waitUntil(
      self.registration.showNotification(title, buildNotificationOptions(msg.payload))
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = (event.notification && event.notification.data) || {};
  const targetUrl = data.url || '/';
  const channelId = data.channelId || '';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus();
            if (channelId && typeof client.postMessage === 'function') {
              client.postMessage({
                type: 'KOTV_OPEN_CHANNEL',
                channelId,
                url: targetUrl,
              });
            } else if ('navigate' in client && targetUrl !== '/') {
              return client.navigate(targetUrl);
            }
            return client;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
