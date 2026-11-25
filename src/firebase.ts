import { getApp, getApps, initializeApp, onLog, setLogLevel } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  type Firestore,
} from 'firebase/firestore';
import { getDatabase, get, ref, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const ADMIN_EMAIL = '97.1skyfm@gmail.com';
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIREBASE_STORAGE_BUCKET = firebaseConfig.storageBucket || '';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db: Firestore = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
          ignoreUndefinedProperties: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
})();

export const auth = getAuth(app);

export const storage: FirebaseStorage | null = (() => {
  try {
    if (!firebaseConfig.storageBucket) return null;
    const instance = getStorage(app, `gs://${firebaseConfig.storageBucket}`);
    instance.maxUploadRetryTime = 8000;
    return instance;
  } catch {
    return null;
  }
})();

const rtdbDatabaseUrl =
  (firebaseConfig as { databaseURL?: string }).databaseURL?.trim() ||
  (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined)?.trim() ||
  `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;

export const rtdb: Database | null = (() => {
  try {
    return rtdbDatabaseUrl ? getDatabase(app, rtdbDatabaseUrl) : null;
  } catch {
    return null;
  }
})();

setLogLevel('silent');
onLog(
  ({ level, message, args, type }) => {
    if (
      level === 'error' &&
      type === '@firebase/firestore' &&
      message.includes('Could not reach Cloud Firestore backend.')
    ) {
      console.warn(`[${new Date().toISOString()}]  ${type}:`, ...args);
      void verifyFirestoreConfigReachable().then((configValid) => {
        if (configValid === false) {
          console.error('Please check your Firebase configuration.');
        }
      });
      return;
    }

    const timestamp = new Date().toISOString();
    if (level === 'error') {
      console.error(`[${timestamp}]  ${type}:`, ...args);
    } else if (level === 'warn') {
      console.warn(`[${timestamp}]  ${type}:`, ...args);
    }
  },
  { level: 'warn' }
);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isVerifiedAdminUser(user: User | null): boolean {
  if (!user || !user.emailVerified) return false;
  return (user.email || '').toLowerCase() === ADMIN_EMAIL;
}

export async function checkAdminAllowlist(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (isVerifiedAdminUser(user)) return true;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithEmailPassword(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName?: string
) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const cleanName = (displayName || '').trim().slice(0, 60);
  if (cleanName) {
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => undefined);
  }
  await sendEmailVerification(cred.user).catch(() => undefined);
  return cred;
}

export async function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email.trim());
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) {
    throw new Error('Sign in first to send a verification email.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentAuthUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await reload(auth.currentUser);
  return auth.currentUser;
}

export async function signOutFirebase() {
  return signOut(auth);
}

export async function updateFirebaseDisplayName(displayName: string) {
  if (!auth.currentUser) return;
  const trimmed = displayName.trim().slice(0, 60);
  if (!trimmed) return;
  await updateProfile(auth.currentUser, { displayName: trimmed });
}

export async function probeFirebaseStorageBucket(): Promise<boolean> {
  const bucket = FIREBASE_STORAGE_BUCKET.trim();
  if (!bucket) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
        bucket
      )}/o?maxResults=1`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    // 200 (public list) or 401/403 (rules protected) means the bucket exists; 404 means not yet provisioned
    return res.status !== 404;
  } catch {
    return false;
  }
}

export interface FirebaseHealthReport {
  projectId: string;
  databaseId: string;
  storageBucket: string;
  firestoreConnected: boolean;
  catalogReadable: boolean;
  rtdbConnected: boolean;
  storageBucketReady: boolean;
  authEmail: string | null;
  authVerified: boolean;
  isAdmin: boolean;
  hostname: string;
  error?: string;
}

export async function runFirebaseDiagnostics(): Promise<FirebaseHealthReport> {
  const user = auth.currentUser;
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const report: FirebaseHealthReport = {
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    storageBucket: FIREBASE_STORAGE_BUCKET,
    firestoreConnected: false,
    catalogReadable: false,
    rtdbConnected: false,
    storageBucketReady: false,
    authEmail: user?.email || null,
    authVerified: Boolean(user?.emailVerified),
    isAdmin: await checkAdminAllowlist(user),
    hostname,
  };

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    report.firestoreConnected = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('the client is offline')) {
      report.firestoreConnected = true;
    } else {
      report.error = msg;
    }
  }

  try {
    await getDocs(query(collection(db, 'channels'), limit(1)));
    report.catalogReadable = true;
  } catch (err) {
    report.error =
      report.error || (err instanceof Error ? err.message : String(err));
  }

  if (rtdb) {
    try {
      const snap = await Promise.race([
        get(ref(rtdb, 'liveViewers')),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 3500)
        ),
      ]);
      report.rtdbConnected = snap !== null;
    } catch {
      report.rtdbConnected = false;
    }
  }

  report.storageBucketReady = await probeFirebaseStorageBucket();

  return report;
}

async function verifyFirestoreConfigReachable(): Promise<boolean | null> {
  if (
    !firebaseConfig.projectId ||
    firebaseConfig.projectId === 'remixed-project-id' ||
    !firebaseConfig.firestoreDatabaseId ||
    !firebaseConfig.apiKey
  ) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseConfig.projectId
    )}/databases/${encodeURIComponent(
      firebaseConfig.firestoreDatabaseId
    )}/documents/test/connection?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) return true;
    const text = await res.text().catch(() => '');
    if (res.status === 404 && text.includes('"NOT_FOUND"') && text.includes('Document ')) {
      return true;
    }
    if (res.status === 400 || res.status === 403 || res.status === 404) {
      return false;
    }
    return null;
  } catch {
    // Network unreachable / aborted — not a configuration error
    return null;
  }
}

let testConnectionInFlight: Promise<void> | null = null;

async function runTestConnection() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  const probe = () => getDocFromServer(doc(db, 'test', 'connection'));
  try {
    await probe();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      await new Promise((resolve) => setTimeout(resolve, 4500));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      try {
        await probe();
      } catch (retryError) {
        if (
          retryError instanceof Error &&
          retryError.message.includes('the client is offline')
        ) {
          const configValid = await verifyFirestoreConfigReachable();
          if (configValid === false) {
            console.error('Please check your Firebase configuration.');
          }
        }
      }
    }
  }
}

async function testConnection() {
  if (testConnectionInFlight) return testConnectionInFlight;
  testConnectionInFlight = runTestConnection().finally(() => {
    testConnectionInFlight = null;
  });
  return testConnectionInFlight;
}

if (typeof window !== 'undefined') {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    void disableNetwork(db).catch(() => undefined);
  }
  window.addEventListener('offline', () => {
    void disableNetwork(db).catch(() => undefined);
  });
  window.addEventListener('online', () => {
    void enableNetwork(db)
      .then(() => testConnection())
      .catch(() => undefined);
  });
}

void testConnection();
