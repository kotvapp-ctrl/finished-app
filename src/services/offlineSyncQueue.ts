import { ChatMessage, UserLoginEvent } from '../types/broadcast';

const QUEUE_STORAGE_KEY = 'kotv_offline_sync_queue_v1';
const BACKUP_DIRTY_KEY = 'kotv_offline_backup_dirty_v1';

export type OfflineSyncItem =
  | {
      kind: 'chat_send';
      id: string;
      queuedAtMs: number;
      message: ChatMessage;
    }
  | {
      kind: 'chat_like';
      id: string;
      queuedAtMs: number;
      messageId: string;
      delta: 1 | -1;
    }
  | {
      kind: 'chat_delete';
      id: string;
      queuedAtMs: number;
      messageId: string;
    }
  | {
      kind: 'login_event';
      id: string;
      queuedAtMs: number;
      event: UserLoginEvent;
    };

export function readOfflineSyncQueue(): OfflineSyncItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineSyncItem[]) : [];
  } catch {
    return [];
  }
}

function writeOfflineSyncQueue(items: OfflineSyncItem[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export function enqueueOfflineSyncItem(item: OfflineSyncItem): OfflineSyncItem[] {
  let queue = readOfflineSyncQueue();

  if (item.kind === 'chat_send') {
    const filtered = queue.filter(
      (q) => !(q.kind === 'chat_send' && q.message.id === item.message.id)
    );
    queue = [...filtered, item];
  } else if (item.kind === 'chat_delete') {
    const hadUnsyncedSend = queue.some(
      (q) => q.kind === 'chat_send' && q.message.id === item.messageId
    );
    queue = queue.filter(
      (q) =>
        !(
          (q.kind === 'chat_send' && q.message.id === item.messageId) ||
          (q.kind === 'chat_like' && q.messageId === item.messageId) ||
          (q.kind === 'chat_delete' && q.messageId === item.messageId)
        )
    );
    if (!hadUnsyncedSend) {
      queue = [...queue, item];
    }
  } else if (item.kind === 'chat_like') {
    const unsyncedIdx = queue.findIndex(
      (q) => q.kind === 'chat_send' && q.message.id === item.messageId
    );
    if (unsyncedIdx >= 0) {
      const target = queue[unsyncedIdx];
      if (target.kind === 'chat_send') {
        target.message = {
          ...target.message,
          likes: Math.max(0, target.message.likes + item.delta),
          likedByMe: item.delta > 0,
        };
      }
    } else {
      queue = [...queue, item];
    }
  } else if (item.kind === 'login_event') {
    const filtered = queue.filter(
      (q) => !(q.kind === 'login_event' && q.id === item.id)
    );
    queue = [...filtered, item];
  }

  writeOfflineSyncQueue(queue);
  return queue;
}

export function removeOfflineSyncItem(id: string): OfflineSyncItem[] {
  const next = readOfflineSyncQueue().filter((q) => q.id !== id);
  writeOfflineSyncQueue(next);
  return next;
}

export function replaceOfflineSyncQueue(items: OfflineSyncItem[]): void {
  writeOfflineSyncQueue(items);
}

export function isOfflineBackupDirty(): boolean {
  try {
    return localStorage.getItem(BACKUP_DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOfflineBackupDirty(dirty: boolean): void {
  try {
    if (dirty) {
      localStorage.setItem(BACKUP_DIRTY_KEY, '1');
    } else {
      localStorage.removeItem(BACKUP_DIRTY_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function mergeChatMessagesWithOfflineQueue(
  remoteMessages: ChatMessage[],
  prevLocalMessages: ChatMessage[],
  queue: OfflineSyncItem[]
): ChatMessage[] {
  const likedIds = new Set(
    prevLocalMessages.filter((m) => m.likedByMe).map((m) => m.id)
  );
  const deletedIds = new Set(
    queue.filter((q) => q.kind === 'chat_delete').map((q) => q.messageId)
  );
  const likeDeltaById = new Map<string, number>();
  for (const q of queue) {
    if (q.kind === 'chat_like') {
      likeDeltaById.set(
        q.messageId,
        (likeDeltaById.get(q.messageId) || 0) + q.delta
      );
    }
  }

  const mergedMap = new Map<string, ChatMessage>();
  for (const m of remoteMessages) {
    if (deletedIds.has(m.id)) continue;
    const queuedDelta = likeDeltaById.get(m.id) || 0;
    mergedMap.set(m.id, {
      ...m,
      likes: Math.max(0, m.likes + queuedDelta),
      likedByMe: likedIds.has(m.id),
      pendingSync: false,
    });
  }

  for (const q of queue) {
    if (q.kind !== 'chat_send') continue;
    if (deletedIds.has(q.message.id)) continue;
    if (!mergedMap.has(q.message.id)) {
      mergedMap.set(q.message.id, {
        ...q.message,
        likedByMe: likedIds.has(q.message.id) || Boolean(q.message.likedByMe),
        pendingSync: true,
      });
    }
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => (a.timestampMs || 0) - (b.timestampMs || 0)
  );
}
