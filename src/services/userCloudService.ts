import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { type User } from 'firebase/auth';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import {
  db,
  handleFirestoreError,
  OperationType,
  probeFirebaseStorageBucket,
  storage,
} from '../firebase';
import {
  CloudFileCategory,
  ContinueWatchingItem,
  PlaybackSettings,
  UserBackupSnapshot,
  UserCloudFile,
  UserProfile,
} from '../types/broadcast';
import { detectCloudFileCategory } from './cloudStorage';
import { compressImageFileToDataUrl } from '../utils/mediaAssets';

const MAX_PERSONAL_VAULT_BYTES = 450_000;
const MAX_PERSONAL_URL_LENGTH = 650_000;

function sanitizeUid(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
}

function sanitizeContinueWatchingForBackup(
  items: ContinueWatchingItem[]
): ContinueWatchingItem[] | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const result: ContinueWatchingItem[] = [];
  for (const item of items.slice(0, 5)) {
    if (!item || !item.id || !item.channelId || !item.title) continue;
    const safePoster =
      item.posterPath &&
      !item.posterPath.startsWith('data:') &&
      item.posterPath.length <= 1000
        ? item.posterPath.trim()
        : undefined;
    const entry: ContinueWatchingItem = {
      id: item.id.slice(0, 160),
      kind: item.kind === 'movie' ? 'movie' : 'channel',
      channelId: item.channelId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128),
      channelName: (item.channelName || 'Channel').slice(0, 80),
      brand: item.brand || 'default',
      title: item.title.slice(0, 140),
      playedAtMs:
        typeof item.playedAtMs === 'number' && item.playedAtMs > 0
          ? item.playedAtMs
          : Date.now(),
    };
    if (item.subtitle) entry.subtitle = item.subtitle.slice(0, 160);
    if (safePoster) entry.posterPath = safePoster;
    if (item.overrideStreamUrl) {
      entry.overrideStreamUrl = item.overrideStreamUrl.slice(0, 1000);
    }
    if (item.overrideStreamType) {
      entry.overrideStreamType = item.overrideStreamType;
    }
    result.push(entry);
  }
  return result.length > 0 ? result : undefined;
}

