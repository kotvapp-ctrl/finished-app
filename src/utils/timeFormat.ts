export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatClockWithSeconds(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const DEFAULT_SLOT_PLACEHOLDERS = new Set([
  '12:00 AM',
  '1:00 AM',
  '12:20 AM',
  '11:00 PM',
  '6:00 pm',
  '7:00 pm',
]);

export function isDefaultSlotPlaceholder(value?: string): boolean {
  if (!value) return true;
  return DEFAULT_SLOT_PLACEHOLDERS.has(value.trim());
}

export function getLiveHourSlots(now: Date) {
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const nextHour = new Date(currentHour.getTime() + 60 * 60 * 1000);
  const lateHour = new Date(currentHour.getTime() + 2 * 60 * 60 * 1000);

  const minutes = now.getMinutes();
  const progressPercent = Math.min(98, Math.max(4, Math.round((minutes / 60) * 100)));
  const minutesRemaining = Math.max(1, 60 - minutes);

  return {
    currentHourLabel: formatClockTime(currentHour),
    nextHourLabel: formatClockTime(nextHour),
    lateHourLabel: formatClockTime(lateHour),
    progressPercent,
    minutesRemaining,
  };
}

export function formatRelativeChatTime(
  timestampMs: number | undefined,
  fallback: string,
  now: Date
): string {
  if (!timestampMs) return fallback;
  const diffSec = Math.max(0, Math.floor((now.getTime() - timestampMs) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return formatClockTime(new Date(timestampMs));
}

export function parseScheduleTimeToMinutes(label?: string): number | null {
  if (!label) return null;
  const trimmed = label.trim().toLowerCase();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

