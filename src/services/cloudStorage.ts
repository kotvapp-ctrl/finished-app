import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
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
import { CloudFileCategory, CloudFileRecord } from '../types/broadcast';
import { compressImageFileToDataUrl } from '../utils/mediaAssets';

const VAULT_BLOB_CACHE = new Map<string, string>();
const MAX_VAULT_FILE_BYTES = 3_500_000; // 3.5 MB when falling back to Firestore Vault chunks
const VAULT_SLICE_CHARS = 550_000;

export function detectCloudFileCategory(file: {
  name: string;
  type?: string;
}): CloudFileCategory {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  if (
    mime.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|mkv|ogv|m3u8)(\?|#|$)/i.test(name)
  ) {
    return 'video';
  }
  if (
    mime.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|gif|svg|bmp)(\?|#|$)/i.test(name)
  ) {
    return 'image';
  }
  if (
    mime.startsWith('audio/') ||
    /\.(mp3|aac|ogg|opus|wav|flac|m4a)(\?|#|$)/i.test(name)
  ) {
    return 'audio';
  }
  return 'document';
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file bytes.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function inferMimeType(file: File, category: CloudFileCategory): string {
  if (file.type?.trim()) return file.type.trim().slice(0, 120);
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (category === 'video') return 'video/mp4';
  if (category === 'audio') return 'audio/mpeg';
  if (category === 'image') return 'image/jpeg';
  return 'application/octet-stream';
}

function sanitizeStorageFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80) || 'file'
  );
}

