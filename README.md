# Kakumiro Online TV

Live television, visual radio, interactive TV guide, movies, breaking news, local artist showcases, and catch-up streaming for **Kakumiro Online TV** — built with React, Vite, Firebase, Express, and Capacitor Android (`com.kakumiro.onlinetv`).

---

## Android App Downloads (APK & Google Play AAB)

Every push to `main` or `master` runs the automated GitHub Actions build pipeline ([`publish-apk.yml`](.github/workflows/publish-apk.yml)) to compile, verify, and publish both Android packages:

- **Direct Mobile Testing APK (`app-debug.apk`)** — Download and install directly on an Android phone for testing:
  `https://github.com/kotvapp-ctrl/kakumiro-online-tv-app/releases/latest/download/app-debug.apk`
- **Google Play Console App Bundle (`app-release.aab`)** — Mandatory bundle format for Google Play Console upload:
  `https://github.com/kotvapp-ctrl/kakumiro-online-tv-app/releases/latest/download/app-release.aab`
- **Source Folder Output (`android-release/`)** — Compiled artifacts (`app-debug.apk`, `app-release.aab`, SHA-256 checksums, and `BUILD_INFO.txt`) are also staged in `android-release/` and attached as workflow artifacts (`kakumiro-online-tv-android-release`).

### Signing the `.aab` for Google Play Console

Add these four GitHub repository secrets (**Settings → Secrets and variables → Actions**) before pushing so CI signs `app-release.aab` automatically with your permanent Play Console upload keystore:

- `ANDROID_KEYSTORE_BASE64` — Base64-encoded `.jks` / `.keystore` file
- `ANDROID_KEYSTORE_PASSWORD` — Keystore password
- `ANDROID_KEY_ALIAS` — Upload key alias
- `ANDROID_KEY_PASSWORD` — Key password

To compile both files locally on a machine with Node.js 22, JDK 21, and the Android SDK:

```bash
npm install
./scripts/build-android-release.sh
```

---

## Project Features

### Live TV, Radio & Streaming Player
- **Multi-Format Playback**: Supports HLS live streams (`.m3u8` via `hls.js`), direct MP4/WebM/MOV media, MP3/AAC/Icecast audio radio, and web embeds (YouTube, Vimeo, Twitch, iframe) with automatic format detection and `/api/stream/probe` / `/api/stream/hls` / `/api/stream/relay` server support.
- **Live Viewer Counts**: Real-time per-channel viewer counters synced via Firebase Realtime Database.
- **Interactive Stream Chat**: Live channel chat with message likes/reactions, sender following, admin moderation, and automatic offline sync queueing when disconnected.
- **Personalization**: Favorites, Continue Watching history, Autoplay, Data Saver mode, and Remember Last Channel playback settings.

### TV Guide, Reminders & Push Notifications
- **Live Broadcast Clock & EPG**: Network-synced TV Guide schedule (`/api/time`) showing currently airing and upcoming programmes across channels.
- **Native Android & Web Push Notifications**: Scheduled programme start alarms (`KOTVReminderReceiver` on Android), Web Push (VAPID), and Firebase Cloud Messaging (FCM) background alerts by topic (`Breaking News`, `Live Sports`, `TV Guide Updates`, `Now Streaming Live`).
- **Station Updates & Alerts Panel**: Unified alert drawer and toast notifications with one-tap deep-linking straight into the target channel.

### Entertainment, News & Local Talent
- **Movies Catalog**: Filterable on-demand movies (`Action`, `Horror`, `Adventure`, `Bunyoro Films`, `Series`, `Thriller`, `Drama`, `Comedy`) with automatic poster fallback artwork.
- **TV Archive & Podcasts**: Catch-up programme replays and audio/video podcast episodes.
- **Breaking News**: Categorized station news (`Breaking`, `Politics`, `Sports`, `Business`, `Community`, `Entertainment`).
- **Local Artists**: Featured Bunyoro and Ugandan artist profiles across `Afrobeat`, `Gospel`, `Kadongo Kamu`, `Hip Hop & Rap`, `Traditional`, `RnB & Soul`, and `Dancehall`.

### Admin Broadcast Control Center & Cloud Vault
- **Live Catalog Management**: Full admin dashboard to create, edit, reorder, and delete channels, TV guide slots, home screen sections, spotlight hero slides, promo banners, movies, archive items, news articles, and artists.
- **Media Library & Thumbnail Studio**: Extract frames directly from video files, auto-fetch remote thumbnails (`/api/media/thumbnail`), and crop/cut out custom artwork (`ThumbnailCutoutModal`).
- **Chunked Cloud Storage Vault**: Upload documents, images, audio, and video into Firestore chunked vault storage (`vault://`) and publish public Station Documents for viewer download under **More**.
- **Cloud Backups, User Directory & Diagnostics**: Export/restore full catalog backups, inspect signed-in user activity, dispatch live push broadcasts, and run Firebase/RTDB/Storage health diagnostics.

### Offline Support & Mobile App Experience
- **Offline-Ready PWA & Firestore Persistence**: Multi-tab `persistentLocalCache` Firestore persistence, offline indicator, queued offline preference/chat sync, and Workbox service worker caching for fast mobile launches.
- **Android Native Shell**: Capacitor Android integration (`com.kakumiro.onlinetv`) with notification permissions, reminder broadcast receiver, and direct-install APK + Play Store AAB build support.

---

## Local Web Development

```bash
npm install
npm run dev
```

Runs the Express + Vite server on `http://localhost:3000`. See [`.env.example`](.env.example) for optional Firebase VAPID, Realtime Database, and server push environment variables.
