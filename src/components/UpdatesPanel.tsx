import { useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  BellRing,
  CalendarRange,
  CheckCheck,
  ChevronRight,
  Film,
  Headphones,
  Mic2,
  Newspaper,
  Radio,
  SlidersHorizontal,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import {
  ArchiveItem,
  ArtistProfile,
  BroadcastAlert,
  Channel,
  HomeConfig,
  MovieItem,
  NewsArticle,
  StationUpdate,
  StationUpdateCategory,
} from '../types/broadcast';
import { AutoImagePreview } from './AutoImagePreview';

export type UpdatesFilterGroup =
  | 'all'
  | 'admin'
  | 'news'
  | 'channels'
  | 'radios'
  | 'artists'
  | 'podcasts'
  | 'more';

export interface UnifiedUpdateItem {
  id: string;
  source: 'station' | 'alert' | 'catalog';
  category: StationUpdateCategory;
  categoryLabel: string;
  title: string;
  summary: string;
  targetId?: string;
  channelId?: string;
  iconUrl?: string;
  actionLabel: string;
  timeLabel: string;
  timestampMs: number;
  isUnread: boolean;
}

export interface UpdatesReadState {
  clearedBeforeMs: number;
  readIds: string[];
  baselineEpochMs: number;
}

const CATEGORY_LABELS: Record<StationUpdateCategory, string> = {
  admin: 'Control Panel',
  news: 'Breaking News',
  channel: 'TV Channel',
  live: 'Live Channel',
  radio: 'Radio',
  artist: 'Artist',
  podcast: 'Podcast',
  archive: 'TV Archive',
  movie: 'Movies & Series',
  tvGuide: 'TV Guide',
  sports: 'Live Sports',
};

const CATEGORY_ACTIONS: Record<StationUpdateCategory, string> = {
  admin: 'Open',
  news: 'Read news',
  channel: 'Watch channel',
  live: 'Watch live',
  radio: 'Listen live',
  artist: 'View artist',
  podcast: 'Listen now',
  archive: 'Watch catch-up',
  movie: 'Watch movie',
  tvGuide: 'View TV Guide',
  sports: 'Watch live',
};

const FILTER_TABS: { id: UpdatesFilterGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'admin', label: 'Control Panel' },
  { id: 'news', label: 'News' },
  { id: 'channels', label: 'Live & Channels' },
  { id: 'radios', label: 'Radios' },
  { id: 'artists', label: 'Artists' },
  { id: 'podcasts', label: 'Podcasts' },
  { id: 'more', label: 'Movies & More' },
];

function matchesFilterGroup(
  category: StationUpdateCategory,
  group: UpdatesFilterGroup
): boolean {
  if (group === 'all') return true;
  if (group === 'admin') return category === 'admin';
  if (group === 'news') return category === 'news';
  if (group === 'channels') return category === 'channel' || category === 'live';
  if (group === 'radios') return category === 'radio';
  if (group === 'artists') return category === 'artist';
  if (group === 'podcasts') return category === 'podcast';
  return (
    category === 'archive' ||
    category === 'movie' ||
    category === 'tvGuide' ||
    category === 'sports'
  );
}

