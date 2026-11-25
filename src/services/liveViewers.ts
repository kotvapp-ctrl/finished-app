import { useEffect, useState } from 'react';
import {
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
} from 'firebase/database';
import { rtdb } from '../firebase';

const HEARTBEAT_INTERVAL_MS = 45_000;
const STALE_VIEWER_MS = 5 * 60 * 1000;

function createSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `v_${crypto.randomUUID().replace(/-/g, '')}`;
    }
  } catch {
    // Fallback below
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const TAB_SESSION_ID = createSessionId();

export function sanitizeRtdbKey(key: string): string {
  return key.replace(/[.#$[\]/]/g, '_');
}

function countFreshViewers(rawChannelNode: unknown, nowMs: number): number {
  if (!rawChannelNode || typeof rawChannelNode !== 'object') return 0;
  let count = 0;
  for (const entry of Object.values(rawChannelNode as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { lastSeenAt?: unknown; active?: unknown };
    if (record.active === false) continue;
    if (
      typeof record.lastSeenAt === 'number' &&
      nowMs - record.lastSeenAt > STALE_VIEWER_MS
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}

/**
 * Registers the current viewer's real-time presence on a TV channel's active live stream
 * and returns the live viewer count from Firebase Realtime Database.
 */
export function useChannelLivePresence(
  channelId: string | null,
  enabled: boolean
): number {
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    if (!enabled || !channelId || !rtdb) {
      setViewerCount(0);
      return;
    }

    const db = rtdb;
    const safeChannelKey = sanitizeRtdbKey(channelId);
    const channelRef = ref(db, `liveViewers/${safeChannelKey}`);
    const viewerRef = ref(db, `liveViewers/${safeChannelKey}/${TAB_SESSION_ID}`);
    const connectedRef = ref(db, '.info/connected');

    let isDisposed = false;

    const writePresence = async () => {
      if (isDisposed) return;
      try {
        await onDisconnect(viewerRef).remove();
        await set(viewerRef, {
          active: true,
          joinedAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
        });
      } catch {
        // Ignore transient RTDB network/permission errors
      }
    };

    const unsubConnected = onValue(
      connectedRef,
      (snapshot) => {
        if (snapshot.val() === true) {
          void writePresence();
        }
      },
      () => {
        // Ignore RTDB connection listener errors
      }
    );

    const unsubCount = onValue(
      channelRef,
      (snapshot) => {
        setViewerCount(countFreshViewers(snapshot.val(), Date.now()));
      },
      () => {
        setViewerCount(0);
      }
    );

    void writePresence();

    const heartbeatTimer = window.setInterval(() => {
      void writePresence();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      isDisposed = true;
      window.clearInterval(heartbeatTimer);
      unsubConnected();
      unsubCount();
      void onDisconnect(viewerRef)
        .cancel()
        .catch(() => undefined);
      void remove(viewerRef).catch(() => undefined);
    };
  }, [channelId, enabled]);

  return viewerCount;
}

/**
 * Subscribes to live viewer counts across all TV channels from Firebase Realtime Database.
 */
export function useAllChannelViewerCounts(
  enabled = true
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!enabled || !rtdb) {
      setCounts({});
      return;
    }

    const rootRef = ref(rtdb, 'liveViewers');
    let latestRaw: unknown = null;

    const recompute = () => {
      if (!latestRaw || typeof latestRaw !== 'object') {
        setCounts({});
        return;
      }
      const nowMs = Date.now();
      const next: Record<string, number> = {};
      for (const [channelKey, node] of Object.entries(
        latestRaw as Record<string, unknown>
      )) {
        const count = countFreshViewers(node, nowMs);
        if (count > 0) {
          next[channelKey] = count;
        }
      }
      setCounts(next);
    };

    const unsub = onValue(
      rootRef,
      (snapshot) => {
        latestRaw = snapshot.val();
        recompute();
      },
      () => {
        setCounts({});
      }
    );

    const staleSweepTimer = window.setInterval(recompute, 60_000);

    return () => {
      window.clearInterval(staleSweepTimer);
      unsub();
    };
  }, [enabled]);

  return counts;
}
