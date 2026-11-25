import { Bell, BellRing, ChevronLeft, ChevronRight } from 'lucide-react';
import { Channel, GuideProgramme, HomeConfig } from '../types/broadcast';
import {
  formatClockWithSeconds,
  formatShortDate,
  getLiveHourSlots,
  isDefaultSlotPlaceholder,
} from '../utils/timeFormat';
import { ChannelLogo } from './ChannelLogo';

interface GuideViewProps {
  channels: Channel[];
  schedule: GuideProgramme[];
  homeConfig?: HomeConfig;
  dayOffset: number;
  reminders: Set<string>;
  networkNow: Date;
  isOnline: boolean;
  autoTimeSync: boolean;
  onChangeDay: (delta: number) => void;
  onResetToday: () => void;
  onToggleReminder: (key: string) => void;
  onSelectChannel: (channel: Channel, contextTitle?: string) => void;
}

export function GuideView({
  channels,
  schedule,
  homeConfig,
  dayOffset,
  reminders,
  networkNow,
  isOnline,
  autoTimeSync,
  onChangeDay,
  onResetToday,
  onToggleReminder,
  onSelectChannel,
}: GuideViewProps) {
  const targetDate = new Date(networkNow.getTime() + dayOffset * 86400000);
  const { currentHourLabel, nextHourLabel, progressPercent } =
    getLiveHourSlots(networkNow);

  const dateLabel =
    dayOffset === 0
      ? 'Today'
      : dayOffset === 1
        ? 'Tomorrow'
        : dayOffset === -1
          ? 'Yesterday'
          : formatShortDate(targetDate);

  const baseSchedule = schedule;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#f5f4f8]">
            TV Guide
          </h2>
          <p className="text-sm text-[#a5a3b2] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Select any programme to tune in or set a reminder</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular text-[#ffd21f]">
              {formatClockWithSeconds(networkNow)}
            </span>
            {!isOnline && autoTimeSync && (
              <>
                <span aria-hidden="true">·</span>
                <span>Offline</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dayOffset !== 0 && (
            <button
              type="button"
              onClick={onResetToday}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#262631] hover:bg-[#30303d] text-xs font-semibold text-[#ffd21f] transition-colors"
            >
              Today
            </button>
          )}
          <div className="flex items-center gap-1 bg-[#1d1d26] border border-white/[0.06] rounded-xl p-1">
            <button
              type="button"
              onClick={() => onChangeDay(-1)}
              aria-label="Previous day"
              className="min-h-[40px] min-w-[40px] grid place-items-center rounded-lg text-[#f5f4f8] hover:bg-white/[0.06] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 text-sm font-semibold text-[#f5f4f8] min-w-[100px] text-center">
              {dateLabel}
            </span>
            <button
              type="button"
              onClick={() => onChangeDay(1)}
              aria-label="Next day"
              className="min-h-[40px] min-w-[40px] grid place-items-center rounded-lg text-[#f5f4f8] hover:bg-white/[0.06] transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {dayOffset === 0 && autoTimeSync && (
        <div className="h-1 w-full bg-[#262631] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#ffd21f] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="hidden sm:grid grid-cols-[96px_1fr_1fr] gap-2 px-1 text-xs text-[#a5a3b2] font-mono-tabular">
        <span>Station</span>
        <span>
          {autoTimeSync && dayOffset === 0 ? currentHourLabel : '12:00 AM'} · On Now
        </span>
        <span>
          {autoTimeSync && dayOffset === 0 ? nextHourLabel : '1:00 AM'} · Up Next
        </span>
      </div>

      <div className="space-y-2.5">
        {channels.map((channel) => {
          const entry = baseSchedule.find((item) => item.channelId === channel.id);
          const currentTitle = entry?.currentTitle || channel.program || channel.name;
          const currentTime =
            autoTimeSync &&
            dayOffset === 0 &&
            isDefaultSlotPlaceholder(entry?.currentTime)
              ? currentHourLabel
              : entry?.currentTime || '12:00 AM';
          const nextTitle = entry?.nextTitle || 'Late Broadcast';
          const nextTime =
            autoTimeSync &&
            dayOffset === 0 &&
            isDefaultSlotPlaceholder(entry?.nextTime)
              ? nextHourLabel
              : entry?.nextTime || '1:00 AM';
          const reminderKey = `${dayOffset}:${channel.id}:${nextTitle}`;
          const hasReminder = reminders.has(reminderKey);

          return (
            <div
              key={channel.id}
              className="grid grid-cols-[72px_1fr] sm:grid-cols-[96px_1fr_1fr] gap-2 items-stretch"
            >
              <div className="bg-[#1d1d26] border border-white/[0.05] rounded-xl p-2 flex flex-col items-center justify-center text-center">
                <ChannelLogo
                  brand={channel.brand}
                  name={channel.name}
                  size="sm"
                  iconUrl={channel.iconUrl}
                  type={channel.type}
                  defaultStationIconUrl={homeConfig?.stationIconUrl}
                  defaultRadioIconUrl={homeConfig?.radioIconUrl}
                />
                <span className="hidden sm:block text-[11px] font-medium text-[#c9c7d2] mt-1.5 truncate max-w-full px-1">
                  {channel.name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onSelectChannel(channel, currentTitle)}
                className="bg-[#1d1d26] hover:bg-[#252531] border border-white/[0.06] hover:border-[#ffd21f]/50 rounded-xl p-3.5 text-left flex flex-col justify-center min-w-0 transition-colors"
              >
                <span className="font-semibold text-sm text-[#f5f4f8] truncate">
                  {currentTitle}
                </span>
                <span className="text-xs text-[#a5a3b2] mt-1 font-mono-tabular">
                  {currentTime}
                </span>
              </button>

              <div className="col-start-2 sm:col-start-auto bg-[#1d1d26] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectChannel(channel, nextTitle)}
                  className="flex-1 min-w-0 text-left focus-visible:outline-2 focus-visible:outline-[#1685ff] rounded"
                >
                  <span className="block font-semibold text-sm text-[#f5f4f8] truncate">
                    {nextTitle}
                  </span>
                  <span className="block text-xs text-[#a5a3b2] mt-1 font-mono-tabular">
                    {nextTime}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleReminder(reminderKey)}
                  aria-label={
                    hasReminder
                      ? `Cancel reminder for ${nextTitle}`
                      : `Set reminder for ${nextTitle}`
                  }
                  aria-pressed={hasReminder}
                  className={`min-h-[40px] min-w-[40px] shrink-0 grid place-items-center rounded-lg transition-colors ${
                    hasReminder
                      ? 'bg-[#ffd21f]/15 text-[#ffd21f]'
                      : 'text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06]'
                  }`}
                >
                  {hasReminder ? (
                    <BellRing className="w-4 h-4" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {reminders.size > 0 && (
        <section
          aria-label="Saved programme reminders"
          className="rounded-2xl bg-[#1d1d26] border border-[#ffd21f]/25 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#ffd21f] flex items-center gap-2">
              <BellRing className="w-4 h-4" />
              <span>Saved Programme Reminders ({reminders.size})</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Array.from(reminders).map((key) => {
              const firstColon = key.indexOf(':');
              const secondColon =
                firstColon >= 0 ? key.indexOf(':', firstColon + 1) : -1;
              const offsetStr =
                firstColon >= 0 ? key.slice(0, firstColon) : '0';
              const chId =
                firstColon >= 0 && secondColon > firstColon
                  ? key.slice(firstColon + 1, secondColon)
                  : '';
              const title =
                secondColon >= 0 ? key.slice(secondColon + 1) : key;
              const matchedCh = channels.find((c) => c.id === chId);
              const offsetNum = Number(offsetStr);
              const dayText =
                offsetNum === 0
                  ? 'Today'
                  : offsetNum === 1
                    ? 'Tomorrow'
                    : offsetNum === -1
                      ? 'Yesterday'
                      : `Day ${offsetNum > 0 ? `+${offsetNum}` : offsetNum}`;

              return (
                <div
                  key={key}
                  className="p-3 rounded-xl bg-[#15151d] border border-white/[0.06] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                      {title}
                    </p>
                    <p className="text-[11px] text-[#a5a3b2] truncate mt-0.5">
                      {matchedCh?.name || chId || 'Station'} · {dayText}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {matchedCh && (
                      <button
                        type="button"
                        onClick={() => onSelectChannel(matchedCh, title)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold transition-colors"
                      >
                        Watch
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleReminder(key)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#c9c7d2] transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