function formatRelativeTime(timestampMs: number, nowMs: number, fallback?: string): string {
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) return fallback || 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay <= 7) return `${diffDay}d ago`;
  return fallback || new Date(timestampMs).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function buildUnifiedUpdatesFeed(params: {
  stationUpdates: StationUpdate[];
  broadcastAlerts: BroadcastAlert[];
  newsArticles: NewsArticle[];
  artists: ArtistProfile[];
  archiveItems: ArchiveItem[];
  channels: Channel[];
  movies: MovieItem[];
  homeConfig?: HomeConfig;
  readState: UpdatesReadState;
  nowMs: number;
}): UnifiedUpdateItem[] {
  const {
    stationUpdates,
    broadcastAlerts,
    newsArticles,
    artists,
    archiveItems,
    channels,
    movies,
    homeConfig,
    readState,
    nowMs,
  } = params;

  const readSet = new Set(readState.readIds);
  const isItemUnread = (id: string, timestampMs: number) =>
    !readSet.has(id) && timestampMs > readState.clearedBeforeMs;

  const items: UnifiedUpdateItem[] = [];
  const seenKeys = new Set<string>();

  for (const upd of stationUpdates) {
    const dedupeKey = upd.targetId
      ? `${upd.category}:${upd.targetId}`
      : `station:${upd.id}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    items.push({
      id: upd.id,
      source: 'station',
      category: upd.category,
      categoryLabel: CATEGORY_LABELS[upd.category] || 'Update',
      title: upd.title,
      summary: upd.summary,
      targetId: upd.targetId,
      channelId: upd.channelId,
      iconUrl: upd.iconUrl,
      actionLabel: upd.actionLabel || CATEGORY_ACTIONS[upd.category] || 'Open',
      timeLabel: formatRelativeTime(upd.timestampMs, nowMs, upd.createdAt),
      timestampMs: upd.timestampMs,
      isUnread: isItemUnread(upd.id, upd.timestampMs),
    });
  }

  for (const alert of broadcastAlerts) {
    const mappedCategory: StationUpdateCategory =
      alert.category === 'news'
        ? 'news'
        : alert.category === 'sports'
          ? 'sports'
          : alert.category === 'tvGuide'
            ? 'tvGuide'
            : 'live';
    const itemId = `alert:${alert.id}`;
    items.push({
      id: itemId,
      source: 'alert',
      category: mappedCategory,
      categoryLabel:
        alert.category === 'live'
          ? 'Live Broadcast'
          : CATEGORY_LABELS[mappedCategory],
      title: alert.title,
      summary: alert.body,
      channelId: alert.channelId,
      iconUrl: alert.iconUrl || homeConfig?.updatesIconUrl,
      actionLabel: alert.channelId
        ? 'Watch live'
        : CATEGORY_ACTIONS[mappedCategory],
      timeLabel: formatRelativeTime(alert.timestampMs, nowMs, alert.createdAt),
      timestampMs: alert.timestampMs,
      isUnread: isItemUnread(itemId, alert.timestampMs),
    });
  }

  const baseEpoch = readState.baselineEpochMs || nowMs;

  // Baseline catalog highlights so News, Artists, Podcasts, Live Channels, Radios & Movies
  // always surface meaningful updates even before the next manual edit.
  newsArticles.slice(0, 2).forEach((article, idx) => {
    const key = `news:${article.id}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const id = `cat-news-${article.id}`;
    const ts = Math.min(article.timestampMs || baseEpoch, baseEpoch - idx * 1000);
    items.push({
      id,
      source: 'catalog',
      category: 'news',
      categoryLabel: 'Breaking News',
      title: article.headline,
      summary: article.summary || `${article.category} · ${article.author}`,
      targetId: article.id,
      channelId: article.channelId,
      iconUrl: article.imageUrl || homeConfig?.newsIconUrl,
      actionLabel: 'Read news',
      timeLabel: article.publishedAt || formatRelativeTime(ts, nowMs),
      timestampMs: ts,
      isUnread: isItemUnread(id, ts),
    });
  });

  artists.slice(0, 2).forEach((artist, idx) => {
    const key = `artist:${artist.id}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const id = `cat-artist-${artist.id}`;
    const ts = Math.min(artist.timestampMs || baseEpoch, baseEpoch - (idx + 2) * 1000);
    items.push({
      id,
      source: 'catalog',
      category: 'artist',
      categoryLabel: 'Artist',
      title: `${artist.name} — ${artist.latestRelease}`,
      summary: `${artist.stageGenre} · ${artist.origin}`,
      targetId: artist.id,
      channelId: artist.channelId,
      iconUrl: artist.photoUrl,
      actionLabel: 'View artist',
      timeLabel: formatRelativeTime(ts, nowMs, 'Featured'),
      timestampMs: ts,
      isUnread: isItemUnread(id, ts),
    });
  });

  const latestPodcast = archiveItems.find((a) => a.category === 'podcast');
  if (latestPodcast && !seenKeys.has(`podcast:${latestPodcast.id}`)) {
    seenKeys.add(`podcast:${latestPodcast.id}`);
    const id = `cat-podcast-${latestPodcast.id}`;
    const ts = baseEpoch - 5000;
    items.push({
      id,
      source: 'catalog',
      category: 'podcast',
      categoryLabel: 'Podcast',
      title: latestPodcast.title,
      summary: `${latestPodcast.channelName} · ${latestPodcast.duration}`,
      targetId: latestPodcast.id,
      channelId: latestPodcast.channelId,
      iconUrl: latestPodcast.thumbnailPath || homeConfig?.podcastAutoArtUrl,
      actionLabel: 'Listen now',
      timeLabel: latestPodcast.recordedAt || 'Available',
      timestampMs: ts,
      isUnread: isItemUnread(id, ts),
    });
  }

  const latestArchive = archiveItems.find((a) => a.category === 'archive');
  if (latestArchive && !seenKeys.has(`archive:${latestArchive.id}`)) {
    seenKeys.add(`archive:${latestArchive.id}`);
    const id = `cat-archive-${latestArchive.id}`;
    const ts = baseEpoch - 6000;
    items.push({
      id,
      source: 'catalog',
      category: 'archive',
      categoryLabel: 'TV Archive',
      title: latestArchive.title,
      summary: `${latestArchive.channelName} · ${latestArchive.duration}`,
      targetId: latestArchive.id,
      channelId: latestArchive.channelId,
      iconUrl: latestArchive.thumbnailPath || homeConfig?.tvArchiveAutoArtUrl,
      actionLabel: 'Watch catch-up',
      timeLabel: latestArchive.recordedAt || 'Catch-up',
      timestampMs: ts,
      isUnread: isItemUnread(id, ts),
    });
  }

  const liveTv = channels.find((c) => c.type === 'Television');
  if (liveTv && !seenKeys.has(`live:${liveTv.id}`) && !seenKeys.has(`channel:${liveTv.id}`)) {
    seenKeys.add(`live:${liveTv.id}`);
    const id = `cat-live-${liveTv.id}`;
    const ts = baseEpoch - 7000;
    items.push({
      id,
      source: 'catalog',
      category: 'live',
      categoryLabel: 'Live Channel',
      title: `${liveTv.name} · ${liveTv.program || 'Live Broadcast'}`,
      summary: liveTv.subtitle || 'Streaming live television',
      targetId: liveTv.id,
      channelId: liveTv.id,
      iconUrl: liveTv.iconUrl || homeConfig?.stationIconUrl,
      actionLabel: 'Watch live',
      timeLabel: 'On air',
      timestampMs: ts,
      isUnread: isItemUnread(id, ts),
    });
  }

  const liveRadio = channels.find((c) => c.type === 'Radios');
  if (liveRadio && !seenKeys.has(`radio:${liveRadio.id}`)) {
    seenKeys.add(`radio:${liveRadio.id}`);
    const id = `cat-radio-${liveRadio.id}`;
    const ts = baseEpoch - 8000;
    items.push({
      id,
      source: 'catalog',
      category: 'radio',
      categoryLabel: 'Radio',
      title: `${liveRadio.name} · ${liveRadio.program || 'Live Radio'}`,
      summary: liveRadio.subtitle || 'Streaming live radio broadcast',
      targetId: liveRadio.id,
      channelId: liveRadio.id,
      iconUrl: liveRadio.iconUrl || homeConfig?.radioIconUrl,
      actionLabel: 'Listen live',
      timeLabel: 'On air',
      timestampMs: ts,
      isUnread: isItemUnread(id, ts),
    });
  }

  const featuredMovie = movies.find((m) => m.featured) || movies[0];
  if (featuredMovie && !seenKeys.has(`movie:${featuredMovie.id}`)) {
    seenKeys.add(`movie:${featuredMovie.id}`);
    const id = `cat-movie-${featuredMovie.id}`;
    const ts = baseEpoch - 9000;
    items.push({
      id,
      source: 'catalog',
      category: 'movie',
      categoryLabel: 'Movies & Series',
      title: featuredMovie.title,
      summary: `${featuredMovie.genre} · ${featuredMovie.duration}`,
      targetId: featuredMovie.id,
      channelId: featuredMovie.channelId,
      iconUrl: featuredMovie.posterPath || homeConfig?.movieAutoArtUrl,
      actionLabel: 'Watch now',
      timeLabel: featuredMovie.year || 'Featured',
      timestampMs: ts,
      isUnread: isItemUnread(id, ts),
    });
  }

  return items.sort((a, b) => b.timestampMs - a.timestampMs);
}

function CategoryIcon({ category }: { category: StationUpdateCategory }) {
  switch (category) {
    case 'admin':
      return <SlidersHorizontal className="w-4 h-4 text-[#ffd21f]" />;
    case 'news':
      return <Newspaper className="w-4 h-4 text-[#ffd21f]" />;
    case 'channel':
    case 'live':
      return <Tv className="w-4 h-4 text-[#ffd21f]" />;
    case 'radio':
      return <Radio className="w-4 h-4 text-[#ffd21f]" />;
    case 'artist':
      return <Mic2 className="w-4 h-4 text-[#ffd21f]" />;
    case 'podcast':
      return <Headphones className="w-4 h-4 text-[#ffd21f]" />;
    case 'archive':
      return <Archive className="w-4 h-4 text-[#ffd21f]" />;
    case 'movie':
      return <Film className="w-4 h-4 text-[#ffd21f]" />;
    case 'tvGuide':
      return <CalendarRange className="w-4 h-4 text-[#ffd21f]" />;
    case 'sports':
      return <BellRing className="w-4 h-4 text-[#ffd21f]" />;
    default:
      return <Bell className="w-4 h-4 text-[#ffd21f]" />;
  }
}

interface UpdatesBellButtonProps {
  unreadCount: number;
  onClick: () => void;
  compact?: boolean;
}

export function UpdatesBellButton({
  unreadCount,
  onClick,
  compact = false,
}: UpdatesBellButtonProps) {
  const formattedCount = unreadCount > 99 ? '99+' : String(unreadCount);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        unreadCount > 0
          ? `Open updates and notifications (${unreadCount} new)`
          : 'Open updates and notifications'
      }
      title={
        unreadCount > 0
          ? `${unreadCount} new station update${unreadCount === 1 ? '' : 's'}`
          : 'Updates & notifications'
      }
      className={`relative grid place-items-center rounded-full text-[#f5f4f8] hover:bg-white/[0.08] transition-colors shrink-0 ${
        compact ? 'min-h-[44px] min-w-[44px]' : 'min-h-[40px] min-w-[40px]'
      }`}
    >
      <Bell
        className={`w-5 h-5 ${
          unreadCount > 0 ? 'text-[#ffd21f]' : 'text-[#f5f4f8]'
        }`}
      />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e11d48] text-white text-[10px] font-extrabold leading-none flex items-center justify-center ring-2 ring-[#101016] font-mono-tabular">
          {formattedCount}
        </span>
      )}
    </button>
  );
}

interface UpdatesPanelProps {
  isOpen: boolean;
  items: UnifiedUpdateItem[];
  unreadCount: number;
  isAdmin: boolean;
  onClose: () => void;
  onSelectUpdate: (item: UnifiedUpdateItem) => void;
  onMarkAllRead: () => void;
  onDeleteUpdate?: (item: UnifiedUpdateItem) => void;
  onOpenPushSettings: () => void;
}

export function UpdatesPanel({
  isOpen,
  items,
  unreadCount,
  isAdmin,
  onClose,
  onSelectUpdate,
  onMarkAllRead,
  onDeleteUpdate,
  onOpenPushSettings,
}: UpdatesPanelProps) {
  const [activeFilter, setActiveFilter] = useState<UpdatesFilterGroup>('all');

  const filteredItems = useMemo(
    () => items.filter((item) => matchesFilterGroup(item.category, activeFilter)),
    [items, activeFilter]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-start sm:justify-end sm:p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Updates and Notifications"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[88vh] sm:mt-12 bg-[#16161e] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[#ffd21f] shrink-0" />
              <h2 className="font-display text-lg font-bold text-[#f5f4f8] truncate">
                Updates &amp; Notifications
              </h2>
            </div>
            <p className="text-xs text-[#a5a3b2] mt-0.5 font-mono-tabular">
              {unreadCount > 0
                ? `${unreadCount} new update${unreadCount === 1 ? '' : 's'} across station feeds`
                : 'All station updates viewed'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#ffd21f] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="min-h-[40px] min-w-[40px] grid place-items-center rounded-xl text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Filter Bar */}
        <div
          className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-[#13131a]"
          role="tablist"
          aria-label="Filter updates by source"
        >
          {FILTER_TABS.map((tab) => {
            const active = activeFilter === tab.id;
            const groupUnread = items.filter(
              (item) =>
                item.isUnread && matchesFilterGroup(item.category, tab.id)
            ).length;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(tab.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-[#ffd21f] text-[#101016]'
                    : 'bg-[#1d1d26] text-[#c8c6d0] hover:bg-[#262631]'
                }`}
              >
                <span>{tab.label}</span>
                {groupUnread > 0 && (
                  <span
                    className={`font-mono-tabular text-[11px] ${
                      active ? 'text-[#101016]/80' : 'text-[#ffd21f]'
                    }`}
                  >
                    ({groupUnread})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Feed List */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06]">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={`px-5 py-3.5 flex items-start gap-3.5 transition-colors ${
                  item.isUnread ? 'bg-[#ffd21f]/[0.05]' : 'hover:bg-white/[0.02]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectUpdate(item)}
                  className="flex-1 min-w-0 flex items-start gap-3.5 text-left group"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#262631] border border-white/10 grid place-items-center shrink-0 overflow-hidden mt-0.5">
                    {item.iconUrl?.trim() ? (
                      <AutoImagePreview
                        src={item.iconUrl}
                        alt={item.title}
                        className="w-full h-full bg-transparent"
                        imgClassName="w-full h-full object-cover"
                        fallbackNode={<CategoryIcon category={item.category} />}
                      />
                    ) : (
                      <CategoryIcon category={item.category} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[#a5a3b2] flex items-center gap-1.5 flex-wrap">
                      <span
                        className={
                          item.isUnread
                            ? 'font-semibold text-[#ffd21f]'
                            : 'font-medium text-[#c9c7d2]'
                        }
                      >
                        {item.categoryLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.timeLabel}</span>
                      {item.isUnread && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#ffd21f]">
                            New
                          </span>
                        </>
                      )}
                    </p>

                    <p className="text-sm font-semibold text-[#f5f4f8] mt-0.5 leading-snug group-hover:text-[#ffd21f] transition-colors">
                      {item.title}
                    </p>
                    <p className="text-xs text-[#a5a3b2] mt-1 line-clamp-2 leading-relaxed">
                      {item.summary}
                    </p>

                    <p className="text-xs font-semibold text-[#ffd21f] mt-1.5 inline-flex items-center gap-1">
                      <span>{item.actionLabel}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </p>
                  </div>
                </button>

                {isAdmin &&
                  onDeleteUpdate &&
                  (item.source === 'station' || item.source === 'alert') && (
                    <button
                      type="button"
                      onClick={() => onDeleteUpdate(item)}
                      aria-label={`Remove update ${item.title}`}
                      className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10 shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
              </div>
            ))
          ) : (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-[#f5f4f8]">
                No updates in this category yet
              </p>
              <p className="text-xs text-[#a5a3b2]">
                New updates from Control Panel, News, Channels, Radios, Artists, and Podcasts will appear here automatically.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.08] bg-[#13131a] flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#a5a3b2] truncate">
            Live sync · News, TV, Radio, Artists &amp; Podcasts
          </p>
          <button
            type="button"
            onClick={onOpenPushSettings}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] whitespace-nowrap transition-colors"
          >
            Push Alerts Setup
          </button>
        </div>
      </div>
    </div>
  );
}
