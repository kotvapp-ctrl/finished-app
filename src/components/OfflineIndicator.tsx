import { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(!isOnline);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setJustReconnected(false);
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setJustReconnected(true);
      const timer = window.setTimeout(() => setJustReconnected(false), 3800);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !justReconnected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-[52px] md:top-16 z-20 border-b px-4 py-2 text-xs font-medium transition-colors ${
        isOnline
          ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100'
          : 'bg-[#1f1a10]/95 border-[#ffd21f]/40 text-[#f5f4f8]'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center gap-2 min-w-0">
        {isOnline ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-[#ffd21f] shrink-0" />
        )}
        <span className="truncate">
          {isOnline
            ? 'Back online — queued logins, chats, and updates synced to Firebase.'
            : 'No internet connection — queued chats and logins will sync once reconnected.'}
        </span>
      </div>
    </div>
  );
}
