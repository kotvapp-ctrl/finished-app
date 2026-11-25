import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  BellRing,
  CalendarRange,
  Film,
  Home,
  LayoutGrid,
  Megaphone,
  Search,
  Tv,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  ARCHIVE_ITEMS,
  DEFAULT_APP_CONFIG,
  DEFAULT_HOME_CONFIG,
  DEFAULT_PROMO,
  GUIDE_SCHEDULE,
  HERO_SLIDES,
  INITIAL_ARTISTS,
  INITIAL_CHANNELS,
  INITIAL_CHAT_MESSAGES,
  INITIAL_MOVIES,
  INITIAL_NEWS_ARTICLES,
} from './data/channels';
import {
  auth,
  checkAdminAllowlist,
  isVerifiedAdminUser,
  refreshCurrentAuthUser,
} from './firebase';
import {
  deleteArchiveItemFromFirestore,
  deleteArtistFromFirestore,
  deleteBroadcastAlertFromFirestore,
  deleteChannelFromFirestore,
  deleteChatMessageFromFirestore,
  deleteChatMessagesBatchFromFirestore,
  deleteHeroSlideFromFirestore,
  deleteMovieFromFirestore,
  deleteNewsArticleFromFirestore,
  deleteStationUpdateFromFirestore,
  fetchPushTargetsForAdmin,
  publishBroadcastAlertToFirestore,
  publishStationUpdateToFirestore,
  recordUserLoginEventToFirestore,
  saveAppConfigToFirestore,
  saveArchiveItemToFirestore,
  saveArtistToFirestore,
  saveChannelToFirestore,
  saveGuideSlotToFirestore,
  saveHeroSlideToFirestore,
  saveHomeConfigToFirestore,
  saveMovieToFirestore,
  saveNewsArticleToFirestore,
  savePromoToFirestore,
  seedCatalogToFirestore,
  sendChatMessageToFirestore,
  subscribeAuthenticatedUserPreferences,
  subscribePublicBroadcastCatalog,
  syncUserDocumentsToFirestore,
  updateChatLikesInFirestore,
} from './services/firestoreSync';
import {
  enqueueOfflineSyncItem,
  isOfflineBackupDirty,
  markOfflineBackupDirty,
  mergeChatMessagesWithOfflineQueue,
  readOfflineSyncQueue,
  removeOfflineSyncItem,
} from './services/offlineSyncQueue';
import { createUserCloudBackup } from './services/userCloudService';
import { subscribeCloudFiles } from './services/cloudStorage';
import {
  type CatalogBackupPayload,
  createCloudBackup,
  subscribeCloudBackups,
} from './services/backupService';
import {
  readRemindersEnabled,
  readStoredTopics,
  subscribeForegroundFcm,
} from './services/fcmService';
import {
  cancelAndroidProgrammeReminder,
  scheduleAndroidProgrammeReminder,
  showAndroidSystemNotification,
  subscribeNotificationTapListener,
} from './services/systemNotifications';
import { useAllChannelViewerCounts } from './services/liveViewers';
import {
  AppConfig,
  ArchiveItem,
  ArtistProfile,
  BackupSnapshot,
  BroadcastAlert,
  BroadcastAlertCategory,
  Channel,
  ChatMessage,
  CloudFileRecord,
  ContinueWatchingItem,
  GuideProgramme,
  HeroSlide,
  HomeConfig,
  MovieItem,
  NewsArticle,
  PlaybackSettings,
  PromoConfig,
  StationUpdate,
  StationUpdateCategory,
  StreamFormat,
  UserLoginEvent,
  UserProfile,
} from './types/broadcast';
import { HomeView } from './components/HomeView';
import { ChannelFilter, ChannelsView } from './components/ChannelsView';
import { GuideView } from './components/GuideView';
import { MoviesView } from './components/MoviesView';
import { MoreTab, MoreView } from './components/MoreView';
import { WatchView } from './components/WatchView';
import { AccountModal, AccountPortalMode } from './components/AccountModal';
import { AutoImagePreview } from './components/AutoImagePreview';
import { type AdminSection } from './components/AdminPanel';
import { LauncherScreen } from './components/LauncherScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  buildUnifiedUpdatesFeed,
  type UnifiedUpdateItem,
  UpdatesBellButton,
  UpdatesPanel,
  type UpdatesReadState,
} from './components/UpdatesPanel';
import { useNetworkTime } from './hooks/useNetworkTime';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { parseScheduleTimeToMinutes } from './utils/timeFormat';

type NavPage = 'home' | 'channels' | 'guide' | 'movies' | 'more';

const STORAGE_KEYS = {
  channels: 'kotv_channels_v1',
  guide: 'kotv_guide_v1',
  heroSlides: 'kotv_hero_slides_v1',
  promo: 'kotv_promo_v1',
  movies: 'kotv_movies_v1',
  archive: 'kotv_archive_v1',
  newsArticles: 'kotv_news_articles_v1',
  artists: 'kotv_artists_v1',
  appConfig: 'kotv_app_config_v1',
  homeConfig: 'kotv_home_config_v1',
  favorites: 'kotv_favorites_v1',
  reminders: 'kotv_reminders_v1',
  profile: 'kotv_profile_v1',
  settings: 'kotv_settings_v1',
  chatMessages: 'kotv_chat_messages_v1',
  followedSenders: 'kotv_followed_senders_v1',
  continueWatching: 'kotv_continue_watching_v1',
  lastChannel: 'kotv_last_channel_v1',
  resumeChannelActive: 'kotv_resume_channel_active_v1',
  stationUpdates: 'kotv_station_updates_v1',
  updatesReadState: 'kotv_updates_read_v1',
};

