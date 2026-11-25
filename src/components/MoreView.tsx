import { useEffect, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  BellRing,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  Mic2,
  Newspaper,
  Play,
  Settings,
  SlidersHorizontal,
  UserCircle2,
} from 'lucide-react';
import { LAUNCHER_ICON, STUDIO_IMAGE } from '../data/channels';
import { normalizeMediaAssetUrl } from '../utils/mediaAssets';
import {
  formatFileSize,
  resolveCloudFilePlayableUrl,
} from '../services/cloudStorage';
import {
  enablePushNotifications,
  readRemindersEnabled,
  readStoredFcmToken,
  readStoredTopics,
  readStoredWebPushActive,
  sendTestSystemNotification,
  syncTopicPreferencesToServer,
  writeRemindersEnabled,
} from '../services/fcmService';
import {
  getSystemNotificationStatus,
  isNativeAndroidApp,
  openSystemNotificationSettings,
  type SystemNotificationStatus,
} from '../services/systemNotifications';
import {
  AppConfig,
  ArchiveItem,
  ArtistProfile,
  BroadcastAlert,
  Channel,
  CloudFileRecord,
  HomeConfig,
  MovieItem,
  NewsArticle,
  NotificationTopic,
  PlaybackSettings,
  StreamFormat,
} from '../types/broadcast';
import { ChannelLogo } from './ChannelLogo';
import { MoviesView } from './MoviesView';
import { NewsView } from './NewsView';
import { ArtistsView } from './ArtistsView';
import { AutoImagePreview } from './AutoImagePreview';

export type MoreTab =
  | 'archive'
  | 'movies'
  | 'podcasts'
  | 'news'
  | 'artists'
  | 'more';

interface MoreViewProps {
  channels: Channel[];
  archiveItems: ArchiveItem[];
  movies: MovieItem[];
  newsArticles?: NewsArticle[];
  artists?: ArtistProfile[];
  appConfig: AppConfig;
  homeConfig?: HomeConfig;
  settings: PlaybackSettings;
  isAdmin: boolean;
  broadcastAlerts?: BroadcastAlert[];
  cloudFiles?: CloudFileRecord[];
  reminders?: Set<string>;
  firebaseUser?: User | null;
  requestedTab?: MoreTab | null;
  onClearRequestedTab?: () => void;
  requestedPanel?: 'alerts' | null;
  onClearRequestedPanel?: () => void;
  onUpdateSettings: (settings: PlaybackSettings) => void;
  onToggleReminder?: (key: string) => void;
  onSelectMedia: (
    channel: Channel,
    contextTitle?: string,
    overrideStreamUrl?: string,
    overrideStreamType?: StreamFormat
  ) => void;
  onOpenAccount: (initialView?: 'account' | 'admin') => void;
  onOpenControlPanel?: (
    section: 'archive' | 'library' | 'movies' | 'news' | 'artists',
    itemId?: string
  ) => void;
}

const TOPIC_OPTIONS: { id: NotificationTopic; label: string }[] = [
  { id: 'news', label: 'Breaking News' },
  { id: 'sports', label: 'Live Sports' },
  { id: 'tvGuide', label: 'TV Guide Updates' },
  { id: 'live', label: 'Now Streaming Live' },
];

