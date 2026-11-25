import { useCallback, useEffect, useRef, useState } from 'react';

export interface NetworkTimeState {
  now: Date;
  isOnline: boolean;
  isSynced: boolean;
  lastSyncedAt: Date | null;
  offsetMs: number;
  syncNow: () => Promise<void>;
}

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function useNetworkTime(autoTimeSync: boolean): NetworkTimeState {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offsetMs, setOffsetMs] = useState<number>(0);
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const offsetRef = useRef<number>(0);
  const syncingRef = useRef<boolean>(false);

  const syncNow = useCallback(async () => {
    if (!autoTimeSync) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      return;
    }
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      let resolvedOffset = offsetRef.current;
      let verifiedOnline = false;

      // 1. Check 24/7 Cloud Backend authoritative /api/time endpoint first
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3500);
      const t0 = performance.now();

      try {
        const res = await fetch(
          `${window.location.origin}/api/time?t=${Date.now()}`,
          {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          }
        );
        const t1 = performance.now();
        if (res.ok) {
          const data = (await res.json()) as { unixMs?: number };
          if (typeof data.unixMs === 'number') {
            const halfRtt = Math.round((t1 - t0) / 2);
            resolvedOffset = data.unixMs + halfRtt - Date.now();
            verifiedOnline = true;
          }
        }
        if (!verifiedOnline) {
          const headerDate = res.headers.get('date');
          if (headerDate) {
            const parsed = Date.parse(headerDate);
            if (!Number.isNaN(parsed)) {
              const halfRtt = Math.round((t1 - t0) / 2);
              resolvedOffset = parsed + halfRtt - Date.now();
              verifiedOnline = true;
            }
          }
        }
      } catch {
        // Ignore network error, try fallback if still online
      } finally {
        window.clearTimeout(timeoutId);
      }

      // 2. Fallback to public UTC time API if Date header wasn't exposed
      if (!verifiedOnline || resolvedOffset === offsetRef.current) {
        const apiController = new AbortController();
        const apiTimeout = window.setTimeout(() => apiController.abort(), 3000);
        const apiStart = performance.now();
        try {
          const apiRes = await fetch('https://worldtimeapi.org/api/ip', {
            cache: 'no-store',
            signal: apiController.signal,
          });
          if (apiRes.ok) {
            const data = (await apiRes.json()) as { unixtime?: number };
            if (typeof data.unixtime === 'number') {
              const apiEnd = performance.now();
              const halfRtt = Math.round((apiEnd - apiStart) / 2);
              resolvedOffset = data.unixtime * 1000 + halfRtt - Date.now();
              verifiedOnline = true;
            }
          }
        } catch {
          // Silent fallback to verified same-origin or local clock
        } finally {
          window.clearTimeout(apiTimeout);
        }
      }

      if (verifiedOnline || (typeof navigator !== 'undefined' && navigator.onLine)) {
        offsetRef.current = resolvedOffset;
        setOffsetMs(resolvedOffset);
        const syncedNow = new Date(Date.now() + resolvedOffset);
        setNow(syncedNow);
        setLastSyncedAt(syncedNow);
        setIsOnline(true);
        setIsSynced(true);
      }
    } finally {
      syncingRef.current = false;
    }
  }, [autoTimeSync]);

  // Listen to browser online/offline transitions & visibility focus
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (autoTimeSync) {
        void syncNow();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        autoTimeSync
      ) {
        void syncNow();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [autoTimeSync, syncNow]);

  // Initial sync & periodic refresh while online
  useEffect(() => {
    if (!autoTimeSync) {
      offsetRef.current = 0;
      setOffsetMs(0);
      setIsSynced(false);
      return;
    }

    if (typeof navigator === 'undefined' || navigator.onLine) {
      void syncNow();
    }

    const syncInterval = window.setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        void syncNow();
      }
    }, SYNC_INTERVAL_MS);

    return () => window.clearInterval(syncInterval);
  }, [autoTimeSync, syncNow]);

  // Continuous 1-second tick applying synced offset
  useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(new Date(Date.now() + (autoTimeSync ? offsetRef.current : 0)));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [autoTimeSync]);

  return {
    now,
    isOnline,
    isSynced,
    lastSyncedAt,
    offsetMs,
    syncNow,
  };
}