const PAGE_TITLES: Record<NavPage, string> = {
  home: 'Home',
  channels: 'Channels',
  guide: 'TV Guide',
  movies: 'Movies',
  more: 'More',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState<NavPage>('home');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [guideDayOffset, setGuideDayOffset] = useState(0);

  const [channels, setChannels] = useState<Channel[]>(() =>
    readStorage<Channel[]>(STORAGE_KEYS.channels, INITIAL_CHANNELS)
  );

  const [guideSchedule, setGuideSchedule] = useState<GuideProgramme[]>(() =>
    readStorage<GuideProgramme[]>(STORAGE_KEYS.guide, GUIDE_SCHEDULE[0])
  );

  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>(() =>
    readStorage<HeroSlide[]>(STORAGE_KEYS.heroSlides, HERO_SLIDES)
  );

  const [promo, setPromo] = useState<PromoConfig>(() => ({
    ...DEFAULT_PROMO,
    ...readStorage<Partial<PromoConfig>>(STORAGE_KEYS.promo, {}),
  }));

  const [movies, setMovies] = useState<MovieItem[]>(() =>
    readStorage<MovieItem[]>(STORAGE_KEYS.movies, INITIAL_MOVIES)
  );

  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>(() =>
    readStorage<ArchiveItem[]>(STORAGE_KEYS.archive, ARCHIVE_ITEMS)
  );

  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>(() =>
    readStorage<NewsArticle[]>(STORAGE_KEYS.newsArticles, INITIAL_NEWS_ARTICLES)
  );

  const [artists, setArtists] = useState<ArtistProfile[]>(() =>
    readStorage<ArtistProfile[]>(STORAGE_KEYS.artists, INITIAL_ARTISTS)
  );

  const [appConfig, setAppConfig] = useState<AppConfig>(() => ({
    ...DEFAULT_APP_CONFIG,
    ...readStorage<Partial<AppConfig>>(STORAGE_KEYS.appConfig, {}),
  }));

  const [homeConfig, setHomeConfig] = useState<HomeConfig>(() => ({
    ...DEFAULT_HOME_CONFIG,
    ...readStorage<Partial<HomeConfig>>(STORAGE_KEYS.homeConfig, {}),
  }));

  const isOnline = useOnlineStatus();
  const networkTime = useNetworkTime(appConfig.autoTimeSync);
  const viewerCounts = useAllChannelViewerCounts(true);

  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(readStorage<string[]>(STORAGE_KEYS.favorites, []))
  );

  const [reminders, setReminders] = useState<Set<string>>(
    () => new Set(readStorage<string[]>(STORAGE_KEYS.reminders, []))
  );

  const [profile, setProfile] = useState<UserProfile>(() => {
    const stored = readStorage<UserProfile>(STORAGE_KEYS.profile, {
      identifier: '',
      displayName: 'Guest',
      plan: 'Free',
      role: 'viewer',
      signedIn: false,
    });
    return {
      ...stored,
      role: 'viewer',
    };
  });

  const [settings, setSettings] = useState<PlaybackSettings>(() =>
    readStorage<PlaybackSettings>(STORAGE_KEYS.settings, {
      autoplay: true,
      dataSaver: false,
      rememberLastChannel: true,
    })
  );

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    readStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, INITIAL_CHAT_MESSAGES)
  );

  const [followedSenders, setFollowedSenders] = useState<Set<string>>(
    () => new Set(readStorage<string[]>(STORAGE_KEYS.followedSenders, []))
  );

  const [continueWatching, setContinueWatching] = useState<
    ContinueWatchingItem[]
  >(() => {
    const stored = readStorage<ContinueWatchingItem[]>(
      STORAGE_KEYS.continueWatching,
      []
    );
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(
        (item) =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.channelId === 'string' &&
          typeof item.title === 'string'
      )
      .slice(0, 5);
  });

  const [playerState, setPlayerState] = useState<{
    channelId: string;
    contextTitle?: string;
    overrideStreamUrl?: string;
    overrideStreamType?: StreamFormat;
  } | null>(null);

  const [accountModalState, setAccountModalState] = useState<{
    open: boolean;
    initialView: 'account' | 'subscription' | 'cloud' | 'admin';
    initialPortal?: AccountPortalMode;
    initialChannelId?: string;
    initialAdminSection?: AdminSection;
    initialArchiveItemId?: string;
    initialMovieId?: string;
  }>({ open: false, initialView: 'account', initialPortal: 'user' });

  const [broadcastAlerts, setBroadcastAlerts] = useState<BroadcastAlert[]>([]);
  const [stationUpdates, setStationUpdates] = useState<StationUpdate[]>(() =>
    readStorage<StationUpdate[]>(STORAGE_KEYS.stationUpdates, [])
  );
  const [updatesReadState, setUpdatesReadState] = useState<UpdatesReadState>(
    () => {
      const fallback: UpdatesReadState = {
        clearedBeforeMs: 0,
        readIds: [],
        baselineEpochMs: Date.now() - 1000,
      };
      const stored = readStorage<Partial<UpdatesReadState> | null>(
        STORAGE_KEYS.updatesReadState,
        null
      );
      if (!stored || typeof stored.baselineEpochMs !== 'number') {
        try {
          localStorage.setItem(
            STORAGE_KEYS.updatesReadState,
            JSON.stringify(fallback)
          );
        } catch {
          // Ignore storage quota errors
        }
        return fallback;
      }
      return {
        clearedBeforeMs:
          typeof stored.clearedBeforeMs === 'number' ? stored.clearedBeforeMs : 0,
        readIds: Array.isArray(stored.readIds) ? stored.readIds : [],
        baselineEpochMs: stored.baselineEpochMs,
      };
    }
  );
  const [updatesPanelOpen, setUpdatesPanelOpen] = useState(false);
  const [requestedMoreTab, setRequestedMoreTab] = useState<MoreTab | null>(null);
  const [requestedMorePanel, setRequestedMorePanel] = useState<'alerts' | null>(
    null
  );
  const [cloudFiles, setCloudFiles] = useState<CloudFileRecord[]>([]);
  const [cloudFilesRequested, setCloudFilesRequested] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<BackupSnapshot[]>([]);
  const [liveAlertToast, setLiveAlertToast] = useState<{
    title: string;
    body: string;
    channelId?: string;
    iconUrl?: string;
  } | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authRefreshTick, setAuthRefreshTick] = useState(0);
  const [isAllowlistedAdmin, setIsAllowlistedAdmin] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(
    () => readOfflineSyncQueue().length
  );
  const prevOnlineRef = useRef(isOnline);
  const flushingQueueRef = useRef(false);
  const firebaseUserRef = useRef<User | null>(null);
  firebaseUserRef.current = firebaseUser;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const isAllowlistedAdminRef = useRef(false);
  isAllowlistedAdminRef.current = isAllowlistedAdmin;
  const seededCatalogRef = useRef(false);
  const catalogIsEmptyRef = useRef(false);
  const hasRemoteCatalogRef = useRef(false);
  const knownAlertIdsRef = useRef<Set<string> | null>(null);
  const deepLinkHandledRef = useRef(false);
  const notifiedRemindersRef = useRef<Set<string>>(new Set());
  const shownSystemAlertsRef = useRef<Set<string>>(new Set());
  const channelsRef = useRef<Channel[]>(channels);
  channelsRef.current = channels;
  const lastUserSyncKeyRef = useRef<string | null>(null);
  const firestoreChatIdsRef = useRef<Set<string>>(new Set());

  const reportFirebaseSyncError = (actionLabel: string, error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error);
    let detail = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) detail = parsed.error;
    } catch {
      // Raw string message
    }
    const friendly = detail.includes('Missing or insufficient permissions')
      ? 'Firebase permission denied. Verify you are signed in with an authorized account.'
      : detail.includes('offline')
        ? 'Unable to reach Firebase right now. Changes are queued locally.'
        : `${actionLabel}: ${detail.slice(0, 140)}`;
    setLiveAlertToast({
      title: 'Firebase Sync Notice',
      body: friendly,
    });
  };
  const latestCatalogRef = useRef({
    channels,
    guideSchedule,
    heroSlides,
    movies,
    archiveItems,
    newsArticles,
    artists,
    promo,
    appConfig,
    homeConfig,
  });
  latestCatalogRef.current = {
    channels,
    guideSchedule,
    heroSlides,
    movies,
    archiveItems,
    newsArticles,
    artists,
    promo,
    appConfig,
    homeConfig,
  };

  const [showLauncher, setShowLauncher] = useState<boolean>(() => {
    try {
      const hasDeepLink = Boolean(
        new URLSearchParams(window.location.search).get('channel')
      );
      if (hasDeepLink) return false;
    } catch {
      // Ignore URL parse errors
    }
    if (!appConfig.enableLauncherScreen) return false;
    try {
      return sessionStorage.getItem('kotv_launcher_seen_v1') !== '1';
    } catch {
      return true;
    }
  });

  const dismissLauncher = () => {
    setShowLauncher(false);
    try {
      sessionStorage.setItem('kotv_launcher_seen_v1', '1');
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.channels, JSON.stringify(channels));
    } catch {
      // Ignore storage quota errors
    }
  }, [channels]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.guide, JSON.stringify(guideSchedule));
    } catch {
      // Ignore storage quota errors
    }
  }, [guideSchedule]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.heroSlides, JSON.stringify(heroSlides));
    } catch {
      // Ignore storage quota errors
    }
  }, [heroSlides]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.promo, JSON.stringify(promo));
    } catch {
      // Ignore storage quota errors
    }
  }, [promo]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.movies, JSON.stringify(movies));
    } catch {
      // Ignore storage quota errors
    }
  }, [movies]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.archive, JSON.stringify(archiveItems));
    } catch {
      // Ignore storage quota errors
    }
  }, [archiveItems]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.newsArticles,
        JSON.stringify(newsArticles)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [newsArticles]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.artists, JSON.stringify(artists));
    } catch {
      // Ignore storage quota errors
    }
  }, [artists]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.stationUpdates,
        JSON.stringify(stationUpdates.slice(0, 60))
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [stationUpdates]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.updatesReadState,
        JSON.stringify({
          ...updatesReadState,
          readIds: updatesReadState.readIds.slice(-300),
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [updatesReadState]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.appConfig, JSON.stringify(appConfig));
    } catch {
      // Ignore storage quota errors
    }
  }, [appConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.homeConfig, JSON.stringify(homeConfig));
    } catch {
      // Ignore storage quota errors
    }
  }, [homeConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.favorites,
        JSON.stringify(Array.from(favorites))
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.reminders,
        JSON.stringify(Array.from(reminders))
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
    } catch {
      // Ignore storage quota errors
    }
  }, [profile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
      if (!settings.rememberLastChannel) {
        localStorage.removeItem(STORAGE_KEYS.lastChannel);
        localStorage.removeItem(STORAGE_KEYS.resumeChannelActive);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.chatMessages,
        JSON.stringify(chatMessages)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [chatMessages]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.followedSenders,
        JSON.stringify(Array.from(followedSenders))
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [followedSenders]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.continueWatching,
        JSON.stringify(continueWatching.slice(0, 5))
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [continueWatching]);

  useEffect(() => {
    let activeSubscription = true;
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        const directAdmin = isVerifiedAdminUser(user);
        setIsAllowlistedAdmin(directAdmin);
        setProfile((prev) => ({
          ...prev,
          identifier: user.email || prev.identifier,
          displayName:
            user.displayName ||
            (prev.displayName && prev.displayName !== 'Guest'
              ? prev.displayName
              : user.email?.split('@')[0] || 'Viewer'),
          role: directAdmin ? 'admin' : 'viewer',
          signedIn: true,
        }));
        if (!directAdmin && user.emailVerified) {
          void checkAdminAllowlist(user).then((allowed) => {
            if (!activeSubscription || firebaseUserRef.current?.uid !== user.uid) {
              return;
            }
            if (allowed) {
              setIsAllowlistedAdmin(true);
              setProfile((prev) => ({ ...prev, role: 'admin' }));
            }
          });
        }
      } else {
        setIsAllowlistedAdmin(false);
        setProfile((prev) =>
          prev.role === 'admin' ? { ...prev, role: 'viewer' } : prev
        );
      }
    });
    return () => {
      activeSubscription = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    const unsubPublic = subscribePublicBroadcastCatalog({
      onChannels: (nextChannels, isEmpty) => {
        catalogIsEmptyRef.current = isEmpty;
        if (isEmpty) {
          const activeUser = firebaseUserRef.current;
          if (
            activeUser &&
            (isVerifiedAdminUser(activeUser) || isAllowlistedAdminRef.current) &&
            !seededCatalogRef.current
          ) {
            seededCatalogRef.current = true;
            void seedCatalogToFirestore(latestCatalogRef.current).catch((err) =>
              reportFirebaseSyncError('Catalog seed failed', err)
            );
          }
          return;
        }
        hasRemoteCatalogRef.current = true;
        setChannels(nextChannels);
      },
      onGuide: (nextGuide, isEmpty) => {
        if (!isEmpty || hasRemoteCatalogRef.current) {
          setGuideSchedule(nextGuide);
        }
      },
      onHeroSlides: (nextSlides, isEmpty) => {
        if (!isEmpty || hasRemoteCatalogRef.current) {
          setHeroSlides(nextSlides);
        }
      },
      onMovies: (nextMovies, isEmpty) => {
        if (!isEmpty || hasRemoteCatalogRef.current) {
          setMovies(nextMovies);
        }
      },
      onArchive: (nextArchive, isEmpty) => {
        if (!isEmpty || hasRemoteCatalogRef.current) {
          setArchiveItems(nextArchive);
        }
      },
      onNewsArticles: (nextNews, isEmpty) => {
        if (!isEmpty || hasRemoteCatalogRef.current) {
          setNewsArticles(nextNews);
        }
      },
      onArtists: (nextArtists, isEmpty) => {
        if (!isEmpty || hasRemoteCatalogRef.current) {
          setArtists(nextArtists);
        }
      },
      onPromo: (nextPromo) =>
        setPromo((prev) => ({ ...prev, ...nextPromo })),
      onAppConfig: (nextConfig) =>
        setAppConfig((prev) => ({ ...prev, ...nextConfig })),
      onHomeConfig: (nextHomeConfig) =>
        setHomeConfig((prev) => ({ ...prev, ...nextHomeConfig })),
      onChatMessages: (remoteMessages) => {
        firestoreChatIdsRef.current = new Set(remoteMessages.map((m) => m.id));
        const queue = readOfflineSyncQueue();
        setChatMessages((prev) =>
          mergeChatMessagesWithOfflineQueue(remoteMessages, prev, queue)
        );
      },
      onBroadcastAlerts: (alerts) => {
        setBroadcastAlerts(alerts);
        if (knownAlertIdsRef.current === null) {
          knownAlertIdsRef.current = new Set(alerts.map((a) => a.id));
          return;
        }
        const newest = alerts[0];
        if (newest && !knownAlertIdsRef.current.has(newest.id)) {
          setLiveAlertToast({
            title: newest.title,
            body: newest.body,
            channelId: newest.channelId,
            iconUrl: newest.iconUrl,
          });
          const subscribedTopics = readStoredTopics();
          if (
            subscribedTopics.includes(newest.category) &&
            !shownSystemAlertsRef.current.has(newest.id)
          ) {
            shownSystemAlertsRef.current.add(newest.id);
            void showAndroidSystemNotification({
              id: newest.id,
              title: newest.title,
              body: newest.body,
              category: newest.category,
              channelId: newest.channelId,
            });
          }
        }
        knownAlertIdsRef.current = new Set(alerts.map((a) => a.id));
      },
      onStationUpdates: (updates) => {
        setStationUpdates(updates);
      },
    });

    let unsubFcm = () => {};
    void subscribeForegroundFcm((payload) => {
      setLiveAlertToast({
        title: payload.title,
        body: payload.body,
        channelId: payload.channelId,
      });
      void showAndroidSystemNotification({
        id: `fcm-${Date.now()}`,
        title: payload.title,
        body: payload.body,
        category: payload.category || 'live',
        channelId: payload.channelId,
      });
    }).then((unsub) => {
      unsubFcm = unsub;
    });

    const unsubNotifTap = subscribeNotificationTapListener((channelId) => {
      const matched = channelsRef.current.find((c) => c.id === channelId);
      if (matched) {
        setShowLauncher(false);
        setPlayerState({ channelId: matched.id });
      }
    });

    return () => {
      unsubPublic();
      unsubFcm();
      unsubNotifTap();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) return;

    if (
      catalogIsEmptyRef.current &&
      (isVerifiedAdminUser(firebaseUser) || isAllowlistedAdmin) &&
      !seededCatalogRef.current
    ) {
      seededCatalogRef.current = true;
      void seedCatalogToFirestore(latestCatalogRef.current).catch((err) =>
        reportFirebaseSyncError('Catalog seed failed', err)
      );
    }

    const unsubUser = subscribeAuthenticatedUserPreferences(
      firebaseUser,
      (prefs) => {
        const nextDisplayName = prefs.displayName || profile.displayName;
        const nextPlan = prefs.plan || profile.plan;
        const nextFavorites = Array.isArray(prefs.favorites)
          ? prefs.favorites
          : Array.from(favorites);
        const nextReminders = Array.isArray(prefs.reminders)
          ? prefs.reminders
          : Array.from(reminders);
        const nextFollowed = Array.isArray(prefs.followedSenders)
          ? prefs.followedSenders
          : Array.from(followedSenders);
        const nextSettings = prefs.settings || settings;
        const nextContinue = Array.isArray(prefs.continueWatching)
          ? prefs.continueWatching.slice(0, 5)
          : continueWatching.slice(0, 5);

        lastUserSyncKeyRef.current = JSON.stringify({
          uid: firebaseUser.uid,
          displayName: nextDisplayName,
          plan: nextPlan,
          favorites: [...nextFavorites].sort(),
          reminders: [...nextReminders].sort(),
          followedSenders: [...nextFollowed].sort(),
          settings: {
            autoplay: Boolean(nextSettings.autoplay),
            dataSaver: Boolean(nextSettings.dataSaver),
            rememberLastChannel: Boolean(nextSettings.rememberLastChannel),
          },
          continueWatching: nextContinue.map((item) => ({
            id: item.id,
            playedAtMs: item.playedAtMs,
          })),
        });

        if (prefs.displayName || prefs.plan) {
          setProfile((prev) => ({
            ...prev,
            displayName: prefs.displayName || prev.displayName,
            plan: prefs.plan || prev.plan,
          }));
        }
        if (Array.isArray(prefs.favorites)) {
          setFavorites(new Set(prefs.favorites));
        }
        if (Array.isArray(prefs.reminders)) {
          setReminders(new Set(prefs.reminders));
        }
        if (Array.isArray(prefs.followedSenders)) {
          setFollowedSenders(new Set(prefs.followedSenders));
        }
        if (prefs.settings) {
          setSettings(prefs.settings);
        }
        if (Array.isArray(prefs.continueWatching)) {
          setContinueWatching(prefs.continueWatching.slice(0, 5));
        }
      }
    );

    return () => unsubUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, firebaseUser, authRefreshTick, isAllowlistedAdmin]);

  useEffect(() => {
    if (deepLinkHandledRef.current || channels.length === 0) return;
    deepLinkHandledRef.current = true;
    try {
      const targetChannelId = new URLSearchParams(window.location.search).get(
        'channel'
      );
      if (targetChannelId) {
        const matched = channels.find((c) => c.id === targetChannelId);
        if (matched && (appConfig.allowGuestPlayback || profile.signedIn)) {
          recordContinueWatching(matched);
          setPlayerState({ channelId: matched.id });
        }
        return;
      }

      if (
        settings.rememberLastChannel &&
        localStorage.getItem(STORAGE_KEYS.resumeChannelActive) === '1'
      ) {
        const saved = readStorage<{
          channelId?: string;
          contextTitle?: string;
          overrideStreamUrl?: string;
          overrideStreamType?: StreamFormat;
        } | null>(STORAGE_KEYS.lastChannel, null);
        if (saved?.channelId) {
          const matched = channels.find((c) => c.id === saved.channelId);
          if (matched && (appConfig.allowGuestPlayback || profile.signedIn)) {
            setPlayerState({
              channelId: matched.id,
              contextTitle: saved.contextTitle,
              overrideStreamUrl: saved.overrideStreamUrl,
              overrideStreamType: saved.overrideStreamType,
            });
          }
        }
      }
    } catch {
      // Ignore URL / storage parse errors
    }
  }, [
    channels,
    appConfig.allowGuestPlayback,
    profile.signedIn,
    settings.rememberLastChannel,
  ]);

  // Keep shareable ?channel= query parameter synchronized with active player
  useEffect(() => {
    try {
      if (!window.location.protocol.startsWith('http')) return;
      const url = new URL(window.location.href);
      if (playerState?.channelId) {
        if (url.searchParams.get('channel') !== playerState.channelId) {
          url.searchParams.set('channel', playerState.channelId);
          window.history.replaceState(null, '', url.toString());
        }
      } else if (url.searchParams.has('channel')) {
        url.searchParams.delete('channel');
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // Ignore history API errors
    }
  }, [playerState?.channelId]);

  // Check saved programme reminders against live schedule clock
  useEffect(() => {
    if (reminders.size === 0) return;

    const checkReminders = () => {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const todayStamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

      for (const key of reminders) {
        const firstColon = key.indexOf(':');
        const secondColon =
          firstColon >= 0 ? key.indexOf(':', firstColon + 1) : -1;
        if (firstColon < 0 || secondColon <= firstColon) continue;

        const dayOffsetStr = key.slice(0, firstColon);
        const channelId = key.slice(firstColon + 1, secondColon);
        const title = key.slice(secondColon + 1);
        if (dayOffsetStr !== '0') continue;

        const entry = guideSchedule.find((g) => g.channelId === channelId);
        const targetTimeLabel =
          entry && entry.nextTitle === title
            ? entry.nextTime
            : entry && entry.currentTitle === title
              ? entry.currentTime
              : undefined;
        const startMinutes = parseScheduleTimeToMinutes(targetTimeLabel);
        if (startMinutes === null) continue;

        if (nowMinutes >= startMinutes && nowMinutes <= startMinutes + 2) {
          const dedupeKey = `${todayStamp}:${key}`;
          if (notifiedRemindersRef.current.has(dedupeKey)) continue;
          notifiedRemindersRef.current.add(dedupeKey);

          const ch = channels.find((c) => c.id === channelId);
          const toastTitle = `Starting now: ${title}`;
          const toastBody = `${ch?.name || 'Channel'} · ${targetTimeLabel || 'Live now'}`;
          setLiveAlertToast({
            title: toastTitle,
            body: toastBody,
            channelId,
          });

          if (readRemindersEnabled()) {
            void showAndroidSystemNotification({
              id: dedupeKey,
              title: toastTitle,
              body: toastBody,
              category: 'reminder',
              channelId,
            });
          }
        }
      }
    };

    checkReminders();
    const timer = window.setInterval(checkReminders, 15000);
    return () => window.clearInterval(timer);
  }, [reminders, guideSchedule, channels]);

  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) return;
    const justCameOnline = !prevOnlineRef.current && isOnline;
    prevOnlineRef.current = isOnline;
    const syncKey = JSON.stringify({
      uid: firebaseUser.uid,
      displayName: profile.displayName,
      plan: profile.plan,
      favorites: Array.from(favorites).sort(),
      reminders: Array.from(reminders).sort(),
      followedSenders: Array.from(followedSenders).sort(),
      settings: {
        autoplay: Boolean(settings.autoplay),
        dataSaver: Boolean(settings.dataSaver),
        rememberLastChannel: Boolean(settings.rememberLastChannel),
      },
      continueWatching: continueWatching.slice(0, 5).map((item) => ({
        id: item.id,
        playedAtMs: item.playedAtMs,
      })),
    });

    const userDirty = lastUserSyncKeyRef.current !== syncKey;
    if (!userDirty && !justCameOnline && !isOnline) return;

    if (isOnline && (userDirty || justCameOnline)) {
      lastUserSyncKeyRef.current = syncKey;
      void syncUserDocumentsToFirestore({
        user: firebaseUser,
        profile,
        favorites,
        reminders,
        followedSenders,
        settings,
        continueWatching,
      }).catch(() => {
        markOfflineBackupDirty(true);
      });
    } else if (!isOnline && userDirty) {
      markOfflineBackupDirty(true);
    }

    if (!isOnline) return;

    const pendingQueue = readOfflineSyncQueue();
    const dirtyBackup = isOfflineBackupDirty();
    if (pendingQueue.length === 0 && !dirtyBackup && !justCameOnline) return;
    if (flushingQueueRef.current) return;

    flushingQueueRef.current = true;
    void (async () => {
      let syncedItems = 0;
      try {
        for (const item of pendingQueue) {
          try {
            if (item.kind === 'login_event') {
              await recordUserLoginEventToFirestore({
                ...item.event,
                uid: firebaseUser.uid,
              });
              removeOfflineSyncItem(item.id);
              syncedItems += 1;
            } else if (item.kind === 'chat_send') {
              const validChannelId = latestCatalogRef.current.channels.some(
                (c) => c.id === item.message.channelId
              )
                ? item.message.channelId
                : latestCatalogRef.current.channels[0]?.id || item.message.channelId;
              const messageToSync: ChatMessage = {
                ...item.message,
                channelId: validChannelId,
                senderId: firebaseUser.uid,
                senderName:
                  profile.displayName && profile.displayName !== 'Guest'
                    ? profile.displayName
                    : item.message.senderName,
              };
              firestoreChatIdsRef.current.add(messageToSync.id);
              await sendChatMessageToFirestore(messageToSync, firebaseUser.uid);
              if (item.message.likes > 0) {
                await updateChatLikesInFirestore(messageToSync.id, 1).catch(
                  () => undefined
                );
              }
              removeOfflineSyncItem(item.id);
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === messageToSync.id ? { ...m, pendingSync: false } : m
                )
              );
              syncedItems += 1;
            } else if (item.kind === 'chat_like') {
              await updateChatLikesInFirestore(item.messageId, item.delta);
              removeOfflineSyncItem(item.id);
              syncedItems += 1;
            } else if (item.kind === 'chat_delete') {
              await deleteChatMessageFromFirestore(item.messageId);
              removeOfflineSyncItem(item.id);
              syncedItems += 1;
            }
          } catch {
            // Keep remaining item queued until next online opportunity
          }
        }

        const remaining = readOfflineSyncQueue().length;
        setPendingSyncCount(remaining);

        if (syncedItems > 0 || dirtyBackup) {
          await syncUserDocumentsToFirestore({
            user: firebaseUser,
            profile,
            favorites,
            reminders,
            followedSenders,
            settings,
            continueWatching,
          }).catch(() => undefined);

          await createUserCloudBackup({
            user: firebaseUser,
            label: justCameOnline
              ? 'Auto-backup on reconnect'
              : 'Auto-backup synced offline activity',
            profile,
            favorites,
            reminders,
            followedSenders,
            settings,
            continueWatching,
          });
          markOfflineBackupDirty(false);
          if (syncedItems > 0) {
            setLiveAlertToast({
              title: 'Synced & Backed Up to Firebase',
              body: `${syncedItems} queued ${
                syncedItems === 1 ? 'item' : 'items'
              } uploaded and backed up online.`,
            });
          }
        }
      } finally {
        flushingQueueRef.current = false;
      }
    })();
  }, [
    authReady,
    firebaseUser,
    authRefreshTick,
    isOnline,
    profile,
    favorites,
    reminders,
    followedSenders,
    settings,
    continueWatching,
  ]);

  const resolvedPage: NavPage =
    (!appConfig.enableTvGuide && activePage === 'guide') ||
    (!appConfig.enableMovies && activePage === 'movies')
      ? 'home'
      : activePage;

  useEffect(() => {
    if (resolvedPage === 'more' || accountModalState.open) {
      setCloudFilesRequested(true);
    }
  }, [resolvedPage, accountModalState.open]);

  useEffect(() => {
    if (!cloudFilesRequested) return;
    return subscribeCloudFiles(setCloudFiles);
  }, [cloudFilesRequested]);

  const visibleHomeChannels = appConfig.enableRadios
    ? channels
    : channels.filter((ch) => ch.type !== 'Radios');

  const navigateTo = (page: NavPage) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleFavorite = (channelId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  const handleToggleReminder = (key: string) => {
    const removing = reminders.has(key);
    setReminders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    if (removing) {
      void cancelAndroidProgrammeReminder(key);
      return;
    }

    const firstColon = key.indexOf(':');
    const secondColon =
      firstColon >= 0 ? key.indexOf(':', firstColon + 1) : -1;
    if (firstColon >= 0 && secondColon > firstColon) {
      const dayOffsetStr = key.slice(0, firstColon);
      const channelId = key.slice(firstColon + 1, secondColon);
      const title = key.slice(secondColon + 1);
      if (dayOffsetStr === '0' && readRemindersEnabled()) {
        const entry = guideSchedule.find((g) => g.channelId === channelId);
        const targetTimeLabel =
          entry?.nextTitle === title
            ? entry.nextTime
            : entry?.currentTitle === title
              ? entry.currentTime
              : undefined;
        const startMinutes = parseScheduleTimeToMinutes(targetTimeLabel);
        if (startMinutes !== null) {
          const triggerDate = new Date();
          triggerDate.setHours(
            Math.floor(startMinutes / 60),
            startMinutes % 60,
            0,
            0
          );
          const triggerAtMs = triggerDate.getTime();
          if (triggerAtMs > Date.now()) {
            const ch = channels.find((c) => c.id === channelId);
            void scheduleAndroidProgrammeReminder({
              key,
              title: `Starting now: ${title}`,
              body: `${ch?.name || 'Kakumiro Online TV'} · ${targetTimeLabel || 'Live now'}`,
              triggerAtMs,
              channelId,
            });
          }
        }
      }
    }
  };

  const openUserSignInModal = () => {
    setAccountModalState({
      open: true,
      initialView: 'account',
      initialPortal: 'user',
    });
  };

  const openAdminControlPanel = (
    section: 'archive' | 'library' | 'movies' | 'news' | 'artists',
    itemId?: string
  ) => {
    handleClosePlayer();
    setAccountModalState({
      open: true,
      initialView: 'admin',
      initialPortal: 'admin',
      initialAdminSection: section,
      initialArchiveItemId: section === 'archive' ? itemId : undefined,
      initialMovieId: section === 'movies' ? itemId : undefined,
    });
  };

  const handleRecordAuthActivity = (params: {
    uid: string;
    displayName: string;
    eventType: 'login' | 'signup';
    provider: 'google' | 'password';
  }) => {
    const loginId = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const event: UserLoginEvent = {
      id: loginId,
      uid: params.uid,
      displayName: params.displayName || 'Viewer',
      eventType: params.eventType,
      provider: params.provider,
      platform:
        typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
          ? 'android'
          : 'web',
      createdAt: new Date().toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestampMs: Date.now(),
    };
    const activeUser = firebaseUserRef.current || auth.currentUser;
    if (
      isOnlineRef.current &&
      activeUser &&
      activeUser.uid === params.uid &&
      activeUser.emailVerified
    ) {
      void recordUserLoginEventToFirestore(event).catch(() => {
        enqueueOfflineSyncItem({
          kind: 'login_event',
          id: `q-${loginId}`,
          queuedAtMs: Date.now(),
          event,
        });
        markOfflineBackupDirty(true);
        setPendingSyncCount(readOfflineSyncQueue().length);
      });
    } else {
      enqueueOfflineSyncItem({
        kind: 'login_event',
        id: `q-${loginId}`,
        queuedAtMs: Date.now(),
        event,
      });
      markOfflineBackupDirty(true);
      setPendingSyncCount(readOfflineSyncQueue().length);
    }
  };

  const handleSendChatMessage = (
    channelId: string,
    text: string,
    replyTo?: ChatMessage['replyTo'],
    streamKey?: string
  ) => {
    if (!profile.signedIn) {
      openUserSignInModal();
      return;
    }
    const canSyncNow = Boolean(
      isOnline && firebaseUser && firebaseUser.emailVerified
    );
    const newMsg: ChatMessage = {
      id: `chat-${Date.now()}`,
      channelId,
      streamKey: streamKey || channelId,
      senderId: firebaseUser?.uid || 'self',
      senderName: profile.displayName || 'Guest',
      text,
      createdAt: 'Just now',
      timestampMs: networkTime.now.getTime(),
      likes: 0,
      likedByMe: false,
      pendingSync: !canSyncNow,
      replyTo,
    };
    setChatMessages((prev) => [...prev, newMsg]);
    if (canSyncNow && firebaseUser) {
      firestoreChatIdsRef.current.add(newMsg.id);
      void sendChatMessageToFirestore(newMsg, firebaseUser.uid).catch(() => {
        firestoreChatIdsRef.current.delete(newMsg.id);
        const queuedMsg = { ...newMsg, pendingSync: true };
        enqueueOfflineSyncItem({
          kind: 'chat_send',
          id: `q-${newMsg.id}`,
          queuedAtMs: Date.now(),
          message: queuedMsg,
        });
        markOfflineBackupDirty(true);
        setPendingSyncCount(readOfflineSyncQueue().length);
        setChatMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? queuedMsg : m))
        );
      });
    } else {
      enqueueOfflineSyncItem({
        kind: 'chat_send',
        id: `q-${newMsg.id}`,
        queuedAtMs: Date.now(),
        message: newMsg,
      });
      markOfflineBackupDirty(true);
      setPendingSyncCount(readOfflineSyncQueue().length);
    }
  };

  const handleToggleLikeMessage = (messageId: string) => {
    if (!profile.signedIn) {
      openUserSignInModal();
      return;
    }
    let delta: 1 | -1 = 1;
    let found = false;
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        found = true;
        const nextLiked = !msg.likedByMe;
        delta = nextLiked ? 1 : -1;
        const nextLikes = Math.max(0, msg.likes + delta);
        return {
          ...msg,
          likedByMe: nextLiked,
          likes: nextLikes,
        };
      })
    );
    if (!found) return;
    if (
      isOnline &&
      firebaseUser &&
      firebaseUser.emailVerified &&
      firestoreChatIdsRef.current.has(messageId)
    ) {
      void updateChatLikesInFirestore(messageId, delta).catch(() => {
        enqueueOfflineSyncItem({
          kind: 'chat_like',
          id: `qlike-${Date.now()}-${messageId}`,
          queuedAtMs: Date.now(),
          messageId,
          delta,
        });
        markOfflineBackupDirty(true);
        setPendingSyncCount(readOfflineSyncQueue().length);
      });
    } else {
      enqueueOfflineSyncItem({
        kind: 'chat_like',
        id: `qlike-${Date.now()}-${messageId}`,
        queuedAtMs: Date.now(),
        messageId,
        delta,
      });
      markOfflineBackupDirty(true);
      setPendingSyncCount(readOfflineSyncQueue().length);
    }
  };

  const handleDeleteChatMessage = (messageId: string) => {
    setChatMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    if (
      isOnline &&
      firebaseUser &&
      firebaseUser.emailVerified &&
      firestoreChatIdsRef.current.has(messageId)
    ) {
      firestoreChatIdsRef.current.delete(messageId);
      void deleteChatMessageFromFirestore(messageId).catch(() => {
        enqueueOfflineSyncItem({
          kind: 'chat_delete',
          id: `qdel-${Date.now()}-${messageId}`,
          queuedAtMs: Date.now(),
          messageId,
        });
        markOfflineBackupDirty(true);
        setPendingSyncCount(readOfflineSyncQueue().length);
      });
    } else {
      enqueueOfflineSyncItem({
        kind: 'chat_delete',
        id: `qdel-${Date.now()}-${messageId}`,
        queuedAtMs: Date.now(),
        messageId,
      });
      markOfflineBackupDirty(true);
      setPendingSyncCount(readOfflineSyncQueue().length);
    }
  };

  const handleToggleFollowSender = (senderId: string) => {
    if (!profile.signedIn) {
      openUserSignInModal();
      return;
    }
    setFollowedSenders((prev) => {
      const next = new Set(prev);
      if (next.has(senderId)) {
        next.delete(senderId);
      } else {
        next.add(senderId);
      }
      return next;
    });
  };

  const canSyncAdminCatalog = Boolean(
    firebaseUser &&
      firebaseUser.emailVerified &&
      (isVerifiedAdminUser(firebaseUser) || isAllowlistedAdmin)
  );

  useEffect(() => {
    if (!authReady || !canSyncAdminCatalog) {
      setCloudBackups([]);
      return;
    }
    return subscribeCloudBackups(setCloudBackups);
  }, [authReady, canSyncAdminCatalog]);

  const emitStationUpdate = (params: {
    category: StationUpdateCategory;
    title: string;
    summary: string;
    targetId?: string;
    channelId?: string;
    iconUrl?: string;
    actionLabel?: string;
  }) => {
    const update: StationUpdate = {
      id: `upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: params.category,
      title: params.title,
      summary: params.summary,
      targetId: params.targetId,
      channelId: params.channelId,
      iconUrl: params.iconUrl,
      actionLabel: params.actionLabel,
      createdAt: networkTime.now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestampMs: Date.now(),
      sentByUid: firebaseUser?.uid,
    };
    setStationUpdates((prev) => [update, ...prev].slice(0, 60));
    if (canSyncAdminCatalog && firebaseUser) {
      void publishStationUpdateToFirestore(update, firebaseUser.uid).catch(
        () => undefined
      );
    }
  };

  const handleAddChannel = (channel: Channel) => {
    setChannels((prev) => [channel, ...prev]);
    emitStationUpdate({
      category: channel.type === 'Radios' ? 'radio' : 'live',
      title:
        channel.type === 'Radios'
          ? `New Radio: ${channel.name}`
          : `New Live Channel: ${channel.name}`,
      summary: channel.program || channel.subtitle || 'Added via Control Panel',
      targetId: channel.id,
      channelId: channel.id,
      iconUrl:
        channel.iconUrl ||
        (channel.type === 'Radios'
          ? homeConfig.radioIconUrl
          : homeConfig.stationIconUrl),
      actionLabel: channel.type === 'Radios' ? 'Listen live' : 'Watch live',
    });
    if (canSyncAdminCatalog) {
      void saveChannelToFirestore(channel).catch((err) =>
        reportFirebaseSyncError('Channel sync failed', err)
      );
    }
  };

  const handleUpdateChannel = (updated: Channel) => {
    const prevChannel = channels.find((ch) => ch.id === updated.id);
    const prevUrl = (prevChannel?.streamUrl || '').trim();
    const nextUrl = (updated.streamUrl || '').trim();

    setChannels((prev) =>
      prev.map((ch) => (ch.id === updated.id ? updated : ch))
    );
    emitStationUpdate({
      category: updated.type === 'Radios' ? 'radio' : 'channel',
      title:
        updated.type === 'Radios'
          ? `Radio Updated: ${updated.name}`
          : `Channel Updated: ${updated.name}`,
      summary: updated.program || updated.subtitle || 'Updated in Control Panel',
      targetId: updated.id,
      channelId: updated.id,
      iconUrl:
        updated.iconUrl ||
        (updated.type === 'Radios'
          ? homeConfig.radioIconUrl
          : homeConfig.stationIconUrl),
      actionLabel: updated.type === 'Radios' ? 'Listen live' : 'Watch channel',
    });
    if (canSyncAdminCatalog) {
      void saveChannelToFirestore(updated).catch((err) =>
        reportFirebaseSyncError('Channel update sync failed', err)
      );
    }

    if (prevUrl !== nextUrl) {
      const idsToDelete = chatMessages
        .filter(
          (msg) =>
            msg.channelId === updated.id ||
            msg.streamKey === updated.id ||
            msg.streamKey?.startsWith(`${updated.id}::`)
        )
        .map((m) => m.id);
      setChatMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.channelId !== updated.id &&
            msg.streamKey !== updated.id &&
            !msg.streamKey?.startsWith(`${updated.id}::`)
        )
      );
      if (canSyncAdminCatalog && idsToDelete.length > 0) {
        void deleteChatMessagesBatchFromFirestore(idsToDelete).catch((err) =>
          reportFirebaseSyncError('Chat cleanup failed', err)
        );
      }
    }
  };

  const handleDeleteChannel = (channelId: string) => {
    const idsToDelete = chatMessages
      .filter(
        (msg) =>
          msg.channelId === channelId ||
          msg.streamKey === channelId ||
          msg.streamKey?.startsWith(`${channelId}::`)
      )
      .map((m) => m.id);
    setChannels((prev) => prev.filter((ch) => ch.id !== channelId));
    setChatMessages((prev) =>
      prev.filter(
        (msg) =>
          msg.channelId !== channelId &&
          msg.streamKey !== channelId &&
          !msg.streamKey?.startsWith(`${channelId}::`)
      )
    );
    if (canSyncAdminCatalog) {
      void deleteChannelFromFirestore(channelId).catch((err) =>
        reportFirebaseSyncError('Channel delete failed', err)
      );
      if (idsToDelete.length > 0) {
        void deleteChatMessagesBatchFromFirestore(idsToDelete).catch((err) =>
          reportFirebaseSyncError('Chat cleanup failed', err)
        );
      }
    }
  };

  const handleUpdateGuideProgramme = (entry: GuideProgramme) => {
    setGuideSchedule((prev) => {
      const exists = prev.some((g) => g.channelId === entry.channelId);
      return exists
        ? prev.map((g) => (g.channelId === entry.channelId ? entry : g))
        : [...prev, entry];
    });
    const ch = channels.find((c) => c.id === entry.channelId);
    emitStationUpdate({
      category: 'tvGuide',
      title: `TV Guide: ${entry.currentTitle}`,
      summary: `${ch?.name || 'Station'} · ${entry.currentTime} · Next: ${entry.nextTitle}`,
      targetId: entry.channelId,
      channelId: entry.channelId,
      iconUrl: ch?.iconUrl || homeConfig.stationIconUrl,
      actionLabel: 'View TV Guide',
    });
    if (canSyncAdminCatalog) {
      void saveGuideSlotToFirestore(entry).catch((err) =>
        reportFirebaseSyncError('TV Guide sync failed', err)
      );
    }
  };

  const handleAddHeroSlide = (slide: HeroSlide) => {
    setHeroSlides((prev) => [...prev, slide]);
    emitStationUpdate({
      category: 'admin',
      title: `Spotlight Added: ${slide.title}`,
      summary: slide.subtitle || slide.kicker || 'New Home spotlight feature',
      targetId: slide.id,
      channelId: slide.channelId,
      iconUrl: slide.imagePath,
      actionLabel: 'Watch spotlight',
    });
    if (canSyncAdminCatalog) {
      void saveHeroSlideToFirestore(slide).catch((err) =>
        reportFirebaseSyncError('Hero slide sync failed', err)
      );
    }
  };

  const handleUpdateHeroSlide = (updatedSlide: HeroSlide) => {
    const prevSlide = heroSlides.find((s) => s.id === updatedSlide.id);
    const prevUrl = (prevSlide?.streamUrl || '').trim();
    const nextUrl = (updatedSlide.streamUrl || '').trim();

    setHeroSlides((prev) =>
      prev.map((s) => (s.id === updatedSlide.id ? updatedSlide : s))
    );
    emitStationUpdate({
      category: 'admin',
      title: `Spotlight Updated: ${updatedSlide.title}`,
      summary: updatedSlide.subtitle || updatedSlide.kicker || 'Updated in Control Panel',
      targetId: updatedSlide.id,
      channelId: updatedSlide.channelId,
      iconUrl: updatedSlide.imagePath,
      actionLabel: 'Watch spotlight',
    });
    if (canSyncAdminCatalog) {
      void saveHeroSlideToFirestore(updatedSlide).catch((err) =>
        reportFirebaseSyncError('Hero slide update failed', err)
      );
    }

    if (prevUrl !== nextUrl && prevUrl) {
      const idsToDelete = chatMessages
        .filter((msg) => msg.streamKey?.endsWith(`::${prevUrl}`))
        .map((m) => m.id);
      setChatMessages((prev) =>
        prev.filter((msg) => !msg.streamKey?.endsWith(`::${prevUrl}`))
      );
      if (canSyncAdminCatalog && idsToDelete.length > 0) {
        void deleteChatMessagesBatchFromFirestore(idsToDelete).catch((err) =>
          reportFirebaseSyncError('Chat cleanup failed', err)
        );
      }
    }
  };

  const handleDeleteHeroSlide = (slideId: string) => {
    if (heroSlides.length <= 1) return;
    setHeroSlides((prev) =>
      prev.length > 1 ? prev.filter((s) => s.id !== slideId) : prev
    );
    if (canSyncAdminCatalog) {
      void deleteHeroSlideFromFirestore(slideId).catch((err) =>
        reportFirebaseSyncError('Hero slide delete failed', err)
      );
    }
  };

  const handleUpdatePromo = (nextPromo: PromoConfig) => {
    const prevUrl = (promo.streamUrl || '').trim();
    const nextUrl = (nextPromo.streamUrl || '').trim();
    setPromo(nextPromo);
    emitStationUpdate({
      category: 'admin',
      title: `Promo Updated: ${nextPromo.heading || 'Station Promo'}`,
      summary: nextPromo.description || 'Updated promotional highlight in Control Panel',
      channelId: nextPromo.channelId,
      iconUrl: nextPromo.imagePath || homeConfig.updatesIconUrl,
      actionLabel: 'View Home',
    });
    if (canSyncAdminCatalog) {
      void savePromoToFirestore(nextPromo).catch((err) =>
        reportFirebaseSyncError('Promo sync failed', err)
      );
    }

    if (prevUrl !== nextUrl && prevUrl) {
      const idsToDelete = chatMessages
        .filter((msg) => msg.streamKey?.endsWith(`::${prevUrl}`))
        .map((m) => m.id);
      setChatMessages((prev) =>
        prev.filter((msg) => !msg.streamKey?.endsWith(`::${prevUrl}`))
      );
      if (canSyncAdminCatalog && idsToDelete.length > 0) {
        void deleteChatMessagesBatchFromFirestore(idsToDelete).catch((err) =>
          reportFirebaseSyncError('Chat cleanup failed', err)
        );
      }
    }
  };

  const handleAddMovie = (movie: MovieItem) => {
    setMovies((prev) => [movie, ...prev]);
    emitStationUpdate({
      category: 'movie',
      title: `New ${movie.format === 'series' ? 'Series' : 'Movie'}: ${movie.title}`,
      summary: `${movie.genre} · ${movie.duration} · ${movie.channelName}`,
      targetId: movie.id,
      channelId: movie.channelId,
      iconUrl: movie.posterPath || homeConfig.movieAutoArtUrl,
      actionLabel: 'Watch movie',
    });
    if (canSyncAdminCatalog) {
      void saveMovieToFirestore(movie).catch((err) =>
        reportFirebaseSyncError('Movie sync failed', err)
      );
    }
  };

  const handleUpdateMovie = (updatedMovie: MovieItem) => {
    const prevMovie = movies.find((m) => m.id === updatedMovie.id);
    const prevUrl = (prevMovie?.streamUrl || '').trim();
    const nextUrl = (updatedMovie.streamUrl || '').trim();

    setMovies((prev) =>
      prev.map((m) => (m.id === updatedMovie.id ? updatedMovie : m))
    );
    emitStationUpdate({
      category: 'movie',
      title: `Updated: ${updatedMovie.title}`,
      summary: `${updatedMovie.genre} · ${updatedMovie.duration}`,
      targetId: updatedMovie.id,
      channelId: updatedMovie.channelId,
      iconUrl: updatedMovie.posterPath || homeConfig.movieAutoArtUrl,
      actionLabel: 'Watch movie',
    });
    if (canSyncAdminCatalog) {
      void saveMovieToFirestore(updatedMovie).catch((err) =>
        reportFirebaseSyncError('Movie update failed', err)
      );
    }

    if (prevUrl !== nextUrl && prevUrl) {
      const idsToDelete = chatMessages
        .filter((msg) => msg.streamKey?.endsWith(`::${prevUrl}`))
        .map((m) => m.id);
      setChatMessages((prev) =>
        prev.filter((msg) => !msg.streamKey?.endsWith(`::${prevUrl}`))
      );
      if (canSyncAdminCatalog && idsToDelete.length > 0) {
        void deleteChatMessagesBatchFromFirestore(idsToDelete).catch((err) =>
          reportFirebaseSyncError('Chat cleanup failed', err)
        );
      }
    }
  };

  const handleDeleteMovie = (movieId: string) => {
    setMovies((prev) => prev.filter((m) => m.id !== movieId));
    if (canSyncAdminCatalog) {
      void deleteMovieFromFirestore(movieId).catch((err) =>
        reportFirebaseSyncError('Movie delete failed', err)
      );
    }
  };

  const handleAddArchiveItem = (item: ArchiveItem) => {
    setArchiveItems((prev) => [item, ...prev]);
    emitStationUpdate({
      category: item.category === 'podcast' ? 'podcast' : 'archive',
      title:
        item.category === 'podcast'
          ? `New Podcast: ${item.title}`
          : `New Catch-Up: ${item.title}`,
      summary: `${item.channelName} · ${item.duration}`,
      targetId: item.id,
      channelId: item.channelId,
      iconUrl:
        item.thumbnailPath ||
        (item.category === 'podcast'
          ? homeConfig.podcastAutoArtUrl
          : homeConfig.tvArchiveAutoArtUrl),
      actionLabel: item.category === 'podcast' ? 'Listen now' : 'Watch catch-up',
    });
    if (canSyncAdminCatalog) {
      void saveArchiveItemToFirestore(item).catch((err) =>
        reportFirebaseSyncError('Archive item sync failed', err)
      );
    }
  };

  const handleUpdateArchiveItem = (updatedItem: ArchiveItem) => {
    setArchiveItems((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    emitStationUpdate({
      category: updatedItem.category === 'podcast' ? 'podcast' : 'archive',
      title:
        updatedItem.category === 'podcast'
          ? `Podcast Updated: ${updatedItem.title}`
          : `Archive Updated: ${updatedItem.title}`,
      summary: `${updatedItem.channelName} · ${updatedItem.duration}`,
      targetId: updatedItem.id,
      channelId: updatedItem.channelId,
      iconUrl:
        updatedItem.thumbnailPath ||
        (updatedItem.category === 'podcast'
          ? homeConfig.podcastAutoArtUrl
          : homeConfig.tvArchiveAutoArtUrl),
      actionLabel:
        updatedItem.category === 'podcast' ? 'Listen now' : 'Watch catch-up',
    });
    if (canSyncAdminCatalog) {
      void saveArchiveItemToFirestore(updatedItem).catch((err) =>
        reportFirebaseSyncError('Archive update failed', err)
      );
    }
  };

  const handleDeleteArchiveItem = (itemId: string) => {
    setArchiveItems((prev) => prev.filter((item) => item.id !== itemId));
    if (canSyncAdminCatalog) {
      void deleteArchiveItemFromFirestore(itemId).catch((err) =>
        reportFirebaseSyncError('Archive delete failed', err)
      );
    }
  };

  const handleAddNewsArticle = (article: NewsArticle) => {
    setNewsArticles((prev) => [article, ...prev]);
    emitStationUpdate({
      category: 'news',
      title: article.headline,
      summary: article.summary || `${article.category} · ${article.author}`,
      targetId: article.id,
      channelId: article.channelId,
      iconUrl: article.imageUrl || homeConfig.newsIconUrl,
      actionLabel: 'Read news',
    });
    if (canSyncAdminCatalog) {
      void saveNewsArticleToFirestore(article, firebaseUser?.uid).catch((err) =>
        reportFirebaseSyncError('Breaking news sync failed', err)
      );
    }
  };

  const handleUpdateNewsArticle = (updatedArticle: NewsArticle) => {
    setNewsArticles((prev) =>
      prev.map((item) => (item.id === updatedArticle.id ? updatedArticle : item))
    );
    emitStationUpdate({
      category: 'news',
      title: `News Updated: ${updatedArticle.headline}`,
      summary:
        updatedArticle.summary ||
        `${updatedArticle.category} · ${updatedArticle.author}`,
      targetId: updatedArticle.id,
      channelId: updatedArticle.channelId,
      iconUrl: updatedArticle.imageUrl || homeConfig.newsIconUrl,
      actionLabel: 'Read news',
    });
    if (canSyncAdminCatalog) {
      void saveNewsArticleToFirestore(updatedArticle, firebaseUser?.uid).catch(
        (err) => reportFirebaseSyncError('Breaking news update failed', err)
      );
    }
  };

  const handleDeleteNewsArticle = (articleId: string) => {
    setNewsArticles((prev) => prev.filter((item) => item.id !== articleId));
    if (canSyncAdminCatalog) {
      void deleteNewsArticleFromFirestore(articleId).catch((err) =>
        reportFirebaseSyncError('Breaking news delete failed', err)
      );
    }
  };

  const handleAddArtist = (artist: ArtistProfile) => {
    setArtists((prev) => [artist, ...prev]);
    emitStationUpdate({
      category: 'artist',
      title: `New Artist: ${artist.name}`,
      summary: `${artist.stageGenre} · ${artist.latestRelease} · ${artist.origin}`,
      targetId: artist.id,
      channelId: artist.channelId,
      iconUrl: artist.photoUrl,
      actionLabel: 'View artist',
    });
    if (canSyncAdminCatalog) {
      void saveArtistToFirestore(artist, firebaseUser?.uid).catch((err) =>
        reportFirebaseSyncError('Artist sync failed', err)
      );
    }
  };

  const handleUpdateArtist = (updatedArtist: ArtistProfile) => {
    setArtists((prev) =>
      prev.map((item) => (item.id === updatedArtist.id ? updatedArtist : item))
    );
    emitStationUpdate({
      category: 'artist',
      title: `Artist Updated: ${updatedArtist.name}`,
      summary: `${updatedArtist.stageGenre} · ${updatedArtist.latestRelease}`,
      targetId: updatedArtist.id,
      channelId: updatedArtist.channelId,
      iconUrl: updatedArtist.photoUrl,
      actionLabel: 'View artist',
    });
    if (canSyncAdminCatalog) {
      void saveArtistToFirestore(updatedArtist, firebaseUser?.uid).catch((err) =>
        reportFirebaseSyncError('Artist update failed', err)
      );
    }
  };

  const handleDeleteArtist = (artistId: string) => {
    setArtists((prev) => prev.filter((item) => item.id !== artistId));
    if (canSyncAdminCatalog) {
      void deleteArtistFromFirestore(artistId).catch((err) =>
        reportFirebaseSyncError('Artist delete failed', err)
      );
    }
  };

  const handleUpdateAppConfig = (nextConfig: AppConfig) => {
    setAppConfig(nextConfig);
    emitStationUpdate({
      category: 'admin',
      title:
        nextConfig.announcementEnabled && nextConfig.announcementText.trim()
          ? 'Station Announcement'
          : 'Control Panel Settings Updated',
      summary:
        nextConfig.announcementEnabled && nextConfig.announcementText.trim()
          ? nextConfig.announcementText.trim()
          : 'Global station features & playback configuration updated.',
      iconUrl: homeConfig.updatesIconUrl,
      actionLabel: 'View Home',
    });
    if (canSyncAdminCatalog) {
      void saveAppConfigToFirestore(nextConfig).catch((err) =>
        reportFirebaseSyncError('App config sync failed', err)
      );
    }
  };

  const handleUpdateHomeConfig = (nextHomeConfig: HomeConfig) => {
    setHomeConfig(nextHomeConfig);
    emitStationUpdate({
      category: 'admin',
      title: 'Home Layout & Station Icons Updated',
      summary: 'Updated channel icons, auto art, or Home sections from Control Panel.',
      iconUrl: nextHomeConfig.updatesIconUrl || nextHomeConfig.stationIconUrl,
      actionLabel: 'View Home',
    });
    if (canSyncAdminCatalog) {
      void saveHomeConfigToFirestore(nextHomeConfig).catch((err) =>
        reportFirebaseSyncError('Home layout sync failed', err)
      );
    }
  };

  const handlePublishBroadcastAlert = async (params: {
    category: BroadcastAlertCategory;
    title: string;
    body: string;
    channelId?: string;
    iconUrl?: string;
  }): Promise<string> => {
    if (!firebaseUser || !canSyncAdminCatalog) {
      throw new Error('Sign in as the station administrator to send live alerts.');
    }

    const alert: BroadcastAlert = {
      id: `alert-${Date.now()}`,
      category: params.category,
      title: params.title,
      body: params.body,
      channelId: params.channelId,
      iconUrl: params.iconUrl,
      createdAt: networkTime.now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestampMs: Date.now(),
      sentByUid: firebaseUser.uid,
    };

    knownAlertIdsRef.current?.add(alert.id);
    setBroadcastAlerts((prev) => [alert, ...prev]);
    await publishBroadcastAlertToFirestore(alert, firebaseUser.uid);

    const [idToken, pushTargets] = await Promise.all([
      firebaseUser.getIdToken(),
      fetchPushTargetsForAdmin(),
    ]);

    const res = await fetch('/api/fcm/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        alertId: alert.id,
        category: alert.category,
        title: alert.title,
        body: alert.body,
        channelId: alert.channelId,
        tokens: pushTargets.fcmTokens,
        webPushSubscriptions: pushTargets.webPushSubscriptions,
      }),
    });

    if (!res.ok) {
      return 'Alert synced in real time to viewers. Push dispatch returned an error.';
    }

    const data = (await res.json()) as {
      fcmServerReady?: boolean;
      webPushReady?: boolean;
      deliveredCount?: number;
      webPushDelivered?: number;
      fcmDelivered?: number;
      targetedCount?: number;
      note?: string;
    };

    if ((data.deliveredCount ?? 0) > 0) {
      return `Live alert synced and pushed to ${data.deliveredCount} subscribed device(s).`;
    }
    return data.note || 'Live broadcast alert synced in real time to all viewers.';
  };

  const handleDeleteBroadcastAlert = (alertId: string) => {
    setBroadcastAlerts((prev) => prev.filter((a) => a.id !== alertId));
    if (canSyncAdminCatalog) {
      void deleteBroadcastAlertFromFirestore(alertId).catch((err) =>
        reportFirebaseSyncError('Alert delete failed', err)
      );
    }
  };

  const handleApplyRestoredCatalog = (payload: CatalogBackupPayload) => {
    if (Array.isArray(payload.channels) && payload.channels.length > 0) {
      setChannels(payload.channels);
    }
    if (Array.isArray(payload.guideSchedule)) {
      setGuideSchedule(payload.guideSchedule);
    }
    if (Array.isArray(payload.heroSlides) && payload.heroSlides.length > 0) {
      setHeroSlides(payload.heroSlides);
    }
    if (Array.isArray(payload.movies)) {
      setMovies(payload.movies);
    }
    if (Array.isArray(payload.archiveItems)) {
      setArchiveItems(payload.archiveItems);
    }
    if (payload.promo) {
      setPromo((prev) => ({ ...prev, ...payload.promo }));
    }
    if (payload.appConfig) {
      setAppConfig((prev) => ({ ...prev, ...payload.appConfig }));
    }
    if (payload.homeConfig) {
      setHomeConfig((prev) => ({ ...prev, ...payload.homeConfig }));
    }
  };

  const handleResetDefaults = () => {
    if (firebaseUser && canSyncAdminCatalog) {
      void createCloudBackup({
        label: 'Auto-backup before factory reset',
        user: firebaseUser,
        catalog: {
          ...latestCatalogRef.current,
          broadcastAlerts,
        },
      }).catch(() => undefined);
    }
    setChannels(INITIAL_CHANNELS);
    setGuideSchedule(GUIDE_SCHEDULE[0]);
    setHeroSlides(HERO_SLIDES);
    setPromo(DEFAULT_PROMO);
    setMovies(INITIAL_MOVIES);
    setArchiveItems(ARCHIVE_ITEMS);
    setNewsArticles(INITIAL_NEWS_ARTICLES);
    setArtists(INITIAL_ARTISTS);
    setAppConfig(DEFAULT_APP_CONFIG);
    setHomeConfig(DEFAULT_HOME_CONFIG);
    if (canSyncAdminCatalog) {
      void seedCatalogToFirestore({
        channels: INITIAL_CHANNELS,
        guideSchedule: GUIDE_SCHEDULE[0],
        heroSlides: HERO_SLIDES,
        movies: INITIAL_MOVIES,
        archiveItems: ARCHIVE_ITEMS,
        newsArticles: INITIAL_NEWS_ARTICLES,
        artists: INITIAL_ARTISTS,
        promo: DEFAULT_PROMO,
        appConfig: DEFAULT_APP_CONFIG,
        homeConfig: DEFAULT_HOME_CONFIG,
      }).catch((err) => reportFirebaseSyncError('Reset catalog sync failed', err));
    }
  };

  const recordContinueWatching = (
    channel: Channel,
    contextTitle?: string,
    overrideStreamUrl?: string,
    overrideStreamType?: StreamFormat
  ) => {
    const matchedMovie = overrideStreamUrl
      ? movies.find(
          (m) =>
            m.streamUrl === overrideStreamUrl &&
            (!contextTitle || m.title === contextTitle)
        ) ||
        movies.find(
          (m) =>
            (m.streamUrl && m.streamUrl === overrideStreamUrl) ||
            (contextTitle && m.title === contextTitle)
        )
      : undefined;

    const entry: ContinueWatchingItem = matchedMovie
      ? {
          id: `movie:${matchedMovie.id}`,
          kind: 'movie',
          channelId: channel.id,
          channelName: channel.name,
          brand: channel.brand,
          title: matchedMovie.title,
          subtitle:
            [matchedMovie.genre, matchedMovie.duration]
              .filter(Boolean)
              .join(' · ') || channel.name,
          posterPath: matchedMovie.posterPath,
          overrideStreamUrl: matchedMovie.streamUrl || overrideStreamUrl,
          overrideStreamType: matchedMovie.streamType || overrideStreamType,
          playedAtMs: networkTime.now.getTime(),
        }
      : {
          id: overrideStreamUrl
            ? `stream:${channel.id}:${contextTitle || overrideStreamUrl}`
            : `channel:${channel.id}`,
          kind: 'channel',
          channelId: channel.id,
          channelName: channel.name,
          brand: channel.brand,
          title: overrideStreamUrl ? contextTitle || channel.name : channel.name,
          subtitle: overrideStreamUrl
            ? channel.name
            : contextTitle || channel.program || channel.subtitle || 'Live Broadcast',
          overrideStreamUrl,
          overrideStreamType,
          playedAtMs: networkTime.now.getTime(),
        };

    setContinueWatching((prev) =>
      [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 5)
    );
  };

  const handleRemoveContinueWatching = (itemId: string) => {
    setContinueWatching((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleClearContinueWatching = () => {
    setContinueWatching([]);
  };

  const handleOpenPlayer = (
    channel: Channel,
    contextTitle?: string,
    overrideStreamUrl?: string,
    overrideStreamType?: StreamFormat
  ) => {
    if (!appConfig.allowGuestPlayback && !profile.signedIn) {
      openUserSignInModal();
      return;
    }
    recordContinueWatching(
      channel,
      contextTitle,
      overrideStreamUrl,
      overrideStreamType
    );
    const nextState = {
      channelId: channel.id,
      contextTitle,
      overrideStreamUrl,
      overrideStreamType,
    };
    if (settings.rememberLastChannel) {
      try {
        localStorage.setItem(STORAGE_KEYS.lastChannel, JSON.stringify(nextState));
        localStorage.setItem(STORAGE_KEYS.resumeChannelActive, '1');
      } catch {
        // Ignore storage errors
      }
    }
    setPlayerState(nextState);
  };

  const handleClosePlayer = () => {
    setPlayerState(null);
    try {
      localStorage.removeItem(STORAGE_KEYS.resumeChannelActive);
    } catch {
      // Ignore storage errors
    }
  };

  const handleMobileSearchClick = () => {
    setActivePage('channels');
    setShowSearchInput(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const unifiedUpdates = buildUnifiedUpdatesFeed({
    stationUpdates,
    broadcastAlerts,
    newsArticles,
    artists,
    archiveItems,
    channels,
    movies,
    homeConfig,
    readState: updatesReadState,
    nowMs: networkTime.now.getTime(),
  });
  const unreadUpdatesCount = unifiedUpdates.filter((u) => u.isUnread).length;

  const handleMarkAllUpdatesRead = () => {
    setUpdatesReadState((prev) => ({
      ...prev,
      clearedBeforeMs: Date.now(),
      readIds: Array.from(
        new Set([...prev.readIds, ...unifiedUpdates.map((u) => u.id)])
      ).slice(-300),
    }));
  };

  const handleSelectUpdateItem = (item: UnifiedUpdateItem) => {
    setUpdatesReadState((prev) => ({
      ...prev,
      readIds: Array.from(new Set([...prev.readIds, item.id])).slice(-300),
    }));
    setUpdatesPanelOpen(false);

    const matchedChannel = item.channelId
      ? channels.find((c) => c.id === item.channelId)
      : undefined;

    if (item.category === 'news') {
      setRequestedMoreTab('news');
      navigateTo('more');
      return;
    }
    if (item.category === 'artist') {
      setRequestedMoreTab('artists');
      navigateTo('more');
      return;
    }
    if (item.category === 'podcast') {
      setRequestedMoreTab('podcasts');
      navigateTo('more');
      return;
    }
    if (item.category === 'archive') {
      setRequestedMoreTab('archive');
      navigateTo('more');
      return;
    }
    if (item.category === 'movie') {
      if (appConfig.enableMovies) {
        navigateTo('movies');
      } else {
        setRequestedMoreTab('movies');
        navigateTo('more');
      }
      return;
    }
    if (item.category === 'tvGuide') {
      if (appConfig.enableTvGuide) {
        navigateTo('guide');
      } else {
        navigateTo('channels');
      }
      return;
    }
    if (
      item.category === 'live' ||
      item.category === 'channel' ||
      item.category === 'radio' ||
      item.category === 'sports'
    ) {
      if (matchedChannel) {
        handleOpenPlayer(matchedChannel);
      } else {
        setChannelFilter(item.category === 'radio' ? 'Radios' : 'Television');
        navigateTo('channels');
      }
      return;
    }
    if (matchedChannel) {
      handleOpenPlayer(matchedChannel);
    } else {
      navigateTo('home');
    }
  };

  const handleDeleteUpdateItem = (item: UnifiedUpdateItem) => {
    if (item.source === 'station') {
      setStationUpdates((prev) => prev.filter((u) => u.id !== item.id));
      if (canSyncAdminCatalog) {
        void deleteStationUpdateFromFirestore(item.id).catch(() => undefined);
      }
    } else if (item.source === 'alert') {
      const alertId = item.id.replace(/^alert:/, '');
      handleDeleteBroadcastAlert(alertId);
    }
  };

  const activePlayerChannel = playerState
    ? channels.find((c) => c.id === playerState.channelId) || null
    : null;

  const navItems: { id: NavPage; label: string; Icon: typeof Home }[] = [
    { id: 'home', label: 'Home', Icon: Home },
    { id: 'channels', label: 'Channels', Icon: Tv },
    ...(appConfig.enableTvGuide
      ? [{ id: 'guide' as const, label: 'TV Guide', Icon: CalendarRange }]
      : []),
    ...(appConfig.enableMovies
      ? [{ id: 'movies' as const, label: 'Movies', Icon: Film }]
      : []),
    { id: 'more', label: 'More', Icon: LayoutGrid },
  ];

  return (
    <div className="min-h-screen bg-[#101016] text-[#f5f4f8] pb-20 md:pb-12">
      {/* Desktop Top Bar (Strict 3-zone contract) */}
      <header className="hidden md:block sticky top-0 z-30 bg-[#101016]/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto h-16 px-6 lg:px-8 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="font-display text-xl font-extrabold tracking-tight text-[#f5f4f8] whitespace-nowrap shrink-0 hover:text-[#ffd21f] transition-colors"
          >
            Kakumiro Online TV
          </button>

          <nav
            className="flex items-center gap-7 text-sm font-medium"
            aria-label="Primary navigation"
          >
            {navItems.map((item) => {
              const active = resolvedPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`relative py-1 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'text-[#ffd21f] font-semibold'
                      : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-[#ffd21f] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleMobileSearchClick}
              aria-label="Search channels"
              title="Search channels"
              className="min-h-[40px] min-w-[40px] grid place-items-center rounded-full text-[#f5f4f8] hover:bg-white/[0.08] transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
            <UpdatesBellButton
              unreadCount={unreadUpdatesCount}
              onClick={() => setUpdatesPanelOpen(true)}
            />
            <button
              type="button"
              onClick={openUserSignInModal}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
            >
              {profile.signedIn ? profile.displayName : 'My Account'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Compact Top App Bar (52px height) */}
      <header className="flex md:hidden sticky top-0 z-30 h-[52px] px-4 bg-[#101016]/95 backdrop-blur-md border-b border-white/[0.06] items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold tracking-tight text-[#f5f4f8] truncate">
          {PAGE_TITLES[resolvedPage]}
        </h1>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleMobileSearchClick}
            aria-label="Search channels"
            className="min-h-[44px] min-w-[44px] grid place-items-center rounded-full text-[#f5f4f8] hover:bg-white/[0.06] transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>

          <UpdatesBellButton
            unreadCount={unreadUpdatesCount}
            onClick={() => setUpdatesPanelOpen(true)}
            compact
          />

          <button
            type="button"
            onClick={openUserSignInModal}
            aria-label="Open account"
            className="min-h-[44px] min-w-[44px] grid place-items-center rounded-full"
          >
            <span className="w-8 h-8 rounded-full border-2 border-[#eee] bg-[#1d1d26] grid place-items-center text-[#ffd21f]">
              <UserIcon className="w-4 h-4" />
            </span>
          </button>
        </div>
      </header>

      <OfflineIndicator />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7">
        {liveAlertToast && (
          <div
            role="status"
            className="mb-5 px-4 py-3 rounded-xl bg-[#252116] border border-[#ffd21f]/50 flex items-center justify-between gap-3 text-sm text-[#f5f4f8]"
          >
            <div className="flex items-start gap-3 min-w-0">
              {(liveAlertToast.iconUrl || homeConfig.updatesIconUrl)?.trim() ? (
                <AutoImagePreview
                  src={liveAlertToast.iconUrl || homeConfig.updatesIconUrl}
                  alt={liveAlertToast.title}
                  className="w-9 h-9 rounded-lg border border-[#ffd21f]/40 shrink-0"
                  imgClassName="w-full h-full object-cover"
                  fallbackNode={
                    <BellRing className="w-4 h-4 text-[#ffd21f] shrink-0 mt-0.5" />
                  }
                />
              ) : (
                <BellRing className="w-4 h-4 text-[#ffd21f] shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-semibold text-[#ffd21f] truncate">
                  {liveAlertToast.title}
                </p>
                <p className="text-xs text-[#e4e2ec] truncate">
                  {liveAlertToast.body}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {liveAlertToast.channelId && (
                <button
                  type="button"
                  onClick={() => {
                    const ch = channels.find(
                      (c) => c.id === liveAlertToast.channelId
                    );
                    if (ch) handleOpenPlayer(ch);
                    setLiveAlertToast(null);
                  }}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[#ffd21f] text-[#101016] text-xs font-bold whitespace-nowrap"
                >
                  Watch
                </button>
              )}
              <button
                type="button"
                onClick={() => setLiveAlertToast(null)}
                aria-label="Dismiss live alert"
                className="min-h-[34px] min-w-[34px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-[#f5f4f8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {appConfig.announcementEnabled && appConfig.announcementText.trim() && (
          <div
            role="status"
            className="mb-5 px-4 py-3 rounded-xl bg-[#1d1d26] border border-[#ffd21f]/40 flex items-center gap-3 text-sm text-[#f5f4f8]"
          >
            <Megaphone className="w-4 h-4 text-[#ffd21f] shrink-0" />
            <p className="flex-1">{appConfig.announcementText}</p>
          </div>
        )}

        {resolvedPage === 'home' && (
          <HomeView
            channels={visibleHomeChannels}
            heroSlides={heroSlides}
            promo={promo}
            movies={movies}
            homeConfig={homeConfig}
            continueWatching={continueWatching}
            enableMovies={appConfig.enableMovies}
            favorites={favorites}
            activeChannelId={playerState?.channelId ?? null}
            viewerCounts={viewerCounts}
            heroAutoplay={appConfig.heroAutoplay}
            heroIntervalSec={appConfig.heroIntervalSec}
            dataSaver={settings.dataSaver}
            networkNow={networkTime.now}
            isOnline={networkTime.isOnline}
            autoTimeSync={appConfig.autoTimeSync}
            onSelectChannel={handleOpenPlayer}
            onRemoveContinueWatching={handleRemoveContinueWatching}
            onClearContinueWatching={handleClearContinueWatching}
            onToggleFavorite={handleToggleFavorite}
            onNavigateChannels={() => navigateTo('channels')}
            onNavigateMovies={() => navigateTo('movies')}
          />
        )}

        {resolvedPage === 'channels' && (
          <ChannelsView
            channels={channels}
            homeConfig={homeConfig}
            favorites={favorites}
            activeChannelId={playerState?.channelId ?? null}
            viewerCounts={viewerCounts}
            filter={channelFilter}
            searchQuery={searchQuery}
            showSearchInput={showSearchInput}
            enableRadios={appConfig.enableRadios}
            onFilterChange={setChannelFilter}
            onSearchChange={setSearchQuery}
            onToggleSearch={() => setShowSearchInput((prev) => !prev)}
            onSelectChannel={(channel) => handleOpenPlayer(channel)}
            onToggleFavorite={handleToggleFavorite}
            unreadUpdatesCount={unreadUpdatesCount}
            onOpenUpdates={() => setUpdatesPanelOpen(true)}
          />
        )}

        {resolvedPage === 'guide' && appConfig.enableTvGuide && (
          <GuideView
            channels={visibleHomeChannels}
            schedule={guideSchedule}
            homeConfig={homeConfig}
            dayOffset={guideDayOffset}
            reminders={reminders}
            networkNow={networkTime.now}
            isOnline={networkTime.isOnline}
            autoTimeSync={appConfig.autoTimeSync}
            onChangeDay={(delta) => setGuideDayOffset((d) => d + delta)}
            onResetToday={() => setGuideDayOffset(0)}
            onToggleReminder={handleToggleReminder}
            onSelectChannel={handleOpenPlayer}
          />
        )}

        {resolvedPage === 'movies' && appConfig.enableMovies && (
          <MoviesView
            movies={movies}
            channels={channels}
            movieAutoArtUrl={homeConfig.movieAutoArtUrl}
            onPlayMovie={handleOpenPlayer}
          />
        )}

        {resolvedPage === 'more' && (
          <MoreView
            channels={channels}
            archiveItems={archiveItems}
            movies={movies}
            newsArticles={newsArticles}
            artists={artists}
            appConfig={appConfig}
            homeConfig={homeConfig}
            settings={settings}
            isAdmin={canSyncAdminCatalog}
            broadcastAlerts={broadcastAlerts}
            cloudFiles={cloudFiles}
            reminders={reminders}
            firebaseUser={firebaseUser}
            requestedTab={requestedMoreTab}
            onClearRequestedTab={() => setRequestedMoreTab(null)}
            requestedPanel={requestedMorePanel}
            onClearRequestedPanel={() => setRequestedMorePanel(null)}
            onUpdateSettings={setSettings}
            onToggleReminder={handleToggleReminder}
            onSelectMedia={handleOpenPlayer}
            onOpenAccount={(initialView = 'account') =>
              setAccountModalState({
                open: true,
                initialView,
                initialPortal: initialView === 'admin' ? 'admin' : 'user',
              })
            }
            onOpenControlPanel={openAdminControlPanel}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav
        className={`grid md:hidden fixed bottom-0 inset-x-0 z-30 h-[60px] bg-[#111117]/95 backdrop-blur-md border-t border-[#34343e] ${
          navItems.length === 5
            ? 'grid-cols-5'
            : navItems.length === 4
              ? 'grid-cols-4'
              : 'grid-cols-3'
        } items-center px-1`}
        aria-label="Mobile navigation"
      >
        {navItems.map(({ id, label, Icon }) => {
          const active = resolvedPage === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigateTo(id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
                active ? 'text-[#ffd21f]' : 'text-[#9997a8]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </nav>

      {activePlayerChannel && (
        <WatchView
          channel={activePlayerChannel}
          channels={visibleHomeChannels}
          guideSchedule={guideSchedule}
          archiveItems={archiveItems.filter((item) =>
            item.category === 'archive'
              ? appConfig.enableArchive
              : appConfig.enablePodcasts
          )}
          movies={appConfig.enableMovies ? movies : []}
          homeConfig={homeConfig}
          favorites={favorites}
          reminders={reminders}
          viewerName={profile.displayName || 'Guest'}
          currentUserId={firebaseUser?.uid}
          isSignedIn={profile.signedIn}
          isFirebaseConnected={Boolean(firebaseUser && firebaseUser.emailVerified)}
          isAdmin={canSyncAdminCatalog}
          networkNow={networkTime.now}
          autoTimeSync={appConfig.autoTimeSync}
          chatMessages={chatMessages}
          followedSenders={followedSenders}
          viewerCounts={viewerCounts}
          autoplay={settings.autoplay}
          dataSaver={settings.dataSaver}
          isOnline={isOnline}
          contextTitle={playerState?.contextTitle}
          overrideStreamUrl={playerState?.overrideStreamUrl}
          overrideStreamType={playerState?.overrideStreamType}
          onRequestSignIn={openUserSignInModal}
          onSelectChannel={handleOpenPlayer}
          onToggleFavorite={handleToggleFavorite}
          onToggleReminder={handleToggleReminder}
          onSendChatMessage={handleSendChatMessage}
          onToggleLikeMessage={handleToggleLikeMessage}
          onToggleFollowSender={handleToggleFollowSender}
          onDeleteChatMessage={handleDeleteChatMessage}
          onNavigatePage={navigateTo}
          onOpenControlPanel={openAdminControlPanel}
          onClose={handleClosePlayer}
        />
      )}

      <AccountModal
        isOpen={accountModalState.open}
        initialView={accountModalState.initialView}
        initialPortal={accountModalState.initialPortal}
        initialChannelId={accountModalState.initialChannelId}
        initialAdminSection={accountModalState.initialAdminSection}
        initialArchiveItemId={accountModalState.initialArchiveItemId}
        initialMovieId={accountModalState.initialMovieId}
        profile={profile}
        firebaseConnected={Boolean(firebaseUser && firebaseUser.emailVerified)}
        isEmailVerified={firebaseUser ? firebaseUser.emailVerified : true}
        pendingSyncCount={pendingSyncCount}
        isAdminAuthorized={canSyncAdminCatalog}
        onRecordAuthActivity={handleRecordAuthActivity}
        onRefreshAuthVerification={async () => {
          const refreshed = await refreshCurrentAuthUser();
          if (refreshed) {
            setFirebaseUser(refreshed);
            setAuthRefreshTick((t) => t + 1);
            const adminOk = await checkAdminAllowlist(refreshed);
            setIsAllowlistedAdmin(adminOk);
            if (adminOk) {
              setProfile((prev) => ({ ...prev, role: 'admin' }));
            }
          }
          return Boolean(refreshed?.emailVerified);
        }}
        onSyncToCloud={async () => {
          if (!firebaseUser || !firebaseUser.emailVerified) return;
          if (await checkAdminAllowlist(firebaseUser)) {
            await seedCatalogToFirestore(latestCatalogRef.current);
          }
          await syncUserDocumentsToFirestore({
            user: firebaseUser,
            profile,
            favorites,
            reminders,
            followedSenders,
            settings,
            continueWatching,
          });
        }}
        channels={channels}
        guideSchedule={guideSchedule}
        heroSlides={heroSlides}
        promo={promo}
        movies={movies}
        archiveItems={archiveItems}
        newsArticles={newsArticles}
        artists={artists}
        appConfig={appConfig}
        homeConfig={homeConfig}
        broadcastAlerts={broadcastAlerts}
        cloudFiles={cloudFiles}
        cloudBackups={cloudBackups}
        favoritesCount={favorites.size}
        remindersCount={reminders.size}
        followedCount={followedSenders.size}
        continueWatchingCount={continueWatching.length}
        isOnline={isOnline}
        onClose={() =>
          setAccountModalState((prev) => ({ ...prev, open: false }))
        }
        onPreviewChannel={(ch) => handleOpenPlayer(ch)}
        onPreviewMovie={(mov) => {
          const ch =
            channels.find((c) => c.id === mov.channelId) || channels[0];
          if (ch) {
            handleOpenPlayer(ch, mov.title, mov.streamUrl, mov.streamType);
          }
        }}
        onUpdateProfile={setProfile}
        onAddChannel={handleAddChannel}
        onUpdateChannel={handleUpdateChannel}
        onDeleteChannel={handleDeleteChannel}
        onUpdateGuideProgramme={handleUpdateGuideProgramme}
        onAddHeroSlide={handleAddHeroSlide}
        onUpdateHeroSlide={handleUpdateHeroSlide}
        onDeleteHeroSlide={handleDeleteHeroSlide}
        onUpdatePromo={handleUpdatePromo}
        onAddMovie={handleAddMovie}
        onUpdateMovie={handleUpdateMovie}
        onDeleteMovie={handleDeleteMovie}
        onAddArchiveItem={handleAddArchiveItem}
        onUpdateArchiveItem={handleUpdateArchiveItem}
        onDeleteArchiveItem={handleDeleteArchiveItem}
        onAddNewsArticle={handleAddNewsArticle}
        onUpdateNewsArticle={handleUpdateNewsArticle}
        onDeleteNewsArticle={handleDeleteNewsArticle}
        onAddArtist={handleAddArtist}
        onUpdateArtist={handleUpdateArtist}
        onDeleteArtist={handleDeleteArtist}
        onPreviewArtist={(artist) => {
          const ch =
            (artist.channelId
              ? channels.find((c) => c.id === artist.channelId)
              : undefined) || channels[0];
          if (ch) {
            handleOpenPlayer(
              ch,
              `${artist.name} — ${artist.latestRelease}`,
              artist.mediaUrl,
              artist.streamType
            );
          }
        }}
        onPreviewArchiveItem={(item) => {
          const ch =
            channels.find((c) => c.id === item.channelId) || channels[0];
          if (ch) {
            handleOpenPlayer(ch, item.title, item.mediaUrl, item.streamType);
          }
        }}
        onUpdateAppConfig={handleUpdateAppConfig}
        onUpdateHomeConfig={handleUpdateHomeConfig}
        onPublishBroadcastAlert={handlePublishBroadcastAlert}
        onDeleteBroadcastAlert={handleDeleteBroadcastAlert}
        onApplyRestoredCatalog={handleApplyRestoredCatalog}
        onResetDefaults={handleResetDefaults}
      />

      <UpdatesPanel
        isOpen={updatesPanelOpen}
        items={unifiedUpdates}
        unreadCount={unreadUpdatesCount}
        isAdmin={canSyncAdminCatalog}
        onClose={() => setUpdatesPanelOpen(false)}
        onSelectUpdate={handleSelectUpdateItem}
        onMarkAllRead={handleMarkAllUpdatesRead}
        onDeleteUpdate={handleDeleteUpdateItem}
        onOpenPushSettings={() => {
          setUpdatesPanelOpen(false);
          setRequestedMorePanel('alerts');
          navigateTo('more');
        }}
      />

      {showLauncher && (
        <LauncherScreen
          signedIn={profile.signedIn}
          onGetStarted={dismissLauncher}
          onSignIn={() => {
            dismissLauncher();
            openUserSignInModal();
          }}
        />
      )}
    </div>
  );
}
