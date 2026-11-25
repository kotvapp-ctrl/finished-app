import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { type User } from 'firebase/auth';
import {
  getDownloadURL,
  ref as storageRef,
  uploadString,
} from 'firebase/storage';
import {
  db,
  handleFirestoreError,
  OperationType,
  probeFirebaseStorageBucket,
  storage,
} from '../firebase';
import {
  AppConfig,
  ArchiveItem,
  BackupSnapshot,
  BroadcastAlert,
  Channel,
  GuideProgramme,
  HeroSlide,
  HomeConfig,
  MovieItem,
  PromoConfig,
} from '../types/broadcast';
import { seedCatalogToFirestore } from './firestoreSync';

export interface CatalogBackupPayload {
  version: number;
  exportedAtIso: string;
  projectId: string;
  channels: Channel[];
  guideSchedule: GuideProgramme[];
  heroSlides: HeroSlide[];
  movies: MovieItem[];
  archiveItems: ArchiveItem[];
  promo: PromoConfig;
  appConfig: AppConfig;
  homeConfig: HomeConfig;
  broadcastAlerts?: BroadcastAlert[];
}

export function buildBackupPayloadObject(catalog: {
  channels: Channel[];
  guideSchedule: GuideProgramme[];
  heroSlides: HeroSlide[];
  movies: MovieItem[];
  archiveItems: ArchiveItem[];
  promo: PromoConfig;
  appConfig: AppConfig;
  homeConfig: HomeConfig;
  broadcastAlerts?: BroadcastAlert[];
}): CatalogBackupPayload {
  return {
    version: 2,
    exportedAtIso: new Date().toISOString(),
    projectId: 'kakumiro-online-tv-16648',
    channels: catalog.channels,
    guideSchedule: catalog.guideSchedule,
    heroSlides: catalog.heroSlides,
    movies: catalog.movies,
    archiveItems: catalog.archiveItems,
    promo: catalog.promo,
    appConfig: catalog.appConfig,
    homeConfig: catalog.homeConfig,
    broadcastAlerts: catalog.broadcastAlerts || [],
  };
}

function compactPayloadForFirestore(
  payload: CatalogBackupPayload
): CatalogBackupPayload {
  const stripLargeDataUri = (val?: string) => {
    if (!val) return val;
    if (val.startsWith('data:') && val.length > 60_000) {
      return '';
    }
    return val;
  };
  return {
    ...payload,
    heroSlides: payload.heroSlides.map((s) => ({
      ...s,
      imagePath: stripLargeDataUri(s.imagePath) || '',
    })),
    movies: payload.movies.map((m) => ({
      ...m,
      posterPath: stripLargeDataUri(m.posterPath),
    })),
    promo: {
      ...payload.promo,
      imagePath: stripLargeDataUri(payload.promo.imagePath),
    },
  };
}

export async function createCloudBackup(params: {
  label: string;
  user: User;
  catalog: {
    channels: Channel[];
    guideSchedule: GuideProgramme[];
    heroSlides: HeroSlide[];
    movies: MovieItem[];
    archiveItems: ArchiveItem[];
    promo: PromoConfig;
    appConfig: AppConfig;
    homeConfig: HomeConfig;
    broadcastAlerts?: BroadcastAlert[];
  };
}): Promise<BackupSnapshot> {
  const { label, user, catalog } = params;
  const backupId = `bkp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const payload = buildBackupPayloadObject(catalog);
  const fullJson = JSON.stringify(payload);
  let firestoreJson = fullJson;

  if (firestoreJson.length > 760_000) {
    firestoreJson = JSON.stringify(compactPayloadForFirestore(payload));
  }
  if (firestoreJson.length > 790_000) {
    firestoreJson = firestoreJson.slice(0, 790_000);
  }

  let storageUrl: string | undefined;
  if (storage && (await probeFirebaseStorageBucket())) {
    try {
      const bkpRef = storageRef(storage, `backups/${backupId}.json`);
      await uploadString(bkpRef, fullJson, 'raw', {
        contentType: 'application/json',
      });
      storageUrl = await getDownloadURL(bkpRef);
    } catch {
      storageUrl = undefined;
    }
  }

  const snapshot: BackupSnapshot = {
    id: backupId,
    label: label.trim().slice(0, 140) || 'Manual Catalog Backup',
    createdByUid: user.uid,
    createdByEmail: (user.email || '').slice(0, 160),
    createdAt: new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    timestampMs: Date.now(),
    sizeBytes: fullJson.length,
    counts: {
      channels: catalog.channels.length,
      guideSlots: catalog.guideSchedule.length,
      heroSlides: catalog.heroSlides.length,
      movies: catalog.movies.length,
      archiveItems: catalog.archiveItems.length,
      alerts: (catalog.broadcastAlerts || []).length,
    },
    ...(storageUrl ? { storageUrl } : {}),
    snapshotJson: firestoreJson,
  };

  try {
    await setDoc(doc(db, 'backups', backupId), {
      ...snapshot,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `backups/${backupId}`);
  }

  return snapshot;
}

export async function deleteCloudBackup(backupId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'backups', backupId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `backups/${backupId}`);
  }
}

export function subscribeCloudBackups(
  onBackups: (backups: BackupSnapshot[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'backups'), orderBy('timestampMs', 'desc')),
    (snap) => {
      onBackups(snap.docs.map((d) => d.data() as BackupSnapshot));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'backups')
  );
}

export function exportBackupJsonDownload(
  catalog: Parameters<typeof buildBackupPayloadObject>[0],
  fileNamePrefix = 'kakumiro-tv-backup'
) {
  const payload = buildBackupPayloadObject(catalog);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${fileNamePrefix}-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackupJsonText(jsonText: string): CatalogBackupPayload {
  const parsed = JSON.parse(jsonText) as Partial<CatalogBackupPayload>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray(parsed.channels) ||
    parsed.channels.length === 0
  ) {
    throw new Error(
      'Invalid backup file. Must contain a valid "channels" array.'
    );
  }
  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    exportedAtIso: parsed.exportedAtIso || new Date().toISOString(),
    projectId: parsed.projectId || 'kakumiro-online-tv-16648',
    channels: parsed.channels,
    guideSchedule: Array.isArray(parsed.guideSchedule)
      ? parsed.guideSchedule
      : [],
    heroSlides: Array.isArray(parsed.heroSlides) ? parsed.heroSlides : [],
    movies: Array.isArray(parsed.movies) ? parsed.movies : [],
    archiveItems: Array.isArray(parsed.archiveItems) ? parsed.archiveItems : [],
    promo: parsed.promo as PromoConfig,
    appConfig: parsed.appConfig as AppConfig,
    homeConfig: parsed.homeConfig as HomeConfig,
    broadcastAlerts: Array.isArray(parsed.broadcastAlerts)
      ? parsed.broadcastAlerts
      : [],
  };
}

export async function restoreCatalogFromBackupPayload(
  payload: CatalogBackupPayload,
  fallbackDefaults: {
    promo: PromoConfig;
    appConfig: AppConfig;
    homeConfig: HomeConfig;
  }
) {
  await seedCatalogToFirestore({
    channels: payload.channels,
    guideSchedule: payload.guideSchedule,
    heroSlides: payload.heroSlides,
    movies: payload.movies,
    archiveItems: payload.archiveItems,
    promo: payload.promo || fallbackDefaults.promo,
    appConfig: payload.appConfig || fallbackDefaults.appConfig,
    homeConfig: payload.homeConfig || fallbackDefaults.homeConfig,
  });
}
