import { useCallback, useEffect, useState } from 'react';
import { Clock, Search, X } from 'lucide-react';
import { Channel, ChannelType, HomeConfig } from '../types/broadcast';
import { sanitizeRtdbKey } from '../services/liveViewers';
import { ChannelCard } from './ChannelCard';
import { UpdatesBellButton } from './UpdatesPanel';

export type ChannelFilter = 'All' | ChannelType | 'Favorites';

const RECENT_SEARCHES_KEY = 'kotv_recent_channel_searches_v1';
const MAX_RECENT_SEARCHES = 3;

function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function writeRecentSearches(queries: string[]) {
  try {
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(queries.slice(0, MAX_RECENT_SEARCHES))
    );
  } catch {
    // Ignore storage quota errors
  }
}

interface ChannelsViewProps {
  channels: Channel[];
  homeConfig?: HomeConfig;
  favorites: Set<string>;
  activeChannelId?: string | null;
  viewerCounts?: Record<string, number>;
  filter: ChannelFilter;
  searchQuery: string;
  showSearchInput: boolean;
  enableRadios: boolean;
  onFilterChange: (filter: ChannelFilter) => void;
  onSearchChange: (value: string) => void;
  onToggleSearch: () => void;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
  unreadUpdatesCount?: number;
  onOpenUpdates?: () => void;
}

const FILTERS: { id: ChannelFilter; label: string }[] = [
  { id: 'All', label: 'All' },
  { id: 'Television', label: 'Television' },
  { id: 'Radios', label: 'Radios' },
  { id: 'Favorites', label: 'Favorites' },
];

export function ChannelsView({
  channels,
  homeConfig,
  favorites,
  activeChannelId = null,
  viewerCounts = {},
  filter,
  searchQuery,
  showSearchInput,
  enableRadios,
  onFilterChange,
  onSearchChange,
  onToggleSearch,
  onSelectChannel,
  onToggleFavorite,
  unreadUpdatesCount = 0,
  onOpenUpdates,
}: ChannelsViewProps) {
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readRecentSearches()
  );

  const saveRecentSearch = useCallback((rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [
        trimmed,
        ...prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!showSearchInput || trimmed.length < 2) return;
    const timer = window.setTimeout(() => {
      saveRecentSearch(trimmed);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [searchQuery, showSearchInput, saveRecentSearch]);

  const handleClearRecentSearches = () => {
    setRecentSearches([]);
    writeRecentSearches([]);
  };

  const handleSelectWithHistory = (channel: Channel) => {
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery);
    }
    onSelectChannel(channel);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleChannels = enableRadios
    ? channels
    : channels.filter((c) => c.type !== 'Radios');
  const activeFilters = enableRadios
    ? FILTERS
    : FILTERS.filter((f) => f.id !== 'Radios');

  const filteredChannels = visibleChannels.filter((c) => {
    const effectiveFilter = !enableRadios && filter === 'Radios' ? 'All' : filter;
    const matchesFilter =
      effectiveFilter === 'All'
        ? true
        : effectiveFilter === 'Favorites'
          ? favorites.has(c.id)
          : c.type === effectiveFilter;

    const matchesQuery =
      !normalizedQuery ||
      c.name.toLowerCase().includes(normalizedQuery) ||
      c.program.toLowerCase().includes(normalizedQuery) ||
      c.subtitle.toLowerCase().includes(normalizedQuery);

    return matchesFilter && matchesQuery;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl font-bold text-[#f5f4f8]">
            Channels
          </h2>
          <span className="text-sm text-[#a5a3b2] font-mono-tabular">
            {filteredChannels.length}{' '}
            {filteredChannels.length === 1 ? 'channel' : 'channels'}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleSearch}
          className="hidden md:inline-flex min-h-[44px] px-4 py-2 rounded-xl bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-sm font-medium text-[#e4e2ec] items-center gap-2 transition-colors"
        >
          <Search className="w-4 h-4 text-[#a5a3b2]" />
          <span>{showSearchInput ? 'Hide search' : 'Search channels'}</span>
        </button>
      </div>

      {showSearchInput && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveRecentSearch(searchQuery);
              }}
              className="relative flex-1 min-w-0"
            >
              <Search className="w-4 h-4 text-[#a5a3b2] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search channels or current programmes..."
                autoFocus
                className="w-full min-h-[48px] pl-11 pr-11 py-2.5 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#7c7a8c]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  className="min-h-[40px] min-w-[40px] grid place-items-center absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg text-[#a5a3b2] hover:text-[#f5f4f8]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>
            {onOpenUpdates && (
              <div className="rounded-xl bg-[#1d1d26] border border-[#30303b] shrink-0">
                <UpdatesBellButton
                  unreadCount={unreadUpdatesCount}
                  onClick={onOpenUpdates}
                  compact
                />
              </div>
            )}
          </div>

          {recentSearches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#a5a3b2] mr-1">
                Recent searches
              </span>
              {recentSearches.map((term) => {
                const isCurrent =
                  searchQuery.trim().toLowerCase() === term.toLowerCase();
                return (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      onSearchChange(term);
                      saveRecentSearch(term);
                    }}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors border ${
                      isCurrent
                        ? 'bg-[#ffd21f]/15 border-[#ffd21f]/60 text-[#ffd21f]'
                        : 'bg-[#1d1d26] hover:bg-[#262631] border-white/[0.08] text-[#e4e2ec]'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0 opacity-75" />
                    <span className="max-w-[180px] truncate">{term}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleClearRecentSearches}
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#a5a3b2] hover:text-[#f5f4f8] whitespace-nowrap transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      <div
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
        role="tablist"
        aria-label="Filter channels by category"
      >
        {activeFilters.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onFilterChange(item.id)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#f1eff4] text-[#101016]'
                  : 'bg-[#1d1d26] text-[#c8c6d0] border border-white/[0.06] hover:bg-[#262631]'
              }`}
            >
              {item.id === 'Favorites' ? `${item.label} (${favorites.size})` : item.label}
            </button>
          );
        })}
      </div>

      {filteredChannels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              isFavorite={favorites.has(channel.id)}
              isActive={activeChannelId === channel.id}
              viewerCount={viewerCounts[sanitizeRtdbKey(channel.id)] ?? 0}
              defaultStationIconUrl={homeConfig?.stationIconUrl}
              defaultRadioIconUrl={homeConfig?.radioIconUrl}
              onSelect={handleSelectWithHistory}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-[#1d1d26] border border-white/[0.06] text-center space-y-3">
          <p className="text-base font-medium text-[#f5f4f8]">
            No matching channels found
          </p>
          <p className="text-sm text-[#a5a3b2]">
            {filter === 'Favorites'
              ? 'Tap the heart icon on any channel to add it to your favorites.'
              : 'Try adjusting your search term or switching category.'}
          </p>
          <button
            type="button"
            onClick={() => {
              onFilterChange('All');
              onSearchChange('');
            }}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#ffd21f] text-[#101016] text-sm font-bold hover:bg-[#ffe055] transition-colors"
          >
            Show all channels
          </button>
        </div>
      )}
    </div>
  );
}
