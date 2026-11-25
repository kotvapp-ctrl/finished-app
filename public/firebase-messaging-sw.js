/* Firebase Cloud Messaging background service worker for closed-app push notifications */
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging-compat.js');
importScripts('/kotv-push-sw.js');

try {
  firebase.initializeApp({
    apiKey: 'AIzaSyDm5Kjuktu5nsVuKtb_R4_RBbucBBBx_6k',
    authDomain: 'kakumiro-online-tv-16648.firebaseapp.com',
    projectId: 'kakumiro-online-tv-16648',
    storageBucket: 'kakumiro-online-tv-16648.firebasestorage.app',
    messagingSenderId: '903936574383',
    appId: '1:903936574383:web:4aa8f7006a891e6007655a',
  });

  const messaging = firebase.messaging();
  self.__kotvFcmCompatActive = true;

  messaging.onBackgroundMessage((payload) => {
    const title =
      (payload.notification && payload.notification.title) ||
      (payload.data && payload.data.title) ||
      'Kakumiro Online TV';
    const body =
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      'New live broadcast update available.';
    const channelId = (payload.data && payload.data.channelId) || '';
    const link =
      (payload.fcmOptions && payload.fcmOptions.link) ||
      (channelId ? `/?channel=${encodeURIComponent(channelId)}` : '/');

    return self.registration.showNotification(title, {
      body,
      icon: '/pwa-icon-192.png',
      badge: '/pwa-icon-192.png',
      vibrate: [200, 100, 200],
      renotify: true,
      tag: (payload.data && payload.data.alertId) || 'kotv-live-alert',
      data: { url: link, channelId },
      actions: [
        { action: 'watch', title: channelId ? 'Watch Live' : 'Open App' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
  });
} catch {
  self.__kotvFcmCompatActive = false;
}