export async function createUserCloudBackup(params: {
  user: User;
  label: string;
  profile: UserProfile;
  favorites: Set<string>;
  reminders: Set<string>;
  followedSenders: Set<string>;
  settings: PlaybackSettings;
  continueWatching: ContinueWatchingItem[];
  offlineSavedTitles?: string[];
}): Promise<UserBackupSnapshot> {
  const {
    user,
    label,
    profile,
    favorites,
    reminders,
    followedSenders,
    settings,
    continueWatching,
    offlineSavedTitles = [],
  } = params;

  const uid = sanitizeUid(user.uid);
  const backupId = `ubkp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanContinue = sanitizeContinueWatchingForBackup(continueWatching);
  const cleanOfflineTitles = offlineSavedTitles
    .map((t) => t.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 100);

  const safeFavorites = Array.from(favorites)
    .map((f) => f.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 100);
  const safeReminders = Array.from(reminders)
    .map((r) => r.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 200);
  const safeFollowed = Array.from(followedSenders)
    .map((s) => s.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 200);

  const safePlan: UserProfile['plan'] =
    profile.plan === 'Plus' || profile.plan === 'Family' ? profile.plan : 'Free';

  const basePayload = {
    id: backupId,
    uid,
    label: label.trim().slice(0, 120) || 'My Account & Offline Backup',
    displayName:
      (profile.displayName || user.displayName || 'Viewer')
        .trim()
        .slice(0, 60) || 'Viewer',
    plan: safePlan,
    favorites: safeFavorites,
    reminders: safeReminders,
    followedSenders: safeFollowed,
    settings: {
      autoplay: Boolean(settings.autoplay),
      dataSaver: Boolean(settings.dataSaver),
      rememberLastChannel: Boolean(settings.rememberLastChannel),
    },
    ...(cleanContinue ? { continueWatching: cleanContinue } : {}),
    ...(cleanOfflineTitles.length > 0
      ? { offlineSavedTitles: cleanOfflineTitles }
      : {}),
    createdAt: new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    timestampMs: Date.now(),
  };

  const sizeBytes = Math.max(2, JSON.stringify(basePayload).length);
  const snapshot: UserBackupSnapshot = {
    ...basePayload,
    sizeBytes,
  };

  try {
    await setDoc(doc(db, 'users', uid, 'backups', backupId), {
      ...snapshot,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `users/${uid}/backups/${backupId}`
    );
  }

  return snapshot;
}

export function subscribeUserCloudBackups(
  uid: string,
  onBackups: (backups: UserBackupSnapshot[]) => void
): Unsubscribe {
  const cleanUid = sanitizeUid(uid);
  return onSnapshot(
    query(
      collection(db, 'users', cleanUid, 'backups'),
      where('uid', '==', cleanUid)
    ),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as UserBackupSnapshot)
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      onBackups(list);
    },
    (err) =>
      handleFirestoreError(err, OperationType.LIST, `users/${cleanUid}/backups`)
  );
}

export async function deleteUserCloudBackup(
  uid: string,
  backupId: string
): Promise<void> {
  const cleanUid = sanitizeUid(uid);
  try {
    await deleteDoc(doc(db, 'users', cleanUid, 'backups', backupId));
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `users/${cleanUid}/backups/${backupId}`
    );
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read file bytes.'));
    };
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80) || 'file'
  );
}

export async function uploadUserPersonalCloudFile(params: {
  user: User;
  file: File;
  description?: string;
  onProgress?: (pct: number) => void;
}): Promise<{ record: UserCloudFile; note: string }> {
  const { user, file, description, onProgress } = params;
  const uid = sanitizeUid(user.uid);
  const fileId = `ufile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const category = detectCloudFileCategory(file);
  const mimeType = (file.type || 'application/octet-stream').slice(0, 120);
  const cleanName = file.name.trim().slice(0, 160) || `file-${Date.now()}`;
  const createdAt = new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const timestampMs = Date.now();

  onProgress?.(10);

  let bucketReady = false;
  if (storage) {
    bucketReady = await probeFirebaseStorageBucket();
  }

  if (storage && bucketReady) {
    const storagePath = `users/${uid}/${fileId}-${sanitizeFileName(cleanName)}`;
    const fileRef = storageRef(storage, storagePath);
    try {
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, file, {
          contentType: mimeType,
        });
        task.on(
          'state_changed',
          (snap) => {
            if (snap.totalBytes > 0) {
              const pct = Math.min(
                95,
                Math.max(
                  15,
                  Math.round((snap.bytesTransferred / snap.totalBytes) * 90)
                )
              );
              onProgress?.(pct);
            }
          },
          (err) => reject(err),
          () => {
            getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
          }
        );
      });

      const record: UserCloudFile = {
        id: fileId,
        uid,
        name: cleanName,
        category,
        mimeType,
        sizeBytes: file.size,
        url: downloadUrl.slice(0, MAX_PERSONAL_URL_LENGTH),
        storagePath: storagePath.slice(0, 240),
        storageBackend: 'firebase-storage',
        ...(description?.trim()
          ? { description: description.trim().slice(0, 400) }
          : {}),
        createdAt,
        timestampMs,
      };

      await setDoc(doc(db, 'users', uid, 'cloudFiles', fileId), {
        ...record,
        serverCreatedAt: serverTimestamp(),
      });
      onProgress?.(100);
      return {
        record,
        note: `"${cleanName}" uploaded to your personal Firebase Cloud Storage.`,
      };
    } catch {
      // Fall through to Firestore Vault
    }
  }

  if (category === 'image') {
    onProgress?.(40);
    const compressedUrl = await compressImageFileToDataUrl(file, 420_000);
    const record: UserCloudFile = {
      id: fileId,
      uid,
      name: cleanName,
      category: 'image',
      mimeType: 'image/jpeg',
      sizeBytes: file.size,
      url: compressedUrl,
      storageBackend: 'firestore-vault',
      ...(description?.trim()
        ? { description: description.trim().slice(0, 400) }
        : {}),
      createdAt,
      timestampMs,
    };
    await setDoc(doc(db, 'users', uid, 'cloudFiles', fileId), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
    onProgress?.(100);
    return {
      record,
      note: `"${cleanName}" saved to your personal Firestore Cloud Vault.`,
    };
  }

  if (file.size > MAX_PERSONAL_VAULT_BYTES) {
    throw new Error(
      'Direct uploads without an active Firebase Storage bucket are limited to 450 KB (or any image photo). For large videos/files, paste a cloud link below.'
    );
  }

  onProgress?.(45);
  const dataUrl = await readFileAsDataUrl(file);
  if (dataUrl.length > MAX_PERSONAL_URL_LENGTH) {
    throw new Error(
      'Encoded file exceeds personal Cloud Vault limit (650 KB). Use an external cloud link below.'
    );
  }

  const record: UserCloudFile = {
    id: fileId,
    uid,
    name: cleanName,
    category,
    mimeType,
    sizeBytes: file.size,
    url: dataUrl,
    storageBackend: 'firestore-vault',
    ...(description?.trim()
      ? { description: description.trim().slice(0, 400) }
      : {}),
    createdAt,
    timestampMs,
  };

  try {
    await setDoc(doc(db, 'users', uid, 'cloudFiles', fileId), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `users/${uid}/cloudFiles/${fileId}`
    );
  }

  onProgress?.(100);
  return {
    record,
    note: `"${cleanName}" saved to your personal Firestore Cloud Vault.`,
  };
}