export async function uploadMediaFileToCloud(params: {
  file: File;
  uid: string;
  description?: string;
  publicVisible?: boolean;
  onProgress?: (pct: number) => void;
}): Promise<{ record: CloudFileRecord; note: string }> {
  const { file, uid, description, publicVisible = true, onProgress } = params;
  const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const category = detectCloudFileCategory(file);
  const mimeType = inferMimeType(file, category);
  const createdAt = new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const timestampMs = Date.now();
  const cleanName = file.name.trim().slice(0, 160) || `upload-${timestampMs}`;

  onProgress?.(5);

  // 1. Try Firebase Cloud Storage first if bucket is provisioned
  let bucketAvailable = false;
  if (storage) {
    bucketAvailable = await probeFirebaseStorageBucket();
  }

  if (storage && bucketAvailable) {
    const folder =
      category === 'document' ? 'documents' : `${category}s`;
    const storagePath = `media/${folder}/${fileId}-${sanitizeStorageFileName(cleanName)}`;
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
                Math.max(10, Math.round((snap.bytesTransferred / snap.totalBytes) * 90))
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

      const record: CloudFileRecord = {
        id: fileId,
        name: cleanName,
        category,
        mimeType,
        sizeBytes: file.size,
        url: downloadUrl,
        storagePath,
        storageBackend: 'firebase-storage',
        publicVisible,
        description: description?.trim().slice(0, 400) || undefined,
        uploadedByUid: uid,
        createdAt,
        timestampMs,
      };

      await setDoc(doc(db, 'cloudFiles', fileId), {
        ...record,
        serverCreatedAt: serverTimestamp(),
      });
      onProgress?.(100);
      return {
        record,
        note: `"${cleanName}" uploaded to Firebase Cloud Storage.`,
      };
    } catch {
      // Fall through to Firestore Cloud Vault for <= 3.5 MB files if Storage rules reject upload
    }
  }

  // 2. Firestore Cloud Vault fallback (works immediately without Cloud Storage bucket setup)
  if (category === 'image') {
    onProgress?.(35);
    const compressedDataUrl = await compressImageFileToDataUrl(file, 420_000);
    const record: CloudFileRecord = {
      id: fileId,
      name: cleanName,
      category: 'image',
      mimeType: 'image/jpeg',
      sizeBytes: file.size,
      url: compressedDataUrl,
      storageBackend: 'firestore-vault',
      chunkCount: 0,
      publicVisible,
      description: description?.trim().slice(0, 400) || undefined,
      uploadedByUid: uid,
      createdAt,
      timestampMs,
    };
    await setDoc(doc(db, 'cloudFiles', fileId), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
    onProgress?.(100);
    return {
      record,
      note: bucketAvailable
        ? `"${cleanName}" saved to Firestore Vault (enable Storage rules for multi-GB bucket writes).`
        : `"${cleanName}" optimized and stored in Firestore Cloud Vault.`,
    };
  }

  if (file.size > MAX_VAULT_FILE_BYTES) {
    throw new Error(
      `Firebase Storage bucket is not active in Console yet, so direct uploads are capped at 3.5 MB in Firestore Vault. Enable Storage in Firebase Console for large videos or register an external cloud URL.`
    );
  }

  onProgress?.(25);
  const rawDataUrl = await readFileAsDataUrl(file);
  onProgress?.(50);

  if (rawDataUrl.length <= VAULT_SLICE_CHARS) {
    const record: CloudFileRecord = {
      id: fileId,
      name: cleanName,
      category,
      mimeType,
      sizeBytes: file.size,
      url: rawDataUrl,
      storageBackend: 'firestore-vault',
      chunkCount: 0,
      publicVisible,
      description: description?.trim().slice(0, 400) || undefined,
      uploadedByUid: uid,
      createdAt,
      timestampMs,
    };
    await setDoc(doc(db, 'cloudFiles', fileId), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
    onProgress?.(100);
    return {
      record,
      note: `"${cleanName}" stored in Firestore Cloud Vault.`,
    };
  }

  // Split into <= 550 KB chunks under /cloudFiles/{fileId}/chunks/{chunkId}
  const chunks: string[] = [];
  for (let i = 0; i < rawDataUrl.length; i += VAULT_SLICE_CHARS) {
    chunks.push(rawDataUrl.slice(i, i + VAULT_SLICE_CHARS));
  }
  if (chunks.length > 20) {
    throw new Error('File exceeds the 20-chunk Firestore Vault limit.');
  }

  const vaultUri = `vault://${fileId}`;
  const record: CloudFileRecord = {
    id: fileId,
    name: cleanName,
    category,
    mimeType,
    sizeBytes: file.size,
    url: vaultUri,
    storageBackend: 'firestore-vault',
    chunkCount: chunks.length,
    publicVisible,
    description: description?.trim().slice(0, 400) || undefined,
    uploadedByUid: uid,
    createdAt,
    timestampMs,
  };

  try {
    await setDoc(doc(db, 'cloudFiles', fileId), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
    for (let idx = 0; idx < chunks.length; idx += 1) {
      await setDoc(doc(db, 'cloudFiles', fileId, 'chunks', `chunk-${idx}`), {
        index: idx,
        data: chunks[idx],
      });
      onProgress?.(50 + Math.round(((idx + 1) / chunks.length) * 48));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `cloudFiles/${fileId}`);
  }

  onProgress?.(100);
  return {
    record,
    note: `"${cleanName}" chunked (${chunks.length} parts) and saved permanently in Firestore Cloud Vault.`,
  };
}

export async function registerExternalCloudFile(params: {
  name: string;
  url: string;
  category: CloudFileCategory;
  description?: string;
  publicVisible?: boolean;
  uid: string;
}): Promise<CloudFileRecord> {
  const fileId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = params.name.trim().slice(0, 160) || 'External Cloud File';
  const cleanUrl = params.url.trim().slice(0, 650_000);
  if (!cleanUrl) {
    throw new Error('Please enter a valid file or stream URL.');
  }
  const mimeMap: Record<CloudFileCategory, string> = {
    video: 'video/mp4',
    image: 'image/jpeg',
    audio: 'audio/mpeg',
    document: 'application/pdf',
  };
  const record: CloudFileRecord = {
    id: fileId,
    name: cleanName,
    category: params.category,
    mimeType: mimeMap[params.category],
    sizeBytes: 0,
    url: cleanUrl,
    storageBackend: 'external-url',
    publicVisible: params.publicVisible ?? true,
    description: params.description?.trim().slice(0, 400) || undefined,
    uploadedByUid: params.uid,
    createdAt: new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    timestampMs: Date.now(),
  };

  try {
    await setDoc(doc(db, 'cloudFiles', fileId), {
      ...record,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `cloudFiles/${fileId}`);
  }
  return record;
}

export async function deleteCloudFile(file: CloudFileRecord): Promise<void> {
  if (storage && file.storagePath) {
    try {
      await deleteObject(storageRef(storage, file.storagePath));
    } catch {
      // Ignore missing storage object if already removed or bucket disabled
    }
  }

  try {
    if ((file.chunkCount ?? 0) > 0) {
      const chunkSnap = await getDocs(
        collection(db, 'cloudFiles', file.id, 'chunks')
      );
      if (!chunkSnap.empty) {
        const batch = writeBatch(db);
        for (const d of chunkSnap.docs) {
          batch.delete(d.ref);
        }
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, 'cloudFiles', file.id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `cloudFiles/${file.id}`);
  }
}

export async function resolveCloudFilePlayableUrl(
  rawUrl?: string
): Promise<string> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('vault://')) {
    return trimmed;
  }

  const fileId = trimmed.slice('vault://'.length).trim();
  if (!fileId) return '';

  const cached = VAULT_BLOB_CACHE.get(fileId);
  if (cached) return cached;

  const snap = await getDocs(
    query(
      collection(db, 'cloudFiles', fileId, 'chunks'),
      orderBy('index', 'asc')
    )
  );
  if (snap.empty) {
    throw new Error('Stored media chunks could not be found in Firestore Vault.');
  }

  const joinedDataUrl = snap.docs
    .map((d) => String((d.data() as { data?: string }).data || ''))
    .join('');

  const res = await fetch(joinedDataUrl);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  VAULT_BLOB_CACHE.set(fileId, objectUrl);
  return objectUrl;
}

export function subscribeCloudFiles(
  onFiles: (files: CloudFileRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'cloudFiles'), orderBy('timestampMs', 'desc')),
    (snap) => {
      const files = snap.docs.map((d) => d.data() as CloudFileRecord);
      onFiles(files);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'cloudFiles')
  );
}