export function MoreView({
  channels,
  archiveItems,
  movies,
  newsArticles = [],
  artists = [],
  appConfig,
  homeConfig,
  settings,
  isAdmin,
  broadcastAlerts = [],
  cloudFiles = [],
  reminders = new Set(),
  firebaseUser = null,
  requestedTab = null,
  onClearRequestedTab,
  requestedPanel = null,
  onClearRequestedPanel,
  onUpdateSettings,
  onToggleReminder,
  onSelectMedia,
  onOpenAccount,
  onOpenControlPanel,
}: MoreViewProps) {
  const availableTabs: { id: MoreTab; label: string }[] = [
    ...(appConfig.enableArchive
      ? [{ id: 'archive' as const, label: 'TV ARCHIVE' }]
      : []),
    ...(appConfig.enableMovies
      ? [{ id: 'movies' as const, label: 'MOVIES' }]
      : []),
    ...(appConfig.enablePodcasts
      ? [{ id: 'podcasts' as const, label: 'PODCASTS' }]
      : []),
    {
      id: 'news' as const,
      label:
        newsArticles.length > 0
          ? `BREAKING NEWS (${newsArticles.length})`
          : 'BREAKING NEWS',
    },
    {
      id: 'artists' as const,
      label:
        artists.length > 0 ? `ARTISTS (${artists.length})` : 'ARTISTS',
    },
    { id: 'more' as const, label: 'MORE' },
  ];

  const [activeTab, setActiveTab] = useState<MoreTab>(
    requestedTab || availableTabs[0]?.id || 'more'
  );
  const [expandedPanel, setExpandedPanel] = useState<
    'none' | 'alerts' | 'resources' | 'help' | 'settings'
  >('none');
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<NotificationTopic[]>(() =>
    readStoredTopics()
  );
  const [fcmToken, setFcmToken] = useState<string | null>(() =>
    readStoredFcmToken()
  );
  const [webPushActive, setWebPushActive] = useState<boolean>(() =>
    readStoredWebPushActive()
  );
  const [notifStatus, setNotifStatus] =
    useState<SystemNotificationStatus | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(() =>
    readRemindersEnabled()
  );
  const [pushLoading, setPushLoading] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  useEffect(() => {
    void getSystemNotificationStatus().then(setNotifStatus);
  }, [expandedPanel]);

  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
      onClearRequestedTab?.();
    }
  }, [requestedTab, onClearRequestedTab]);

  useEffect(() => {
    if (requestedPanel) {
      setActiveTab('more');
      setExpandedPanel(requestedPanel);
      onClearRequestedPanel?.();
    }
  }, [requestedPanel, onClearRequestedPanel]);

  const publicResources = cloudFiles.filter((f) => f.publicVisible !== false);

  const handleOpenCloudResource = async (file: CloudFileRecord) => {
    setOpeningFileId(file.id);
    try {
      const resolvedUrl = await resolveCloudFilePlayableUrl(file.url);
      if (file.category === 'video' || file.category === 'audio') {
        const ch = channels[0];
        if (ch) {
          onSelectMedia(
            ch,
            file.name,
            resolvedUrl,
            file.category === 'audio' ? 'audio' : 'media'
          );
          return;
        }
      }
      const a = document.createElement('a');
      a.href = resolvedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setOpeningFileId(null);
    }
  };

  const handleToggleTopic = (topic: NotificationTopic) => {
    const exists = selectedTopics.includes(topic);
    const next = exists
      ? selectedTopics.filter((t) => t !== topic)
      : [...selectedTopics, topic];
    const safeNext = next.length > 0 ? next : [topic];
    setSelectedTopics(safeNext);
    void syncTopicPreferencesToServer({ topics: safeNext, firebaseUser });
  };

  const handleEnablePush = async () => {
    setPushLoading(true);
    setPushNotice(null);
    try {
      const res = await enablePushNotifications({
        topics: selectedTopics,
        firebaseUser,
      });
      if (res.token) setFcmToken(res.token);
      if (res.webPushActive) setWebPushActive(true);
      const nextStatus = await getSystemNotificationStatus();
      setNotifStatus(nextStatus);
      setPushNotice(res.message);
    } catch {
      setPushNotice('Unable to initialize system notifications on this device.');
    } finally {
      setPushLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingPush(true);
    setPushNotice(null);
    try {
      const res = await sendTestSystemNotification({
        channelId: channels[0]?.id,
      });
      setPushNotice(res.message);
    } catch {
      setPushNotice('Unable to dispatch test notification right now.');
    } finally {
      setTestingPush(false);
    }
  };

  const handleToggleRemindersEnabled = (enabled: boolean) => {
    setRemindersEnabled(enabled);
    writeRemindersEnabled(enabled);
  };

  const resolvedTab = availableTabs.some((t) => t.id === activeTab)
    ? activeTab
    : availableTabs[0]?.id || 'more';

  const archiveEntries = archiveItems.filter(
    (item) => item.category === 'archive'
  );
  const podcastEntries = archiveItems.filter(
    (item) => item.category === 'podcast'
  );

  const handlePlayArchive = (item: ArchiveItem) => {
    const channel =
      channels.find((c) => c.id === item.channelId) || channels[0];
    if (channel) {
      onSelectMedia(channel, item.title, item.mediaUrl, item.streamType);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className="flex items-center gap-6 border-b border-[#30303b] overflow-x-auto no-scrollbar"
        role="tablist"
        aria-label="More sections"
      >
        {availableTabs.map((tab) => {
          const active = resolvedTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`relative min-h-[44px] py-3 text-sm font-bold tracking-wider whitespace-nowrap shrink-0 transition-colors ${
                active ? 'text-[#f4f2f7]' : 'text-[#a5a3b2] hover:text-[#f4f2f7]'
              }`}
            >
              {tab.label}
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[#ffd21f] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {resolvedTab === 'archive' && appConfig.enableArchive && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-[#f5f4f8]">
                Recently available
              </h2>
              <p className="text-sm text-[#a5a3b2] mt-0.5">
                Catch up on recorded broadcasts from Kakumiro Online TV and partner stations
              </p>
            </div>
            {isAdmin && onOpenControlPanel && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenControlPanel('library')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#ffd21f]" />
                  <span>Media Library &amp; Auto Art</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenControlPanel('archive')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Manage Online in Control Panel</span>
                </button>
              </div>
            )}
          </div>

          {archiveEntries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {archiveEntries.map((item) => {
                const archiveCardThumb =
                  item.thumbnailPath ||
                  homeConfig?.tvArchiveAutoArtUrl ||
                  STUDIO_IMAGE;
                return (
                <article
                  key={item.id}
                  className="bg-[#1d1d26] border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  <div className="relative aspect-[16/9] bg-gradient-to-br from-[#232330] to-[#121218]">
                    <AutoImagePreview
                      src={archiveCardThumb}
                      alt={item.title}
                      className="w-full h-full bg-transparent"
                      imgClassName="w-full h-full object-cover opacity-85"
                      fallbackNode={
                        <img
                          src={normalizeMediaAssetUrl(STUDIO_IMAGE)}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover opacity-80"
                        />
                      }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d26] via-transparent to-transparent pointer-events-none" />
                    {isAdmin && onOpenControlPanel && (
                      <button
                        type="button"
                        onClick={() => onOpenControlPanel('archive', item.id)}
                        className="absolute top-2.5 right-2.5 min-h-[32px] px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 border border-white/15 text-[11px] font-semibold text-[#ffd21f] flex items-center gap-1"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>Thumbnail / Edit</span>
                      </button>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                    <div>
                      <p className="text-xs text-[#a5a3b2]">
                        <span>{item.channelName}</span>
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span className="font-mono-tabular">{item.duration}</span>
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span>{item.recordedAt}</span>
                      </p>
                      <h3 className="text-base font-semibold text-[#f5f4f8] mt-1.5 leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[#a5a3b2] mt-1.5 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlayArchive(item)}
                        className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-sm font-semibold text-[#f5f4f8] flex items-center justify-center gap-2 transition-colors"
                      >
                        <Play className="w-4 h-4 text-[#ffd21f] fill-current" />
                        Watch catch-up
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[#1d1d26] border border-white/[0.06] text-center text-sm text-[#a5a3b2]">
              No TV archive episodes have been published yet.
            </div>
          )}
        </div>
      )}

      {resolvedTab === 'movies' && appConfig.enableMovies && (
        <MoviesView
          movies={movies}
          channels={channels}
          movieAutoArtUrl={homeConfig?.movieAutoArtUrl}
          onPlayMovie={onSelectMedia}
        />
      )}

      {resolvedTab === 'podcasts' && appConfig.enablePodcasts && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-[#f5f4f8]">
                Podcasts &amp; Audio Shows
              </h2>
              <p className="text-sm text-[#a5a3b2] mt-0.5">
                On-demand radio shows, music countdowns, and community interviews
              </p>
            </div>
            {isAdmin && onOpenControlPanel && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenControlPanel('library')}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#ffd21f]" />
                  <span>Media Library &amp; Auto Art</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenControlPanel('archive')}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Manage Online in Control Panel</span>
                </button>
              </div>
            )}
          </div>

          {podcastEntries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {podcastEntries.map((item) => {
                const matchedChannel =
                  channels.find((c) => c.id === item.channelId) || channels[0];
                const podcastThumb =
                  item.thumbnailPath || homeConfig?.podcastAutoArtUrl;
                return (
                  <article
                    key={item.id}
                    className="bg-[#1d1d26] border border-white/[0.06] rounded-2xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start gap-4">
                      {podcastThumb ? (
                        <AutoImagePreview
                          src={podcastThumb}
                          alt={item.title}
                          className="w-14 h-14 rounded-xl border border-white/10 shrink-0"
                          fallbackNode={
                            <ChannelLogo
                              brand={matchedChannel.brand}
                              name={item.channelName}
                              size="md"
                              iconUrl={matchedChannel.iconUrl}
                              type={matchedChannel.type}
                              defaultStationIconUrl={homeConfig?.stationIconUrl}
                              defaultRadioIconUrl={homeConfig?.radioIconUrl}
                            />
                          }
                        />
                      ) : (
                        <ChannelLogo
                          brand={matchedChannel.brand}
                          name={item.channelName}
                          size="md"
                          iconUrl={matchedChannel.iconUrl}
                          type={matchedChannel.type}
                          defaultStationIconUrl={homeConfig?.stationIconUrl}
                          defaultRadioIconUrl={homeConfig?.radioIconUrl}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#a5a3b2]">
                          <span>{item.channelName}</span>
                          <span aria-hidden="true" className="mx-1.5">
                            ·
                          </span>
                          <span className="font-mono-tabular">{item.duration}</span>
                        </p>
                        <h3 className="text-base font-semibold text-[#f5f4f8] mt-1 leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-xs text-[#a5a3b2] mt-1.5 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlayArchive(item)}
                        className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-sm font-semibold text-[#f5f4f8] flex items-center justify-center gap-2 transition-colors"
                      >
                        <Play className="w-4 h-4 text-[#ffd21f] fill-current" />
                        Listen now
                      </button>
                      {isAdmin && onOpenControlPanel && (
                        <button
                          type="button"
                          onClick={() => onOpenControlPanel('archive', item.id)}
                          aria-label={`Edit thumbnail for ${item.title}`}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-[#101016] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#ffd21f] flex items-center gap-1 shrink-0 transition-colors"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[#1d1d26] border border-white/[0.06] text-center text-sm text-[#a5a3b2]">
              No podcast episodes have been published yet.
            </div>
          )}
        </div>
      )}

      {resolvedTab === 'news' && (
        <NewsView
          articles={newsArticles}
          channels={channels}
          isAdmin={isAdmin}
          onSelectChannel={(ch, title) => onSelectMedia(ch, title)}
          onOpenControlPanel={onOpenControlPanel}
        />
      )}

      {resolvedTab === 'artists' && (
        <ArtistsView
          artists={artists}
          channels={channels}
          isAdmin={isAdmin}
          onPlayArtist={onSelectMedia}
          onOpenControlPanel={onOpenControlPanel}
        />
      )}

      {resolvedTab === 'more' && (
        <div className="max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#1d1d26] border border-white/[0.06]">
            <div className="flex items-center gap-4 min-w-0">
              <AutoImagePreview
                src={homeConfig?.stationIconUrl || LAUNCHER_ICON}
                alt="Kakumiro Online TV launcher icon"
                className="w-14 h-14 rounded-2xl border border-[#ffd21f]/40 shrink-0 bg-[#101016]"
                imgClassName="w-full h-full object-cover"
                fallbackNode={
                  <img
                    src={normalizeMediaAssetUrl(LAUNCHER_ICON)}
                    alt="Kakumiro Online TV launcher icon"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                }
              />
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold text-[#f5f4f8]">
                  Kakumiro Online TV
                </h2>
                <p className="text-xs text-[#a5a3b2] mt-0.5">
                  Official broadcast app · Live TV, Written News &amp; Radio
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#1d1d26] border border-white/[0.06] rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveTab('news')}
              className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0 overflow-hidden">
                {homeConfig?.newsIconUrl?.trim() ? (
                  <AutoImagePreview
                    src={homeConfig.newsIconUrl}
                    alt="Breaking News icon"
                    className="w-full h-full bg-transparent"
                    imgClassName="w-full h-full object-cover"
                    fallbackNode={<Newspaper className="w-5 h-5" />}
                  />
                ) : (
                  <Newspaper className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-[#f5f4f8]">
                  Breaking News
                </p>
                <p className="text-xs text-[#a5a3b2]">
                  {newsArticles.length} written stor
                  {newsArticles.length === 1 ? 'y' : 'ies'} · Latest written reports &amp; bulletins
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#a5a3b2]" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('artists')}
              className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0">
                <Mic2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-[#f5f4f8]">
                  Artists &amp; Music Talent
                </p>
                <p className="text-xs text-[#a5a3b2]">
                  {artists.length} featured artist
                  {artists.length === 1 ? '' : 's'} · Profiles, releases &amp; studio sessions
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#a5a3b2]" />
            </button>

            <button
              type="button"
              onClick={() => onOpenAccount('account')}
              className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0">
                <UserCircle2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-[#f5f4f8]">
                  My Profile &amp; Subscription
                </p>
                <p className="text-xs text-[#a5a3b2]">
                  Manage cloud sync, profile preferences &amp; viewing tier
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#a5a3b2]" />
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onOpenAccount('admin')}
                className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-[#f5f4f8]">
                    Admin Control Panel
                  </p>
                  <p className="text-xs text-[#a5a3b2]">
                    Manage live streams, channels, TV guide, and app features
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#a5a3b2]" />
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                setExpandedPanel((p) => (p === 'alerts' ? 'none' : 'alerts'))
              }
              className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0 overflow-hidden">
                {homeConfig?.updatesIconUrl?.trim() ? (
                  <AutoImagePreview
                    src={homeConfig.updatesIconUrl}
                    alt="Updates & Live Alerts icon"
                    className="w-full h-full bg-transparent"
                    imgClassName="w-full h-full object-cover"
                    fallbackNode={<BellRing className="w-5 h-5" />}
                  />
                ) : (
                  <BellRing className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-[#f5f4f8]">
                  Live Alerts &amp; Push Notifications
                </p>
                <p className="text-xs text-[#a5a3b2]">
                  {notifStatus?.permission === 'granted' &&
                  (isNativeAndroidApp() ||
                    notifStatus.webPushSubscribed ||
                    webPushActive ||
                    Boolean(fcmToken))
                    ? 'Android system notifications & closed-app push active'
                    : notifStatus?.permission === 'granted'
                      ? 'System notifications permitted · Tap to sync closed-app push'
                      : notifStatus?.permission === 'denied'
                        ? 'Notifications blocked in OS / browser settings'
                        : 'Get breaking news, sports & TV guide alerts in your notification shade'}
                  {broadcastAlerts.length > 0
                    ? ` · ${broadcastAlerts.length} recent`
                    : ''}
                </p>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-[#a5a3b2] transition-transform ${
                  expandedPanel === 'alerts' ? 'rotate-90' : ''
                }`}
              />
            </button>

            {expandedPanel === 'alerts' && (
              <div className="p-5 bg-[#15151d] space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#f5f4f8]">
                      Android System Notifications &amp; Push Alerts
                    </p>
                    <p className="text-xs text-[#a5a3b2]">
                      {isNativeAndroidApp()
                        ? 'Native Android notification channels (News, Sports, TV Guide, Reminders) deliver alerts directly to your status bar & lockscreen.'
                        : 'Uses Web Push & Service Worker notifications so breaking news and live alerts reach your Android notification shade even when closed.'}
                    </p>
                    <p className="text-[11px] font-medium text-[#c9c7d2]">
                      Status:{' '}
                      <span
                        className={
                          notifStatus?.permission === 'granted'
                            ? 'text-[#ffd21f]'
                            : notifStatus?.permission === 'denied'
                              ? 'text-red-300'
                              : 'text-[#e4e2ec]'
                        }
                      >
                        {notifStatus?.permission === 'granted'
                          ? isNativeAndroidApp()
                            ? 'Android Native Alerts Granted'
                            : notifStatus.webPushSubscribed || webPushActive || fcmToken
                              ? 'OS Push Subscribed (Active)'
                              : 'Browser Permission Granted'
                          : notifStatus?.permission === 'denied'
                            ? 'Blocked in Device / Site Settings'
                            : notifStatus?.permission === 'unsupported'
                              ? 'Not Supported on This Device'
                              : 'Not Yet Enabled'}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleEnablePush()}
                      disabled={pushLoading}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold whitespace-nowrap disabled:opacity-60 transition-colors"
                    >
                      {pushLoading
                        ? 'Activating...'
                        : notifStatus?.permission === 'granted' &&
                            (isNativeAndroidApp() ||
                              notifStatus.webPushSubscribed ||
                              webPushActive ||
                              fcmToken)
                          ? 'Refresh Push Registration'
                          : 'Enable Android System Notifications'}
                    </button>

                    {notifStatus?.permission === 'granted' && (
                      <button
                        type="button"
                        onClick={() => void handleTestNotification()}
                        disabled={testingPush}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] text-[#f5f4f8] text-xs font-semibold whitespace-nowrap disabled:opacity-60 transition-colors"
                      >
                        {testingPush ? 'Sending...' : 'Send Test Notification'}
                      </button>
                    )}

                    {isNativeAndroidApp() && (
                      <button
                        type="button"
                        onClick={() => void openSystemNotificationSettings()}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[#c9c7d2] text-xs font-semibold whitespace-nowrap transition-colors"
                      >
                        OS Notification Settings
                      </button>
                    )}
                  </div>
                </div>

                {notifStatus?.permission === 'denied' && !isNativeAndroidApp() && (
                  <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3.5 py-2.5">
                    Notifications are blocked for this site. In Android Chrome, tap the lock icon next to the address bar &rarr; Permissions &rarr; Notifications &rarr; Allow, then tap Enable again.
                  </p>
                )}

                {pushNotice && (
                  <p className="text-xs font-medium text-[#ffd21f]">
                    {pushNotice}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {TOPIC_OPTIONS.map((topic) => (
                    <label
                      key={topic.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-[#e4e2ec]">
                        {topic.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedTopics.includes(topic.id)}
                        onChange={() => handleToggleTopic(topic.id)}
                        className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                      />
                    </label>
                  ))}
                </div>

                <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-[#e4e2ec]">
                      TV Guide Programme Start Alerts
                    </p>
                    <p className="text-[11px] text-[#a5a3b2]">
                      Trigger system notification alarms when your saved shows begin
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={remindersEnabled}
                    onChange={(e) =>
                      handleToggleRemindersEnabled(e.target.checked)
                    }
                    className="w-4 h-4 accent-[#ffd21f] cursor-pointer shrink-0"
                  />
                </label>

                {reminders.size > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <p className="text-xs font-semibold text-[#c9c7d2]">
                      Saved Programme Reminders ({reminders.size})
                    </p>
                    {Array.from(reminders).map((key) => {
                      const firstColon = key.indexOf(':');
                      const secondColon =
                        firstColon >= 0 ? key.indexOf(':', firstColon + 1) : -1;
                      const chId =
                        firstColon >= 0 && secondColon > firstColon
                          ? key.slice(firstColon + 1, secondColon)
                          : '';
                      const title =
                        secondColon >= 0 ? key.slice(secondColon + 1) : key;
                      const matchedCh = channels.find((c) => c.id === chId);
                      return (
                        <div
                          key={key}
                          className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                              {title}
                            </p>
                            <p className="text-[11px] text-[#a5a3b2] truncate">
                              {matchedCh?.name || chId || 'Station'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {matchedCh && (
                              <button
                                type="button"
                                onClick={() => onSelectMedia(matchedCh, title)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#ffd21f] whitespace-nowrap"
                              >
                                Watch
                              </button>
                            )}
                            {onToggleReminder && (
                              <button
                                type="button"
                                onClick={() => onToggleReminder(key)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-[#c9c7d2] whitespace-nowrap"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {broadcastAlerts.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <p className="text-xs font-semibold text-[#c9c7d2]">
                      Recent Station Updates
                    </p>
                    {broadcastAlerts.slice(0, 5).map((alert) => {
                      const targetCh = alert.channelId
                        ? channels.find((c) => c.id === alert.channelId)
                        : undefined;
                      const alertThumb =
                        alert.iconUrl || homeConfig?.updatesIconUrl;
                      return (
                        <div
                          key={alert.id}
                          className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {alertThumb?.trim() && (
                              <AutoImagePreview
                                src={alertThumb}
                                alt={alert.title}
                                className="w-9 h-9 rounded-lg border border-white/10 shrink-0"
                                imgClassName="w-full h-full object-cover"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                                {alert.title}
                              </p>
                              <p className="text-[11px] text-[#a5a3b2] mt-0.5 line-clamp-2">
                                {alert.category.toUpperCase()} · {alert.createdAt} ·{' '}
                                {alert.body}
                              </p>
                            </div>
                          </div>
                          {targetCh && (
                            <button
                              type="button"
                              onClick={() => onSelectMedia(targetCh)}
                              className="min-h-[36px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#ffd21f] whitespace-nowrap shrink-0"
                            >
                              Watch
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {publicResources.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedPanel((p) =>
                      p === 'resources' ? 'none' : 'resources'
                    )
                  }
                  className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-[#f5f4f8]">
                      Station Documents &amp; Cloud Files
                    </p>
                    <p className="text-xs text-[#a5a3b2]">
                      Download schedules, documents, and shared station media ({publicResources.length})
                    </p>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 text-[#a5a3b2] transition-transform ${
                      expandedPanel === 'resources' ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {expandedPanel === 'resources' && (
                  <div className="p-5 bg-[#15151d] space-y-2.5">
                    {publicResources.map((file) => {
                      return (
                        <div
                          key={file.id}
                          className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {file.category === 'image' && file.url && (
                              <AutoImagePreview
                                src={file.url}
                                alt={file.name}
                                allowExpand
                                fallbackLabel="Image"
                                className="w-11 h-11 rounded-lg border border-white/10 shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                                {file.name}
                              </p>
                              <p className="text-[11px] text-[#a5a3b2] truncate">
                                {file.category.toUpperCase()}
                                {file.sizeBytes > 0
                                  ? ` · ${formatFileSize(file.sizeBytes)}`
                                  : ''}
                                {file.description ? ` · ${file.description}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleOpenCloudResource(file)}
                              disabled={openingFileId === file.id}
                              className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5 shrink-0 disabled:opacity-60"
                            >
                              {file.category === 'video' ||
                              file.category === 'audio' ? (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Play
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5" />
                                  {openingFileId === file.id
                                    ? 'Loading...'
                                    : 'Download'}
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() =>
                setExpandedPanel((p) => (p === 'settings' ? 'none' : 'settings'))
              }
              className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0">
                <Settings className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-[#f5f4f8]">
                  Playback Settings
                </p>
                <p className="text-xs text-[#a5a3b2]">
                  Autoplay, data saver, and channel memory
                </p>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-[#a5a3b2] transition-transform ${
                  expandedPanel === 'settings' ? 'rotate-90' : ''
                }`}
              />
            </button>

            {expandedPanel === 'settings' && (
              <div className="p-5 bg-[#15151d] space-y-3">
                {(
                  [
                    {
                      key: 'autoplay' as const,
                      label: 'Autoplay when opening a channel',
                    },
                    {
                      key: 'dataSaver' as const,
                      label: 'Data saver mode on mobile networks',
                    },
                    {
                      key: 'rememberLastChannel' as const,
                      label: 'Remember last tuned station',
                    },
                  ]
                ).map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center justify-between gap-4 min-h-[44px] cursor-pointer"
                  >
                    <span className="text-sm text-[#e4e2ec]">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={settings[opt.key]}
                      onChange={(e) =>
                        onUpdateSettings({
                          ...settings,
                          [opt.key]: e.target.checked,
                        })
                      }
                      className="w-5 h-5 accent-[#ffd21f] rounded cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                setExpandedPanel((p) => (p === 'help' ? 'none' : 'help'))
              }
              className="w-full min-h-[68px] px-5 py-3 flex items-center gap-4 text-left hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-[#262631] grid place-items-center text-[#ffd21f] shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-[#f5f4f8]">
                  Help & Support
                </p>
                <p className="text-xs text-[#a5a3b2]">
                  Playback assistance and station contact information
                </p>
              </div>
              <ChevronRight
                className={`w-5 h-5 text-[#a5a3b2] transition-transform ${
                  expandedPanel === 'help' ? 'rotate-90' : ''
                }`}
              />
            </button>

            {expandedPanel === 'help' && (
              <div className="p-5 bg-[#15151d] space-y-2 text-sm text-[#c9c7d2] leading-relaxed">
                <p className="font-semibold text-[#f5f4f8]">
                  Viewing & Stream Support
                </p>
                <p>
                  Watch live television, visual radio, catch-up archives, and
                  scheduled programmes across Kakumiro Online TV and partner
                  stations. Use Playback Settings above to tune autoplay or data
                  saver mode.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