export async function registerUserExternalCloudFile(params: {
  user: User;
  name: string;
  url: string;
  category: CloudFileCategory;
  description?: string;
}): Promise<UserCloudFile> {
  const uid = sanitizeUid(params.user.uid);
  const fileId = `uext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = params.name.trim().slice(0, 160) || 'My Cloud Link';
  const cleanUrl = params.url.trim().slice(0, MAX_PERSONAL_URL_LENGTH);
  if (!cleanUrl) {
    throw new Error('Enter a valid file or stream URL.');
  }
  const mimeMap: Record<CloudFileCategory, string> = {
    video: 'video/mp4',
    image: 'image/jpeg',
    audio: 'audio/mpeg',
    document: 'application/pdf',
  };

  const record: UserCloudFile = {
    id: fileId,
    uid,
    name: cleanName,
    category: params.category,
    mimeType: mimeMap[params.category],
    sizeBytes: 0,
    url: cleanUrl,
    storageBackend: 'external-url',
    ...(params.description?.trim()
      ? { description: params.description.trim().slice(0, 400) }
      : {}),
    createdAt: new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    timestampMs: Date.now(),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'cloudFiles', fileId), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `users/${uid}/cloudFiles/${fileId}`
    );
  }

  return record;
}

export function subscribeUserPersonalCloudFiles(
  uid: string,
  onFiles: (files: UserCloudFile[]) => void
): Unsubscribe {
  const cleanUid = sanitizeUid(uid);
  return onSnapshot(
    query(
      collection(db, 'users', cleanUid, 'cloudFiles'),
      where('uid', '==', cleanUid)
    ),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as UserCloudFile)
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      onFiles(list);
    },
    (err) =>
      handleFirestoreError(
        err,
        OperationType.LIST,
        `users/${cleanUid}/cloudFiles`
      )
  );
}

export async function deleteUserPersonalCloudFile(
  file: UserCloudFile
): Promise<void> {
  const cleanUid = sanitizeUid(file.uid);
  if (storage && file.storagePath) {
    try {
      await deleteObject(storageRef(storage, file.storagePath));
    } catch {
      // Ignore missing storage object
    }
  }
  try {
    await deleteDoc(doc(db, 'users', cleanUid, 'cloudFiles', file.id));
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `users/${cleanUid}/cloudFiles/${file.id}`
    );
  }
}
