import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BellRing,
  CalendarRange,
  Check,
  Clapperboard,
  CloudUpload,
  Copy,
  DatabaseBackup,
  Eye,
  EyeOff,
  Film,
  HardDrive,
  Home,
  Image as ImageIcon,
  Library,
  Link2,
  Loader2,
  Megaphone,
  Mic2,
  Newspaper,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Scissors,
  Send,
  Server,
  Sparkles,
  Trash2,
  Tv,
  Upload,
  Users,
  Video,
  Wand2,
} from 'lucide-react';
import {
  auth,
  runFirebaseDiagnostics,
  type FirebaseHealthReport,
} from '../firebase';
import {
  AppConfig,
  ArchiveItem,
  ArtistGenre,
  ArtistProfile,
  BackupSnapshot,
  BrandTheme,
  BroadcastAlert,
  BroadcastAlertCategory,
  Channel,
  ChannelType,
  CloudFileRecord,
  GuideProgramme,
  HeroSlide,
  HomeConfig,
  HomeSectionKey,
  MovieFormat,
  MovieGenre,
  MovieItem,
  NewsArticle,
  NewsCategory,
  PromoConfig,
  StreamFormat,
} from '../types/broadcast';
import {
  ARTIST_GENRES,
  DEFAULT_HOME_CONFIG,
  HERO_IMAGE,
  LAUNCHER_ICON,
  LAUNCHER_MOSAIC,
  MOVIE_GENRES,
  NEWS_CATEGORIES,
  PROMO_IMAGE,
  STUDIO_IMAGE,
} from '../data/channels';
import { normalizeStreamInput, resolveStreamSource } from '../utils/streamUrl';
import {
  compressImageFileToDataUrl,
  normalizeMediaAssetUrl,
} from '../utils/mediaAssets';
import {
  autoDetectThumbnailFromUrl,
  extractFrameFromVideoFile,
} from '../utils/thumbnailExtractor';
import { uploadMediaFileToCloud } from '../services/cloudStorage';
import { type CatalogBackupPayload } from '../services/backupService';
import { ChannelLogo } from './ChannelLogo';
import { AutoImagePreview, type ImagePreviewStatus } from './AutoImagePreview';
import { ThumbnailCutoutModal } from './ThumbnailCutoutModal';
import { AdminMediaLibraryTab } from './admin/AdminMediaLibraryTab';
import { AdminCloudStorageTab } from './admin/AdminCloudStorageTab';
import { AdminBackupsTab } from './admin/AdminBackupsTab';
import { AdminUsersTab } from './admin/AdminUsersTab';

export type AdminSection =
  | 'channels'
  | 'home'
  | 'guide'
  | 'spotlight'
  | 'movies'
  | 'archive'
  | 'news'
  | 'artists'
  | 'library'
  | 'storage'
  | 'backups'
  | 'users'
  | 'alerts'
  | 'controls';

interface CloudServerStatus {
  ok: boolean;
  uptimeSec: number;
  serverTimeIso: string;
  fcmServerReady: boolean;
  webPushReady?: boolean;
  vapidConfigured?: boolean;
  registeredDevices: number;
  fcmDevices?: number;
  webPushDevices?: number;
  streamingServerReady: boolean;
}

interface ProbeResult {
  ok: boolean;
  status: number;
  contentType?: string;
  latencyMs?: number;
  detectedKind?: string;
  error?: string;
}

interface AdminPanelProps {
  channels: Channel[];
  initialChannelId?: string;
  initialAdminSection?: AdminSection;
  initialArchiveItemId?: string;
  initialMovieId?: string;
  guideSchedule: GuideProgramme[];
  heroSlides: HeroSlide[];
  promo: PromoConfig;
  movies: MovieItem[];
  archiveItems: ArchiveItem[];
  newsArticles?: NewsArticle[];
  artists?: ArtistProfile[];
  appConfig: AppConfig;
  homeConfig: HomeConfig;
  broadcastAlerts?: BroadcastAlert[];
  cloudFiles?: CloudFileRecord[];
  cloudBackups?: BackupSnapshot[];
  onAddChannel: (channel: Channel) => void;
  onUpdateChannel: (channel: Channel) => void;
  onDeleteChannel: (channelId: string) => void;
  onPreviewChannel?: (channel: Channel) => void;
  onUpdateGuideProgramme: (entry: GuideProgramme) => void;
  onAddHeroSlide: (slide: HeroSlide) => void;
  onUpdateHeroSlide: (slide: HeroSlide) => void;
  onDeleteHeroSlide: (slideId: string) => void;
  onUpdatePromo: (promo: PromoConfig) => void;
  onAddMovie: (movie: MovieItem) => void;
  onUpdateMovie: (movie: MovieItem) => void;
  onDeleteMovie: (movieId: string) => void;
  onPreviewMovie?: (movie: MovieItem) => void;
  onAddArchiveItem: (item: ArchiveItem) => void;
  onUpdateArchiveItem: (item: ArchiveItem) => void;
  onDeleteArchiveItem: (itemId: string) => void;
  onPreviewArchiveItem?: (item: ArchiveItem) => void;
  onAddNewsArticle?: (article: NewsArticle) => void;
  onUpdateNewsArticle?: (article: NewsArticle) => void;
  onDeleteNewsArticle?: (articleId: string) => void;
  onAddArtist?: (artist: ArtistProfile) => void;
  onUpdateArtist?: (artist: ArtistProfile) => void;
  onDeleteArtist?: (artistId: string) => void;
  onPreviewArtist?: (artist: ArtistProfile) => void;
  onUpdateAppConfig: (config: AppConfig) => void;
  onUpdateHomeConfig: (config: HomeConfig) => void;
  onPublishBroadcastAlert?: (params: {
    category: BroadcastAlertCategory;
    title: string;
    body: string;
    channelId?: string;
    iconUrl?: string;
  }) => Promise<string>;
  onDeleteBroadcastAlert?: (alertId: string) => void;
  onSyncToCloud?: () => Promise<void>;
  onApplyRestoredCatalog?: (payload: CatalogBackupPayload) => void;
  onResetDefaults: () => void;
}

const BRAND_OPTIONS: { value: BrandTheme; label: string }[] = [
  { value: 'default', label: 'Kakumiro (KOTV)' },
  { value: 'nbs', label: 'NBS Red' },
  { value: 'citizen', label: 'Citizen / UBC White' },
  { value: 'sanyuka', label: 'Sanyuka Cream' },
  { value: 'sport', label: 'NBS Sport Teal' },
  { value: 'radio', label: 'KIIS Violet' },
];

const BACKDROP_OPTIONS = [
  { label: 'Premiere Stage Curtains', value: HERO_IMAGE },
  { label: 'Broadcast Control Room', value: PROMO_IMAGE },
  { label: 'Live Studio Camera', value: STUDIO_IMAGE },
  { label: 'KOTV Launcher Emblem', value: LAUNCHER_ICON },
  { label: 'KOTV Broadcast Mosaic', value: LAUNCHER_MOSAIC },
];

const STREAM_FORMAT_OPTIONS: { value: StreamFormat; label: string }[] = [
  { value: 'auto', label: 'Auto-detect (All URLs)' },
  { value: 'hls', label: 'HLS Live (.m3u8)' },
  { value: 'media', label: 'Direct Video (MP4 / WebM / MOV)' },
  { value: 'audio', label: 'Audio / Radio (MP3 / AAC / Icecast)' },
  { value: 'embed', label: 'Web Embed (YouTube, Vimeo, Twitch, Iframe)' },
];

export function AdminPanel({
  channels,
  initialChannelId,
  initialAdminSection,
  initialArchiveItemId,
  initialMovieId,
  guideSchedule,
  heroSlides,
  promo,
  movies,
  archiveItems,
  newsArticles = [],
  artists = [],
  appConfig,
  homeConfig,
  broadcastAlerts = [],
  cloudFiles = [],
  cloudBackups = [],
  onAddChannel,
  onUpdateChannel,
  onDeleteChannel,
  onPreviewChannel,
  onUpdateGuideProgramme,
  onAddHeroSlide,
  onUpdateHeroSlide,
  onDeleteHeroSlide,
  onUpdatePromo,
  onAddMovie,
  onUpdateMovie,
  onDeleteMovie,
  onPreviewMovie,
  onAddArchiveItem,
  onUpdateArchiveItem,
  onDeleteArchiveItem,
  onPreviewArchiveItem,
  onAddNewsArticle,
  onUpdateNewsArticle,
  onDeleteNewsArticle,
  onAddArtist,
  onUpdateArtist,
  onDeleteArtist,
  onPreviewArtist,
  onUpdateAppConfig,
  onUpdateHomeConfig,
  onPublishBroadcastAlert,
  onDeleteBroadcastAlert,
  onSyncToCloud,
  onApplyRestoredCatalog,
  onResetDefaults,
}: AdminPanelProps) {
  const [section, setSection] = useState<AdminSection>(
    initialAdminSection || 'channels'
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Selected channel for active stream URL & metadata editing
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    initialChannelId || channels[0]?.id || ''
  );
  const selectedChannel =
    channels.find((c) => c.id === selectedChannelId) || channels[0];

  const [editForm, setEditForm] = useState<Channel>(
    () =>
      selectedChannel || {
        id: '',
        name: '',
        type: 'Television',
        subtitle: '',
        brand: 'default',
        progress: 50,
        program: '',
      }
  );

  // Collapsible add channel form
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChName, setNewChName] = useState('');
  const [newChType, setNewChType] = useState<ChannelType>('Television');
  const [newChBrand, setNewChBrand] = useState<BrandTheme>('default');
  const [newChProgram, setNewChProgram] = useState('');
  const [newChSubtitle, setNewChSubtitle] = useState('');
  const [newChStreamUrl, setNewChStreamUrl] = useState('');
  const [newChIconUrl, setNewChIconUrl] = useState('');
  const [newChStreamType, setNewChStreamType] = useState<StreamFormat>('auto');
  const [newChUseRelayServer, setNewChUseRelayServer] = useState(false);
  const [uploadingChannelIcon, setUploadingChannelIcon] = useState<
    'edit' | 'new' | null
  >(null);

  // Stream health probe & Cloud/FCM server management state
  const [probingStream, setProbingStream] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [serverStatus, setServerStatus] = useState<CloudServerStatus | null>(null);
  const [firebaseHealth, setFirebaseHealth] =
    useState<FirebaseHealthReport | null>(null);
  const [loadingServerStatus, setLoadingServerStatus] = useState(false);
  const [syncingToCloud, setSyncingToCloud] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);
  const [alertCategory, setAlertCategory] =
    useState<BroadcastAlertCategory>('news');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertBody, setAlertBody] = useState('');
  const [alertChannelId, setAlertChannelId] = useState('');
  const [alertIconUrl, setAlertIconUrl] = useState('');
  const [uploadingAlertIcon, setUploadingAlertIcon] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);

  // Guide schedule inline edit
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [guideDraft, setGuideDraft] = useState<GuideProgramme | null>(null);

  // Spotlight & promo drafts
  const [selectedSlideId, setSelectedSlideId] = useState(heroSlides[0]?.id || '');
  const activeSlide =
    heroSlides.find((s) => s.id === selectedSlideId) || heroSlides[0];
  const [slideDraft, setSlideDraft] = useState<HeroSlide>(activeSlide);
  const [promoDraft, setPromoDraft] = useState<PromoConfig>(promo);

  // Movies & Series form
  const [editingMovieId, setEditingMovieId] = useState<string | null>(null);
  const [movieTitle, setMovieTitle] = useState('');
  const [movieFormat, setMovieFormat] = useState<MovieFormat>('movie');
  const [movieGenre, setMovieGenre] = useState<MovieGenre>('Bunyoro Films');
  const [movieYear, setMovieYear] = useState('2025');
  const [movieDuration, setMovieDuration] = useState('1h 45m');
  const [movieChannelId, setMovieChannelId] = useState(
    channels[0]?.id || 'kakumiro-tv'
  );
  const [moviePoster, setMoviePoster] = useState('');
  const [movieDescription, setMovieDescription] = useState('');
  const [movieStreamUrl, setMovieStreamUrl] = useState('');
  const [movieStreamType, setMovieStreamType] = useState<StreamFormat>('auto');
  const [movieFeatured, setMovieFeatured] = useState(true);
  const [movieListFilter, setMovieListFilter] = useState<'All' | MovieGenre>('All');
  const [moviePosterStatus, setMoviePosterStatus] =
    useState<ImagePreviewStatus>('empty');
  const [slidePhotoStatus, setSlidePhotoStatus] =
    useState<ImagePreviewStatus>('empty');
  const [promoPhotoStatus, setPromoPhotoStatus] =
    useState<ImagePreviewStatus>('empty');

  const [movieAutoDetecting, setMovieAutoDetecting] = useState(false);
  const [movieAutoDetectNote, setMovieAutoDetectNote] = useState<string | null>(
    null
  );
  const [movieLocalVideoUrl, setMovieLocalVideoUrl] = useState('');
  const moviePosterManualRef = useRef(false);
  const lastMovieDetectedUrlRef = useRef('');

  // Archive / podcast add & edit form
  const [editingArchiveId, setEditingArchiveId] = useState<string | null>(null);
  const [arcTitle, setArcTitle] = useState('');
  const [arcCategory, setArcCategory] = useState<'archive' | 'podcast'>('archive');
  const [arcChannelId, setArcChannelId] = useState(channels[0]?.id || 'kakumiro-tv');
  const [arcDuration, setArcDuration] = useState('30m');
  const [arcThumbnail, setArcThumbnail] = useState('');
  const [arcThumbnailStatus, setArcThumbnailStatus] =
    useState<ImagePreviewStatus>('empty');
  const [arcAutoDetecting, setArcAutoDetecting] = useState(false);
  const [arcAutoDetectNote, setArcAutoDetectNote] = useState<string | null>(null);
  const [arcLocalVideoUrl, setArcLocalVideoUrl] = useState('');
  const arcThumbnailManualRef = useRef(false);
  const lastArcDetectedUrlRef = useRef('');
  const [arcDescription, setArcDescription] = useState('');
  const [arcMediaUrl, setArcMediaUrl] = useState('');
  const [arcStreamType, setArcStreamType] = useState<StreamFormat>('auto');
  const [uploadingMovieVideo, setUploadingMovieVideo] = useState(false);
  const [uploadingArchiveMedia, setUploadingArchiveMedia] = useState(false);
  const [cutoutTarget, setCutoutTarget] = useState<'movie' | 'archive' | null>(
    null
  );

  // Written Breaking News composer state
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [newsHeadline, setNewsHeadline] = useState('');
  const [newsCategory, setNewsCategory] = useState<NewsCategory>('Breaking');
  const [newsAuthor, setNewsAuthor] = useState('KOTV News Desk');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsBody, setNewsBody] = useState('');
  const [newsImageUrl, setNewsImageUrl] = useState('');
  const [newsImageStatus, setNewsImageStatus] =
    useState<ImagePreviewStatus>('empty');
  const [newsChannelId, setNewsChannelId] = useState('');
  const [newsFeatured, setNewsFeatured] = useState(true);
  const [newsAlsoPush, setNewsAlsoPush] = useState(false);

  // Featured Artists manager state
  const [editingArtistId, setEditingArtistId] = useState<string | null>(null);
  const [artistName, setArtistName] = useState('');
  const [artistGenre, setArtistGenre] = useState<ArtistGenre>('Afrobeat');
  const [artistOrigin, setArtistOrigin] = useState('Kakumiro, Bunyoro');
  const [artistRelease, setArtistRelease] = useState('');
  const [artistBio, setArtistBio] = useState('');
  const [artistPhotoUrl, setArtistPhotoUrl] = useState('');
  const [artistPhotoStatus, setArtistPhotoStatus] =
    useState<ImagePreviewStatus>('empty');
  const [artistMediaUrl, setArtistMediaUrl] = useState('');
  const [artistStreamType, setArtistStreamType] = useState<StreamFormat>('auto');
  const [artistChannelId, setArtistChannelId] = useState('');
  const [artistFeatured, setArtistFeatured] = useState(false);

  // Privacy toggles for masking playing source URLs
  const [revealEditUrl, setRevealEditUrl] = useState(false);
  const [revealNewUrl, setRevealNewUrl] = useState(false);
  const [revealSlideUrl, setRevealSlideUrl] = useState(false);
  const [revealPromoUrl, setRevealPromoUrl] = useState(false);
  const [revealMovieUrl, setRevealMovieUrl] = useState(false);
  const [revealArcUrl, setRevealArcUrl] = useState(false);

  // App & Home config drafts
  const [configDraft, setConfigDraft] = useState<AppConfig>(appConfig);
  const [homeDraft, setHomeDraft] = useState<HomeConfig>({
    ...DEFAULT_HOME_CONFIG,
    ...homeConfig,
  });

  useEffect(() => {
    setConfigDraft(appConfig);
  }, [appConfig]);

  useEffect(() => {
    setHomeDraft({ ...DEFAULT_HOME_CONFIG, ...homeConfig });
  }, [homeConfig]);

  useEffect(() => {
    setPromoDraft(promo);
  }, [promo]);

  useEffect(() => {
    const found =
      heroSlides.find((s) => s.id === selectedSlideId) || heroSlides[0];
    if (found) {
      setSelectedSlideId(found.id);
      setSlideDraft(found);
    }
  }, [heroSlides, selectedSlideId]);

  useEffect(() => {
    if (initialChannelId && channels.some((c) => c.id === initialChannelId)) {
      setSection('channels');
      setSelectedChannelId(initialChannelId);
    }
  }, [initialChannelId, channels]);

  useEffect(() => {
    if (initialAdminSection) {
      setSection(initialAdminSection);
    }
  }, [initialAdminSection]);

  useEffect(() => {
    if (!initialArchiveItemId) return;
    const found = archiveItems.find((a) => a.id === initialArchiveItemId);
    if (found) {
      setSection('archive');
      setEditingArchiveId(found.id);
      setArcTitle(found.title);
      setArcCategory(found.category);
      setArcChannelId(found.channelId);
      setArcDuration(found.duration);
      arcThumbnailManualRef.current = Boolean(found.thumbnailPath?.trim());
      setArcThumbnail(found.thumbnailPath || '');
      setArcAutoDetectNote(null);
      setArcDescription(found.description);
      lastArcDetectedUrlRef.current = normalizeStreamInput(found.mediaUrl || '');
      setArcMediaUrl(found.mediaUrl || '');
      setArcStreamType(found.streamType || 'auto');
    }
  }, [initialArchiveItemId, archiveItems]);

  useEffect(() => {
    if (!initialMovieId) return;
    const found = movies.find((m) => m.id === initialMovieId);
    if (found) {
      setSection('movies');
      setEditingMovieId(found.id);
      setMovieTitle(found.title);
      setMovieFormat(found.format);
      setMovieGenre(found.genre);
      setMovieYear(found.year);
      setMovieDuration(found.duration);
      setMovieChannelId(found.channelId);
      moviePosterManualRef.current = Boolean(found.posterPath?.trim());
      setMoviePoster(found.posterPath || '');
      setMovieAutoDetectNote(null);
      setMovieDescription(found.description);
      lastMovieDetectedUrlRef.current = normalizeStreamInput(
        found.streamUrl || ''
      );
      setMovieStreamUrl(found.streamUrl || '');
      setMovieStreamType(found.streamType || 'auto');
      setMovieFeatured(Boolean(found.featured));
    }
  }, [initialMovieId, movies]);

  useEffect(() => {
    const target =
      channels.find((c) => c.id === selectedChannelId) || channels[0];
    if (target) {
      setSelectedChannelId(target.id);
      setEditForm({ ...target });
      setRevealEditUrl(false);
      setProbeResult(null);
    }
  }, [selectedChannelId, channels]);

  useEffect(() => {
    return () => {
      if (movieLocalVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(movieLocalVideoUrl);
      }
    };
  }, [movieLocalVideoUrl]);

  useEffect(() => {
    return () => {
      if (arcLocalVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(arcLocalVideoUrl);
      }
    };
  }, [arcLocalVideoUrl]);

  const runMovieThumbnailAutoDetect = useCallback(
    async (rawUrl: string, forceReplace = false) => {
      const clean = normalizeStreamInput(rawUrl);
      if (!clean) {
        setMovieAutoDetectNote(null);
        return;
      }
      setMovieAutoDetecting(true);
      try {
        const res = await autoDetectThumbnailFromUrl(clean, 'poster');
        if (res.thumbnailUrl) {
          if (forceReplace || !moviePosterManualRef.current) {
            moviePosterManualRef.current = false;
            setMoviePoster(res.thumbnailUrl);
            setMovieAutoDetectNote(
              res.note || 'Poster thumbnail auto-detected from URL.'
            );
          } else {
            setMovieAutoDetectNote(
              'Thumbnail detected from URL — click Auto-detect to replace custom poster.'
            );
          }
        } else if (res.note) {
          setMovieAutoDetectNote(res.note);
        }
      } finally {
        setMovieAutoDetecting(false);
      }
    },
    []
  );

  const runArchiveThumbnailAutoDetect = useCallback(
    async (rawUrl: string, forceReplace = false) => {
      const clean = normalizeStreamInput(rawUrl);
      if (!clean) {
        setArcAutoDetectNote(null);
        return;
      }
      setArcAutoDetecting(true);
      try {
        const res = await autoDetectThumbnailFromUrl(clean, 'landscape');
        if (res.thumbnailUrl) {
          if (forceReplace || !arcThumbnailManualRef.current) {
            arcThumbnailManualRef.current = false;
            setArcThumbnail(res.thumbnailUrl);
            setArcAutoDetectNote(
              res.note || 'Thumbnail auto-detected from URL.'
            );
          } else {
            setArcAutoDetectNote(
              'Thumbnail detected from URL — click Auto-detect to replace current image.'
            );
          }
        } else if (res.note) {
          setArcAutoDetectNote(res.note);
        }
      } finally {
        setArcAutoDetecting(false);
      }
    },
    []
  );

  useEffect(() => {
    const clean = normalizeStreamInput(movieStreamUrl);
    if (!clean) {
      lastMovieDetectedUrlRef.current = '';
      return;
    }
    if (clean === lastMovieDetectedUrlRef.current) return;
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith('vault://') && !clean.startsWith('blob:')) {
      return;
    }
    const timer = window.setTimeout(() => {
      lastMovieDetectedUrlRef.current = clean;
      void runMovieThumbnailAutoDetect(clean, false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [movieStreamUrl, runMovieThumbnailAutoDetect]);

  useEffect(() => {
    const clean = normalizeStreamInput(arcMediaUrl);
    if (!clean) {
      lastArcDetectedUrlRef.current = '';
      return;
    }
    if (clean === lastArcDetectedUrlRef.current) return;
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith('vault://') && !clean.startsWith('blob:')) {
      return;
    }
    const timer = window.setTimeout(() => {
      lastArcDetectedUrlRef.current = clean;
      void runArchiveThumbnailAutoDetect(clean, false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [arcMediaUrl, runArchiveThumbnailAutoDetect]);

  const loadCloudStatus = async () => {
    setLoadingServerStatus(true);
    try {
      const [healthRes, fcmRes, fbReport] = await Promise.all([
        fetch('/api/health').catch(() => null),
        fetch('/api/fcm/status').catch(() => null),
        runFirebaseDiagnostics().catch(() => null),
      ]);
      if (healthRes && healthRes.ok) {
        const health = (await healthRes.json()) as CloudServerStatus;
        const fcm =
          fcmRes && fcmRes.ok
            ? ((await fcmRes.json()) as {
                vapidConfigured?: boolean;
                webPushReady?: boolean;
                fcmDevices?: number;
                webPushDevices?: number;
                registeredDevices?: number;
              })
            : {};
        setServerStatus({
          ...health,
          vapidConfigured: fcm.vapidConfigured,
          webPushReady: fcm.webPushReady,
          fcmDevices: fcm.fcmDevices,
          webPushDevices: fcm.webPushDevices,
          registeredDevices:
            typeof fcm.registeredDevices === 'number'
              ? fcm.registeredDevices
              : health.registeredDevices,
        });
      }
      if (fbReport) {
        setFirebaseHealth(fbReport);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setLoadingServerStatus(false);
    }
  };

  const handleSyncCatalogNow = async () => {
    if (!onSyncToCloud) return;
    setSyncingToCloud(true);
    try {
      await onSyncToCloud();
      showNotice('All channels, guide slots, movies, slides & settings synced to Firebase.');
      void loadCloudStatus();
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to sync catalog to Firebase.'
      );
    } finally {
      setSyncingToCloud(false);
    }
  };

  const handleCopyHost = async () => {
    const host = firebaseHealth?.hostname;
    if (!host || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(host);
      setCopiedHost(true);
      window.setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  useEffect(() => {
    if (section === 'alerts') {
      void loadCloudStatus();
    }
  }, [section]);

  const tvCount = channels.filter((c) => c.type === 'Television').length;
  const radioCount = channels.filter((c) => c.type === 'Radios').length;
  const streamCount = channels.filter((c) => Boolean(c.streamUrl?.trim())).length;

  const showNotice = (msg: string) => {
    setNotice(msg);
  };

  const uploadAdminIconImage = async (
    file: File,
    description: string
  ): Promise<string> => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const res = await uploadMediaFileToCloud({
        file,
        uid,
        description,
        publicVisible: false,
      });
      if (!res.record.url.startsWith('vault://')) {
        return res.record.url;
      }
    }
    return compressImageFileToDataUrl(file, 110_000);
  };

  const handleChannelIconUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'edit' | 'new'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showNotice('Please choose an icon image smaller than 6 MB.');
      return;
    }
    setUploadingChannelIcon(target);
    try {
      const label =
        target === 'edit'
          ? editForm.name.trim() || 'Channel'
          : newChName.trim() || 'New channel';
      const url = await uploadAdminIconImage(file, `Channel icon: ${label}`);
      if (target === 'edit') {
        setEditForm((prev) => ({ ...prev, iconUrl: url }));
      } else {
        setNewChIconUrl(url);
      }
      showNotice(`Icon "${file.name}" attached. Save channel to publish online.`);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to upload channel icon.'
      );
    } finally {
      setUploadingChannelIcon(null);
    }
  };

  const handleAlertIconUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showNotice('Please choose an icon image smaller than 6 MB.');
      return;
    }
    setUploadingAlertIcon(true);
    try {
      const url = await uploadAdminIconImage(
        file,
        `Update alert icon: ${alertTitle.trim() || 'Live alert'}`
      );
      setAlertIconUrl(url);
      showNotice(`Update icon "${file.name}" attached to alert.`);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to upload alert icon.'
      );
    } finally {
      setUploadingAlertIcon(false);
    }
  };

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newChName.trim();
    if (!trimmed) {
      showNotice('Enter a channel name to add it to the lineup.');
      return;
    }

    const id = `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const normalizedUrl = normalizeStreamInput(newChStreamUrl);
    const normalizedIcon = normalizeMediaAssetUrl(newChIconUrl);
    const created: Channel = {
      id,
      name: trimmed,
      type: newChType,
      brand: newChBrand,
      program: newChProgram.trim() || 'Live Broadcast',
      subtitle: newChSubtitle.trim(),
      progress: 50,
      streamUrl: normalizedUrl || undefined,
      streamType: newChStreamType,
      useRelayServer: newChUseRelayServer,
      iconUrl: normalizedIcon || undefined,
    };
    onAddChannel(created);
    setSelectedChannelId(created.id);
    setShowAddChannel(false);
    setNewChName('');
    setNewChProgram('');
    setNewChSubtitle('');
    setNewChStreamUrl('');
    setNewChIconUrl('');
    setNewChStreamType('auto');
    setNewChUseRelayServer(false);
    showNotice(`Added "${trimmed}" to the channel lineup.`);
  };

  const handleProbeChannelStream = async () => {
    const raw = normalizeStreamInput(editForm.streamUrl || '');
    if (!raw) {
      showNotice('Enter a stream URL first to test server health.');
      return;
    }
    setProbingStream(true);
    setProbeResult(null);
    try {
      const res = await fetch(
        `/api/stream/probe?url=${encodeURIComponent(raw)}`
      );
      const data = (await res.json()) as ProbeResult;
      setProbeResult(data);
    } catch {
      setProbeResult({
        ok: false,
        status: 502,
        error: 'Unable to reach Station Streaming Server.',
      });
    } finally {
      setProbingStream(false);
    }
  };

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onPublishBroadcastAlert) return;
    if (!alertTitle.trim() || !alertBody.trim()) {
      showNotice('Enter both an alert headline and message body.');
      return;
    }
    setSendingAlert(true);
    try {
      const cleanAlertIcon = normalizeMediaAssetUrl(alertIconUrl);
      const resultMsg = await onPublishBroadcastAlert({
        category: alertCategory,
        title: alertTitle.trim(),
        body: alertBody.trim(),
        channelId: alertChannelId || undefined,
        iconUrl: cleanAlertIcon || undefined,
      });
      setAlertTitle('');
      setAlertBody('');
      setAlertIconUrl('');
      showNotice(resultMsg);
      void loadCloudStatus();
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to dispatch live alert.'
      );
    } finally {
      setSendingAlert(false);
    }
  };

  const commitChannelForm = (): Channel | null => {
    if (!editForm.name.trim()) {
      showNotice('Channel name cannot be empty.');
      return null;
    }
    const normalizedUrl = normalizeStreamInput(editForm.streamUrl || '');
    const normalizedIcon = normalizeMediaAssetUrl(editForm.iconUrl || '');
    const updated: Channel = {
      ...editForm,
      name: editForm.name.trim(),
      program: editForm.program.trim() || 'Live Broadcast',
      subtitle: editForm.subtitle.trim(),
      progress: Math.min(100, Math.max(0, Number(editForm.progress) || 0)),
      streamUrl: normalizedUrl || undefined,
      streamType: editForm.streamType || 'auto',
      useRelayServer: Boolean(editForm.useRelayServer),
      iconUrl: normalizedIcon || undefined,
    };
    onUpdateChannel(updated);
    return updated;
  };

  const handleSaveChannelForm = (e: React.FormEvent) => {
    e.preventDefault();
    const prevUrl = (selectedChannel?.streamUrl || '').trim();
    const updated = commitChannelForm();
    if (!updated) return;
    const nextUrl = (updated.streamUrl || '').trim();
    const urlChanged = prevUrl !== nextUrl;
    showNotice(
      urlChanged
        ? `Updated live playback source for "${updated.name}" and cleared previous stream chat.`
        : updated.streamUrl
          ? `Updated live playback source and metadata for "${updated.name}".`
          : `Updated metadata for "${updated.name}".`
    );
  };

  const handlePreviewChannel = () => {
    const updated = commitChannelForm();
    if (updated && onPreviewChannel) {
      onPreviewChannel(updated);
    }
  };

  const startEditGuide = (ch: Channel) => {
    const existing = guideSchedule.find((g) => g.channelId === ch.id);
    setEditingGuideId(ch.id);
    setGuideDraft(
      existing
        ? { ...existing }
        : {
            channelId: ch.id,
            currentTitle: ch.program || ch.name,
            currentTime: '12:00 AM',
            nextTitle: 'Late Broadcast',
            nextTime: '1:00 AM',
          }
    );
  };

  const saveEditGuide = () => {
    if (!guideDraft) return;
    onUpdateGuideProgramme(guideDraft);
    setEditingGuideId(null);
    setGuideDraft(null);
    showNotice('TV Guide programme slot updated.');
  };

  const handleSelectSlide = (slideId: string) => {
    setSelectedSlideId(slideId);
    setRevealSlideUrl(false);
    const found = heroSlides.find((s) => s.id === slideId);
    if (found) setSlideDraft(found);
  };

  const handleAddSlide = () => {
    const newSlide: HeroSlide = {
      id: `slide-${Date.now()}`,
      kicker: 'Featured Broadcast',
      title: 'New Spotlight Programme',
      subtitle: 'Tune in live on Kakumiro Online TV.',
      channelId: channels[0]?.id || 'kakumiro-tv',
      imagePath: STUDIO_IMAGE,
      mediaMode: 'photo',
    };
    onAddHeroSlide(newSlide);
    setSelectedSlideId(newSlide.id);
    setSlideDraft(newSlide);
    showNotice('New hero spotlight slide added.');
  };

  const handleSlidePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showNotice('Please choose an image smaller than 6 MB.');
      return;
    }
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const res = await uploadMediaFileToCloud({
          file,
          uid,
          description: `Hero slide backdrop: ${slideDraft.title}`,
          publicVisible: false,
        });
        setSlideDraft((prev) => ({ ...prev, imagePath: res.record.url }));
        showNotice(`Photo "${file.name}" saved to Cloud Storage and attached to slide.`);
      } else {
        const compressed = await compressImageFileToDataUrl(file);
        setSlideDraft((prev) => ({ ...prev, imagePath: compressed }));
        showNotice(`Photo "${file.name}" optimized and attached to slide.`);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to attach slide photo.'
      );
    }
  };

  const handlePromoPhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showNotice('Please choose an image smaller than 6 MB.');
      return;
    }
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const res = await uploadMediaFileToCloud({
          file,
          uid,
          description: `Hero promo banner: ${promoDraft.heading}`,
          publicVisible: false,
        });
        setPromoDraft((prev) => ({ ...prev, imagePath: res.record.url }));
        showNotice(`Photo "${file.name}" saved to Cloud Storage and attached to Hero Promo.`);
      } else {
        const compressed = await compressImageFileToDataUrl(file);
        setPromoDraft((prev) => ({ ...prev, imagePath: compressed }));
        showNotice(`Photo "${file.name}" optimized and attached to Hero Promo.`);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to attach promo photo.'
      );
    }
  };

  const handleSaveSpotlight = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedSlide: HeroSlide = {
      ...slideDraft,
      imagePath: normalizeMediaAssetUrl(slideDraft.imagePath),
      streamUrl: slideDraft.streamUrl
        ? normalizeStreamInput(slideDraft.streamUrl) || undefined
        : undefined,
    };
    const cleanedPromo: PromoConfig = {
      ...promoDraft,
      imagePath: normalizeMediaAssetUrl(promoDraft.imagePath),
      streamUrl: promoDraft.streamUrl
        ? normalizeStreamInput(promoDraft.streamUrl) || undefined
        : undefined,
      streamType: promoDraft.streamType || 'auto',
      autoplayStream: promoDraft.autoplayStream ?? true,
    };
    onUpdateHeroSlide(cleanedSlide);
    onUpdatePromo(cleanedPromo);
    onUpdateAppConfig(configDraft);
    showNotice('Hero carousel, slide media, and promotional card updated.');
  };

  const resetArchiveForm = () => {
    setEditingArchiveId(null);
    setArcTitle('');
    setArcCategory('archive');
    setArcChannelId(channels[0]?.id || 'kakumiro-tv');
    setArcDuration('30m');
    setArcThumbnail('');
    setArcAutoDetectNote(null);
    setArcLocalVideoUrl('');
    arcThumbnailManualRef.current = false;
    lastArcDetectedUrlRef.current = '';
    setArcDescription('');
    setArcMediaUrl('');
    setArcStreamType('auto');
    setRevealArcUrl(false);
  };

  const startEditArchive = (item: ArchiveItem) => {
    setEditingArchiveId(item.id);
    setArcTitle(item.title);
    setArcCategory(item.category);
    setArcChannelId(item.channelId);
    setArcDuration(item.duration);
    setArcThumbnail(item.thumbnailPath || '');
    setArcAutoDetectNote(null);
    setArcLocalVideoUrl('');
    arcThumbnailManualRef.current = Boolean(item.thumbnailPath);
    lastArcDetectedUrlRef.current = normalizeStreamInput(item.mediaUrl || '');
    setArcDescription(item.description);
    setArcMediaUrl(item.mediaUrl || '');
    setArcStreamType(item.streamType || 'auto');
    setRevealArcUrl(false);
  };

  const handleArchiveThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showNotice('Please choose a thumbnail image smaller than 6 MB.');
      return;
    }
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const res = await uploadMediaFileToCloud({
          file,
          uid,
          description: arcTitle.trim()
            ? `Program thumbnail: ${arcTitle.trim()}`
            : 'Program thumbnail',
          publicVisible: false,
        });
        arcThumbnailManualRef.current = true;
        setArcThumbnail(res.record.url);
        setArcAutoDetectNote(null);
        showNotice(`Thumbnail "${file.name}" saved to Cloud Storage and attached.`);
      } else {
        const compressed = await compressImageFileToDataUrl(file);
        arcThumbnailManualRef.current = true;
        setArcThumbnail(compressed);
        setArcAutoDetectNote(null);
        showNotice(`Thumbnail "${file.name}" optimized and attached.`);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to attach thumbnail.'
      );
    }
  };

  const handleAddArchive = (e: React.FormEvent) => {
    e.preventDefault();
    if (!arcTitle.trim()) {
      showNotice('Enter a title for the recording.');
      return;
    }
    const matchedChannel =
      channels.find((c) => c.id === arcChannelId) || channels[0];
    const normalizedMedia = normalizeStreamInput(arcMediaUrl);
    const existingItem = editingArchiveId
      ? archiveItems.find((a) => a.id === editingArchiveId)
      : undefined;
    const payload: ArchiveItem = {
      id: editingArchiveId || `item-${Date.now()}`,
      title: arcTitle.trim(),
      channelId: matchedChannel?.id || arcChannelId,
      channelName: matchedChannel?.name || 'KAKUMIRO ONLINE TV',
      duration: arcDuration.trim() || '30m',
      recordedAt: existingItem?.recordedAt || 'Just added',
      category: arcCategory,
      description:
        arcDescription.trim() || 'Published by station administrator.',
      thumbnailPath: normalizeMediaAssetUrl(arcThumbnail) || undefined,
      mediaUrl: normalizedMedia || undefined,
      streamType: arcStreamType,
    };
    if (editingArchiveId) {
      onUpdateArchiveItem(payload);
      showNotice(`Updated "${payload.title}".`);
    } else {
      onAddArchiveItem(payload);
      showNotice(
        `Published "${payload.title}" to ${
          payload.category === 'archive' ? 'TV Archive' : 'Podcasts'
        }.`
      );
    }
    resetArchiveForm();
  };

  const resetMovieForm = () => {
    setEditingMovieId(null);
    setMovieTitle('');
    setMovieFormat('movie');
    setMovieGenre('Bunyoro Films');
    setMovieYear('2025');
    setMovieDuration('1h 45m');
    setMovieChannelId(channels[0]?.id || 'kakumiro-tv');
    setMoviePoster('');
    setMovieAutoDetectNote(null);
    setMovieLocalVideoUrl('');
    moviePosterManualRef.current = false;
    lastMovieDetectedUrlRef.current = '';
    setMovieDescription('');
    setMovieStreamUrl('');
    setMovieStreamType('auto');
    setMovieFeatured(true);
    setRevealMovieUrl(false);
  };

  const handleMoviePosterUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showNotice('Please choose a poster image smaller than 6 MB.');
      return;
    }
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const res = await uploadMediaFileToCloud({
          file,
          uid,
          description: movieTitle.trim()
            ? `Movie poster: ${movieTitle.trim()}`
            : 'Movie poster',
          publicVisible: false,
        });
        moviePosterManualRef.current = true;
        setMoviePoster(res.record.url);
        setMovieAutoDetectNote(null);
        showNotice(`Poster "${file.name}" saved to Cloud Storage and attached.`);
      } else {
        const compressed = await compressImageFileToDataUrl(file);
        moviePosterManualRef.current = true;
        setMoviePoster(compressed);
        setMovieAutoDetectNote(null);
        showNotice(`Poster "${file.name}" optimized and attached.`);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to attach movie poster.'
      );
    }
  };

  const handleMovieVideoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      showNotice('Sign in with your Admin account to upload videos to Cloud Storage.');
      return;
    }

    // Keep local blob preview for instant frame scrubbing + cutout
    const previewBlobUrl = URL.createObjectURL(file);
    setMovieLocalVideoUrl(previewBlobUrl);

    if (!moviePosterManualRef.current || !moviePoster.trim()) {
      void extractFrameFromVideoFile(file, {
        seekSeconds: 2,
        aspect: 'poster',
      })
        .then((captured) => {
          if (!moviePosterManualRef.current || !moviePoster.trim()) {
            moviePosterManualRef.current = false;
            setMoviePoster(captured);
            setMovieAutoDetectNote(
              'Poster frame auto-cutout captured from uploaded video.'
            );
          }
        })
        .catch(() => undefined);
    }

    setUploadingMovieVideo(true);
    try {
      const res = await uploadMediaFileToCloud({
        file,
        uid,
        description: movieTitle.trim()
          ? `Movie video: ${movieTitle.trim()}`
          : 'Movie video',
        publicVisible: false,
      });
      lastMovieDetectedUrlRef.current = res.record.url;
      setMovieStreamUrl(res.record.url);
      setMovieStreamType('media');
      showNotice(res.note);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to upload movie video.'
      );
    } finally {
      setUploadingMovieVideo(false);
    }
  };

  const handleArchiveMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      showNotice('Sign in with your Admin account to upload media to Cloud Storage.');
      return;
    }

    if (file.type.startsWith('video/')) {
      const previewBlobUrl = URL.createObjectURL(file);
      setArcLocalVideoUrl(previewBlobUrl);
      if (!arcThumbnailManualRef.current || !arcThumbnail.trim()) {
        void extractFrameFromVideoFile(file, {
          seekSeconds: 2,
          aspect: 'landscape',
        })
          .then((captured) => {
            if (!arcThumbnailManualRef.current || !arcThumbnail.trim()) {
              arcThumbnailManualRef.current = false;
              setArcThumbnail(captured);
              setArcAutoDetectNote(
                'Thumbnail frame auto-cutout captured from uploaded video.'
              );
            }
          })
          .catch(() => undefined);
      }
    }

    setUploadingArchiveMedia(true);
    try {
      const res = await uploadMediaFileToCloud({
        file,
        uid,
        description: arcTitle.trim()
          ? `Recording: ${arcTitle.trim()}`
          : 'Station recording',
        publicVisible: true,
      });
      lastArcDetectedUrlRef.current = res.record.url;
      setArcMediaUrl(res.record.url);
      setArcStreamType(res.record.category === 'audio' ? 'audio' : 'media');
      showNotice(res.note);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to upload media file.'
      );
    } finally {
      setUploadingArchiveMedia(false);
    }
  };

  const startEditMovie = (movie: MovieItem) => {
    setEditingMovieId(movie.id);
    setMovieTitle(movie.title);
    setMovieFormat(movie.format);
    setMovieGenre(movie.genre);
    setMovieYear(movie.year);
    setMovieDuration(movie.duration);
    setMovieChannelId(movie.channelId);
    setMoviePoster(movie.posterPath || '');
    setMovieAutoDetectNote(null);
    setMovieLocalVideoUrl('');
    moviePosterManualRef.current = Boolean(movie.posterPath);
    lastMovieDetectedUrlRef.current = normalizeStreamInput(
      movie.streamUrl || ''
    );
    setMovieDescription(movie.description);
    setMovieStreamUrl(movie.streamUrl || '');
    setMovieStreamType(movie.streamType || 'auto');
    setMovieFeatured(Boolean(movie.featured));
    setRevealMovieUrl(false);
  };

  const handleSaveMovie = (e: React.FormEvent) => {
    e.preventDefault();
    if (!movieTitle.trim()) {
      showNotice('Enter a movie or series title.');
      return;
    }
    const matchedChannel =
      channels.find((c) => c.id === movieChannelId) || channels[0];
    const normalizedStream = normalizeStreamInput(movieStreamUrl);
    const payload: MovieItem = {
      id: editingMovieId || `mov-${Date.now()}`,
      title: movieTitle.trim(),
      format: movieFormat,
      genre: movieGenre,
      year: movieYear.trim() || '2025',
      duration:
        movieDuration.trim() ||
        (movieFormat === 'series' ? 'Season 1 · 8 Episodes' : '1h 45m'),
      description:
        movieDescription.trim() || 'Published by station administrator.',
      posterPath: normalizeMediaAssetUrl(moviePoster) || undefined,
      channelId: matchedChannel?.id || movieChannelId,
      channelName: matchedChannel?.name || 'KAKUMIRO ONLINE TV',
      streamUrl: normalizedStream || undefined,
      streamType: movieStreamType,
      featured: movieFeatured,
    };
    if (editingMovieId) {
      onUpdateMovie(payload);
      showNotice(`Updated "${payload.title}" (${payload.genre}).`);
    } else {
      onAddMovie(payload);
      showNotice(`Added "${payload.title}" to ${payload.genre}.`);
    }
    resetMovieForm();
  };

  const resetNewsForm = () => {
    setEditingNewsId(null);
    setNewsHeadline('');
    setNewsCategory('Breaking');
    setNewsAuthor('KOTV News Desk');
    setNewsSummary('');
    setNewsBody('');
    setNewsImageUrl('');
    setNewsChannelId('');
    setNewsFeatured(true);
    setNewsAlsoPush(false);
  };

  const startEditNews = (article: NewsArticle) => {
    setEditingNewsId(article.id);
    setNewsHeadline(article.headline);
    setNewsCategory(article.category);
    setNewsAuthor(article.author);
    setNewsSummary(article.summary);
    setNewsBody(article.body);
    setNewsImageUrl(article.imageUrl || '');
    setNewsChannelId(article.channelId || '');
    setNewsFeatured(Boolean(article.featured));
    setNewsAlsoPush(false);
  };

  const handleNewsImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const res = await uploadMediaFileToCloud({
          file,
          uid,
          description: newsHeadline.trim()
            ? `News photo: ${newsHeadline.trim()}`
            : 'Breaking news photo',
          publicVisible: false,
        });
        setNewsImageUrl(res.record.url);
        showNotice(`Photo "${file.name}" saved to Cloud Storage and attached.`);
      } else {
        const compressed = await compressImageFileToDataUrl(file);
        setNewsImageUrl(compressed);
        showNotice(`Photo "${file.name}" optimized and attached.`);
      }
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to attach news photo.'
      );
    }
  };

  const handleSaveNewsArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    const headline = newsHeadline.trim();
    const body = newsBody.trim();
    if (!headline) {
      showNotice('Enter a headline for the written news article.');
      return;
    }
    if (!body) {
      showNotice('Write the article body text before publishing.');
      return;
    }
    const existing = editingNewsId
      ? newsArticles.find((a) => a.id === editingNewsId)
      : undefined;
    const summary =
      newsSummary.trim() || body.split(/\n+/)[0]?.slice(0, 260) || headline;
    const nowLabel = new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const payload: NewsArticle = {
      id: editingNewsId || `news-${Date.now()}`,
      headline,
      summary,
      body,
      category: newsCategory,
      author: newsAuthor.trim() || 'KOTV News Desk',
      imageUrl: normalizeMediaAssetUrl(newsImageUrl) || undefined,
      channelId: newsChannelId || undefined,
      featured: newsFeatured,
      publishedAt: existing?.publishedAt || nowLabel,
      timestampMs: existing?.timestampMs || Date.now(),
      sentByUid: auth.currentUser?.uid || existing?.sentByUid,
    };

    if (editingNewsId) {
      onUpdateNewsArticle?.(payload);
      showNotice(`Updated breaking news article "${payload.headline}".`);
    } else {
      onAddNewsArticle?.(payload);
      let statusMsg = `Published written article "${payload.headline}".`;
      if (newsAlsoPush && onPublishBroadcastAlert) {
        try {
          const pushResult = await onPublishBroadcastAlert({
            category: payload.category === 'Sports' ? 'sports' : 'news',
            title: payload.headline.slice(0, 120),
            body: payload.summary.slice(0, 280),
            channelId: payload.channelId,
          });
          statusMsg = `${statusMsg} ${pushResult}`;
        } catch {
          statusMsg = `${statusMsg} (Push alert could not be dispatched.)`;
        }
      }
      showNotice(statusMsg);
    }
    resetNewsForm();
  };

  const resetArtistForm = () => {
    setEditingArtistId(null);
    setArtistName('');
    setArtistGenre('Afrobeat');
    setArtistOrigin('Kakumiro, Bunyoro');
    setArtistRelease('');
    setArtistBio('');
    setArtistPhotoUrl('');
    setArtistMediaUrl('');
    setArtistStreamType('auto');
    setArtistChannelId('');
    setArtistFeatured(false);
  };

  const startEditArtist = (artist: ArtistProfile) => {
    setEditingArtistId(artist.id);
    setArtistName(artist.name);
    setArtistGenre(artist.stageGenre);
    setArtistOrigin(artist.origin);
    setArtistRelease(artist.latestRelease);
    setArtistBio(artist.bio);
    setArtistPhotoUrl(artist.photoUrl || '');
    setArtistMediaUrl(artist.mediaUrl || '');
    setArtistStreamType(artist.streamType || 'auto');
    setArtistChannelId(artist.channelId || '');
    setArtistFeatured(Boolean(artist.featured));
  };

  const handleArtistPhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await uploadAdminIconImage(
        file,
        artistName.trim() ? `Artist photo: ${artistName.trim()}` : 'Artist photo'
      );
      setArtistPhotoUrl(url);
      showNotice(`Artist photo "${file.name}" attached.`);
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Unable to attach artist photo.'
      );
    }
  };

  const handleSaveArtist = (e: React.FormEvent) => {
    e.preventDefault();
    const name = artistName.trim();
    if (!name) {
      showNotice('Enter the artist or choir name first.');
      return;
    }
    const existing = editingArtistId
      ? artists.find((a) => a.id === editingArtistId)
      : undefined;
    const payload: ArtistProfile = {
      id: editingArtistId || `artist-${Date.now()}`,
      name,
      stageGenre: artistGenre,
      origin: artistOrigin.trim() || 'Kakumiro, Uganda',
      latestRelease: artistRelease.trim() || 'Live Studio Session',
      bio:
        artistBio.trim() ||
        `Featured ${artistGenre} artist performing on Kakumiro Online TV.`,
      photoUrl: normalizeMediaAssetUrl(artistPhotoUrl) || undefined,
      mediaUrl: normalizeStreamInput(artistMediaUrl) || undefined,
      streamType: artistStreamType,
      channelId: artistChannelId || undefined,
      featured: artistFeatured,
      timestampMs: existing?.timestampMs || Date.now(),
      sentByUid: auth.currentUser?.uid || existing?.sentByUid,
    };

    if (editingArtistId) {
      onUpdateArtist?.(payload);
      showNotice(`Updated artist profile "${payload.name}".`);
    } else {
      onAddArtist?.(payload);
      showNotice(`Published artist "${payload.name}" to More → Artists.`);
    }
    resetArtistForm();
  };

  const handleSaveControls = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateAppConfig(configDraft);
    showNotice('App features and broadcast controls saved.');
  };

  const moveHomeSection = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= homeDraft.sectionOrder.length) {
      return;
    }
    const nextOrder = [...homeDraft.sectionOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);
    setHomeDraft({ ...homeDraft, sectionOrder: nextOrder });
  };

  const toggleFeaturedChannel = (channelId: string) => {
    const exists = homeDraft.featuredChannelIds.includes(channelId);
    const nextIds = exists
      ? homeDraft.featuredChannelIds.filter((id) => id !== channelId)
      : [...homeDraft.featuredChannelIds, channelId];
    setHomeDraft({ ...homeDraft, featuredChannelIds: nextIds });
  };

  const moveFeaturedChannel = (channelId: string, delta: -1 | 1) => {
    const idx = homeDraft.featuredChannelIds.indexOf(channelId);
    const target = idx + delta;
    if (
      idx === -1 ||
      target < 0 ||
      target >= homeDraft.featuredChannelIds.length
    ) {
      return;
    }
    const nextIds = [...homeDraft.featuredChannelIds];
    const [moved] = nextIds.splice(idx, 1);
    nextIds.splice(target, 0, moved);
    setHomeDraft({ ...homeDraft, featuredChannelIds: nextIds });
  };

  const handleSaveHomeScreen = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateHomeConfig(homeDraft);
    if (promoDraft.enabled !== promo.enabled) {
      onUpdatePromo({ ...promo, enabled: promoDraft.enabled });
    }
    showNotice('Home screen layout, sections, and content synced to viewers.');
  };

  const handleResetHomeScreen = () => {
    setHomeDraft(DEFAULT_HOME_CONFIG);
    onUpdateHomeConfig(DEFAULT_HOME_CONFIG);
    showNotice('Home screen restored to default layout.');
  };

  return (
    <div className="mt-4 space-y-5">
      {/* Unboxed tabular summary strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#a5a3b2] pb-3 border-b border-white/[0.06]">
        <span>
          <strong className="text-[#f5f4f8] font-mono-tabular">
            {channels.length}
          </strong>{' '}
          channels
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-[#f5f4f8] font-mono-tabular">{tvCount}</strong>{' '}
          TV /{' '}
          <strong className="text-[#f5f4f8] font-mono-tabular">
            {radioCount}
          </strong>{' '}
          Radio
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-[#f5f4f8] font-mono-tabular">
            {streamCount}
          </strong>{' '}
          live streams
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-[#f5f4f8] font-mono-tabular">
            {archiveItems.length}
          </strong>{' '}
          archive &amp; podcast items
        </span>
      </div>

      {/* Section selector */}
      <div
        className="flex items-center gap-2 overflow-x-auto no-scrollbar"
        role="tablist"
        aria-label="Admin control sections"
      >
        {(
          [
            { id: 'channels', label: 'Channels & Streams', Icon: Tv },
            { id: 'home', label: 'Home Screen', Icon: Home },
            { id: 'guide', label: 'TV Guide', Icon: CalendarRange },
            { id: 'spotlight', label: 'Hero & Promo', Icon: Sparkles },
            { id: 'movies', label: 'Movies & Series', Icon: Clapperboard },
            { id: 'archive', label: 'Archive & Podcasts', Icon: Film },
            { id: 'news', label: 'Breaking News', Icon: Newspaper },
            { id: 'artists', label: 'Artists', Icon: Mic2 },
            { id: 'library', label: 'Media Library', Icon: Library },
            { id: 'storage', label: 'Cloud Storage', Icon: HardDrive },
            { id: 'backups', label: 'Backups', Icon: DatabaseBackup },
            { id: 'users', label: 'Users & Admins', Icon: Users },
            { id: 'alerts', label: 'Live Alerts & Server', Icon: BellRing },
            { id: 'controls', label: 'App Features', Icon: Megaphone },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setSection(id);
                setNotice(null);
              }}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-colors ${
                active
                  ? 'bg-[#ffd21f] text-[#101016]'
                  : 'bg-[#101016] text-[#c9c7d2] border border-white/[0.08] hover:bg-[#262631]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          role="status"
          className="px-3.5 py-2.5 rounded-xl bg-[#ffd21f]/10 border border-[#ffd21f]/30 text-xs font-medium text-[#ffd21f] flex items-center justify-between gap-3"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[#ffd21f] hover:underline text-xs shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. CHANNELS & STREAMS MANAGEMENT */}
      {section === 'channels' && (
        <div className="space-y-5">
          {/* Dedicated Active Stream URL & Metadata Editor */}
          <form
            onSubmit={handleSaveChannelForm}
            className="p-4 sm:p-5 rounded-xl bg-[#101016] border border-white/[0.08] space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#ffd21f]" />
                  Edit Active Stream URL &amp; Metadata
                </h3>
                <p className="text-xs text-[#a5a3b2] mt-0.5">
                  Select any channel to update its live playback source and programme info
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddChannel((prev) => !prev)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#ffd21f]" />
                {showAddChannel ? 'Close new channel' : 'New channel'}
              </button>
            </div>

            <div>
              <label
                htmlFor="admin-channel-select"
                className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
              >
                Channel to edit
              </label>
              <select
                id="admin-channel-select"
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm font-semibold text-[#f5f4f8]"
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name} ({ch.type}) — {ch.streamUrl ? 'Stream live' : 'Stand-by'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="admin-stream-url"
                    className="text-xs font-medium text-[#c9c7d2]"
                  >
                    Active Stream URL (Source Masked)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRevealEditUrl((prev) => !prev)}
                      className="text-xs text-[#ffd21f] hover:underline inline-flex items-center gap-1"
                    >
                      {revealEditUrl ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          Hide URL
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          Reveal URL
                        </>
                      )}
                    </button>
                    {editForm.streamUrl && (
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, streamUrl: '' })}
                        className="text-xs text-[#a5a3b2] hover:text-[#f5f4f8]"
                      >
                        Clear URL
                      </button>
                    )}
                  </div>
                </div>
                <input
                  id="admin-stream-url"
                  type={revealEditUrl ? 'text' : 'password'}
                  autoComplete="off"
                  value={editForm.streamUrl || ''}
                  onChange={(e) =>
                    setEditForm({ ...editForm, streamUrl: e.target.value })
                  }
                  placeholder="Paste stream URL or <iframe src='...'>"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                />
                {editForm.streamUrl?.trim() && (
                  <p className="text-[11px] text-[#a5a3b2] mt-1">
                    {revealEditUrl ? (
                      <>
                        Detected mode:{' '}
                        <span className="text-[#ffd21f] font-medium">
                          {resolveStreamSource(
                            editForm.streamUrl,
                            editForm.streamType || 'auto',
                            editForm.type
                          )?.providerLabel || 'Media Stream'}
                        </span>
                      </>
                    ) : (
                      <span>Playback source active (hidden from viewers)</span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="admin-stream-format"
                  className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                >
                  Stream Mode
                </label>
                <select
                  id="admin-stream-format"
                  value={editForm.streamType || 'auto'}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      streamType: e.target.value as StreamFormat,
                    })
                  }
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                >
                  {STREAM_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="admin-ch-name"
                  className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                >
                  Channel Name
                </label>
                <input
                  id="admin-ch-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  placeholder="Channel name"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-ch-program"
                  className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                >
                  Current Programme
                </label>
                <input
                  id="admin-ch-program"
                  type="text"
                  value={editForm.program}
                  onChange={(e) =>
                    setEditForm({ ...editForm, program: e.target.value })
                  }
                  placeholder="On now programme"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-ch-subtitle"
                  className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                >
                  Subtitle / Tagline
                </label>
                <input
                  id="admin-ch-subtitle"
                  type="text"
                  value={editForm.subtitle}
                  onChange={(e) =>
                    setEditForm({ ...editForm, subtitle: e.target.value })
                  }
                  placeholder="e.g. Live, After 5, EPL Preview"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="admin-ch-type"
                    className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                  >
                    Type
                  </label>
                  <select
                    id="admin-ch-type"
                    value={editForm.type}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        type: e.target.value as ChannelType,
                      })
                    }
                    className="w-full min-h-[42px] px-2.5 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                  >
                    <option value="Television">Television</option>
                    <option value="Radios">Radios</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="admin-ch-brand"
                    className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                  >
                    Brand Style
                  </label>
                  <select
                    id="admin-ch-brand"
                    value={editForm.brand}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        brand: e.target.value as BrandTheme,
                      })
                    }
                    className="w-full min-h-[42px] px-2.5 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                  >
                    {BRAND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelLogo
                    brand={editForm.brand}
                    name={editForm.name || 'CH'}
                    iconUrl={editForm.iconUrl}
                    type={editForm.type}
                    defaultStationIconUrl={homeConfig.stationIconUrl}
                    defaultRadioIconUrl={homeConfig.radioIconUrl}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#f5f4f8]">
                      Channel / Radio Icon (Online)
                    </p>
                    <p className="text-[11px] text-[#a5a3b2] truncate">
                      Custom icon for this TV channel or radio station across the app.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                    {uploadingChannelIcon === 'edit' ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#ffd21f] animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    )}
                    Upload Icon
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingChannelIcon === 'edit'}
                      onChange={(e) => void handleChannelIconUpload(e, 'edit')}
                      className="sr-only"
                    />
                  </label>
                  {editForm.iconUrl && (
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, iconUrl: '' })}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#101016] hover:bg-[#262631] border border-white/10 text-xs font-medium text-[#c9c7d2] inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Default
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={editForm.iconUrl || ''}
                onChange={(e) =>
                  setEditForm({ ...editForm, iconUrl: e.target.value })
                }
                placeholder="Paste channel/radio icon image URL or upload file above"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label
                  htmlFor="admin-ch-progress"
                  className="font-medium text-[#c9c7d2]"
                >
                  Programme Progress
                </label>
                <span className="font-mono-tabular text-[#ffd21f] font-semibold">
                  {editForm.progress}%
                </span>
              </div>
              <input
                id="admin-ch-progress"
                type="range"
                min={0}
                max={100}
                value={editForm.progress}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    progress: Number(e.target.value),
                  })
                }
                className="w-full accent-[#ffd21f] cursor-pointer"
              />
            </div>

            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-[#f5f4f8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editForm.useRelayServer)}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        useRelayServer: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                  />
                  Route via Station Streaming Server (HLS/Media Relay Proxy)
                </label>

                <button
                  type="button"
                  onClick={() => void handleProbeChannelStream()}
                  disabled={probingStream}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                >
                  <Activity className="w-3.5 h-3.5 text-[#ffd21f]" />
                  {probingStream ? 'Testing stream...' : 'Test Stream Health'}
                </button>
              </div>
              <p className="text-[11px] text-[#a5a3b2]">
                Routes HLS (.m3u8) and HTTP/CORS-restricted feeds through the independent cloud streaming server.
              </p>
              {probeResult && (
                <p
                  className={`text-xs font-medium ${
                    probeResult.ok ? 'text-[#ffd21f]' : 'text-red-300'
                  }`}
                >
                  {probeResult.ok
                    ? `Stream healthy · HTTP ${probeResult.status} · ${probeResult.latencyMs}ms · ${probeResult.detectedKind?.toUpperCase() || 'STREAM'}`
                    : `Probe failed (HTTP ${probeResult.status}): ${probeResult.error || 'Origin unreachable'}`}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              {onPreviewChannel && (
                <button
                  type="button"
                  onClick={handlePreviewChannel}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Play className="w-3.5 h-3.5 text-[#ffd21f] fill-current" />
                  Save &amp; Preview Live
                </button>
              )}
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Save Stream &amp; Metadata
              </button>
            </div>
          </form>

          {/* Collapsible Add New Channel Form */}
          {showAddChannel && (
            <form
              onSubmit={handleCreateChannel}
              className="p-4 rounded-xl bg-[#101016] border border-[#ffd21f]/30 space-y-3"
            >
              <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#ffd21f]" />
                Add new channel &amp; live stream
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newChName}
                  onChange={(e) => setNewChName(e.target.value)}
                  placeholder="Channel name (e.g. Bukedde TV)"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                />
                <select
                  value={newChType}
                  onChange={(e) => setNewChType(e.target.value as ChannelType)}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                >
                  <option value="Television">Television</option>
                  <option value="Radios">Radios</option>
                </select>
                <input
                  type="text"
                  value={newChProgram}
                  onChange={(e) => setNewChProgram(e.target.value)}
                  placeholder="Current programme (e.g. Agataliiko Nfuufu)"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                />
                <select
                  value={newChBrand}
                  onChange={(e) => setNewChBrand(e.target.value as BrandTheme)}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                >
                  {BRAND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newChSubtitle}
                  onChange={(e) => setNewChSubtitle(e.target.value)}
                  placeholder="Subtitle (optional)"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                />
                <div className="relative">
                  <input
                    type={revealNewUrl ? 'text' : 'password'}
                    autoComplete="off"
                    value={newChStreamUrl}
                    onChange={(e) => setNewChStreamUrl(e.target.value)}
                    placeholder="Masked stream or embed URL"
                    className="w-full min-h-[42px] pl-3 pr-10 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealNewUrl((prev) => !prev)}
                    aria-label={revealNewUrl ? 'Hide URL' : 'Reveal URL'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#a5a3b2] hover:text-[#ffd21f]"
                  >
                    {revealNewUrl ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <select
                  value={newChStreamType}
                  onChange={(e) =>
                    setNewChStreamType(e.target.value as StreamFormat)
                  }
                  aria-label="New channel stream mode"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8]"
                >
                  {STREAM_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <ChannelLogo
                      brand={newChBrand}
                      name={newChName || 'New'}
                      iconUrl={newChIconUrl}
                      type={newChType}
                      defaultStationIconUrl={homeConfig.stationIconUrl}
                      defaultRadioIconUrl={homeConfig.radioIconUrl}
                      size="sm"
                    />
                    <span className="text-xs font-semibold text-[#e4e2ec]">
                      Channel / Radio Icon (Optional)
                    </span>
                  </div>
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                    {uploadingChannelIcon === 'new' ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#ffd21f] animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    )}
                    Upload Icon
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingChannelIcon === 'new'}
                      onChange={(e) => void handleChannelIconUpload(e, 'new')}
                      className="sr-only"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={newChIconUrl}
                  onChange={(e) => setNewChIconUrl(e.target.value)}
                  placeholder="Optional custom icon URL for this TV channel or radio station"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs font-semibold text-[#e4e2ec] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newChUseRelayServer}
                  onChange={(e) => setNewChUseRelayServer(e.target.checked)}
                  className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                />
                Route via Station Streaming Server (HLS/Media Relay Proxy)
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold whitespace-nowrap transition-colors"
                >
                  Create channel
                </button>
              </div>
            </form>
          )}

          {/* Channel Lineup List */}
          <div className="space-y-2">
            {channels.map((ch) => {
              const isSelected = ch.id === selectedChannelId;
              return (
                <div
                  key={ch.id}
                  className={`p-3.5 rounded-xl bg-[#101016] border transition-colors ${
                    isSelected ? 'border-[#ffd21f]/50' : 'border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChannelLogo
                        brand={ch.brand}
                        name={ch.name}
                        iconUrl={ch.iconUrl}
                        type={ch.type}
                        defaultStationIconUrl={homeConfig.stationIconUrl}
                        defaultRadioIconUrl={homeConfig.radioIconUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                          {ch.name}
                        </p>
                        <p className="text-xs text-[#a5a3b2] truncate">
                          {ch.type} · {ch.program}
                          {ch.streamUrl ? ' · Live source active' : ' · Stand-by'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onPreviewChannel && (
                        <button
                          type="button"
                          onClick={() => onPreviewChannel(ch)}
                          aria-label={`Play ${ch.name}`}
                          className="min-h-[38px] min-w-[38px] grid place-items-center rounded-lg bg-[#262631] hover:bg-[#323240] text-[#ffd21f] transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedChannelId(ch.id)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-[#ffd21f] text-[#101016]'
                            : 'bg-[#262631] hover:bg-[#323240] text-[#f5f4f8]'
                        }`}
                      >
                        {isSelected ? 'Editing' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteChannel(ch.id);
                          showNotice(`Removed "${ch.name}".`);
                        }}
                        aria-label={`Remove ${ch.name}`}
                        disabled={channels.length <= 1}
                        className="min-h-[38px] min-w-[38px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. HOME SCREEN EDITOR */}
      {section === 'home' && (
        <form onSubmit={handleSaveHomeScreen} className="space-y-5">
          {/* Section Ordering & Visibility */}
          <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#f5f4f8]">
                  Home Screen Section Order &amp; Visibility
                </h3>
                <p className="text-xs text-[#a5a3b2] mt-0.5">
                  Reorder sections or turn them on and off for all viewers
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetHomeScreen}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-xs font-semibold text-[#c9c7d2] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Home Layout
              </button>
            </div>

            <div className="space-y-2">
              {homeDraft.sectionOrder.map((secKey, idx) => {
                const sectionMeta: Record<
                  HomeSectionKey,
                  { label: string; description: string; visible: boolean }
                > = {
                  spotlight: {
                    label: 'Hero & Promo Spotlight',
                    description: 'Top carousel slides and promotional card',
                    visible: homeDraft.showHeroCarousel || promoDraft.enabled,
                  },
                  continueWatching: {
                    label: 'Continue Watching',
                    description: 'Recently played movies and channels shelf',
                    visible: homeDraft.showContinueWatching,
                  },
                  channels: {
                    label: 'Popular Channels',
                    description: 'Live TV and visual radio grid',
                    visible: homeDraft.showChannelsSection,
                  },
                  movies: {
                    label: 'Movies & Series Shelf',
                    description: 'Horizontal cinema and series carousel',
                    visible: homeDraft.showMoviesSection,
                  },
                };
                const info = sectionMeta[secKey];
                return (
                  <div
                    key={secKey}
                    className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                        <span className="font-mono-tabular text-[#ffd21f] mr-2">
                          0{idx + 1}.
                        </span>
                        {info.label}
                      </p>
                      <p className="text-[11px] text-[#a5a3b2] truncate mt-0.5">
                        {info.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveHomeSection(idx, -1)}
                        disabled={idx === 0}
                        aria-label={`Move ${info.label} up`}
                        className="min-h-[38px] min-w-[38px] grid place-items-center rounded-lg bg-[#101016] hover:bg-[#262631] text-[#f5f4f8] disabled:opacity-35 transition-colors"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveHomeSection(idx, 1)}
                        disabled={idx === homeDraft.sectionOrder.length - 1}
                        aria-label={`Move ${info.label} down`}
                        className="min-h-[38px] min-w-[38px] grid place-items-center rounded-lg bg-[#101016] hover:bg-[#262631] text-[#f5f4f8] disabled:opacity-35 transition-colors"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (secKey === 'spotlight') {
                            const nextVisible = !(
                              homeDraft.showHeroCarousel || promoDraft.enabled
                            );
                            setHomeDraft({
                              ...homeDraft,
                              showHeroCarousel: nextVisible,
                            });
                            setPromoDraft({
                              ...promoDraft,
                              enabled: nextVisible,
                            });
                          } else if (secKey === 'continueWatching') {
                            setHomeDraft({
                              ...homeDraft,
                              showContinueWatching:
                                !homeDraft.showContinueWatching,
                            });
                          } else if (secKey === 'channels') {
                            setHomeDraft({
                              ...homeDraft,
                              showChannelsSection:
                                !homeDraft.showChannelsSection,
                            });
                          } else if (secKey === 'movies') {
                            setHomeDraft({
                              ...homeDraft,
                              showMoviesSection: !homeDraft.showMoviesSection,
                            });
                          }
                        }}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                          info.visible
                            ? 'bg-[#ffd21f] text-[#101016]'
                            : 'bg-[#101016] text-[#a5a3b2] border border-white/10'
                        }`}
                      >
                        {info.visible ? 'Visible' : 'Hidden'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hero & Promo Quick Controls */}
          <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8]">
                Hero Carousel &amp; Promo Banner
              </h3>
              <button
                type="button"
                onClick={() => setSection('spotlight')}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#ffd21f] whitespace-nowrap"
              >
                Edit Slides &amp; Promo Media
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] cursor-pointer">
                <span className="text-xs font-semibold text-[#e4e2ec]">
                  Show Hero Carousel
                </span>
                <input
                  type="checkbox"
                  checked={homeDraft.showHeroCarousel}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      showHeroCarousel: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] cursor-pointer">
                <span className="text-xs font-semibold text-[#e4e2ec]">
                  Show Hero Promo Card
                </span>
                <input
                  type="checkbox"
                  checked={promoDraft.enabled}
                  onChange={(e) =>
                    setPromoDraft({
                      ...promoDraft,
                      enabled: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                />
              </label>
            </div>

            <div>
              <label
                htmlFor="home-hero-cta"
                className="block text-xs text-[#a5a3b2] mb-1"
              >
                Hero Primary Button Label
              </label>
              <input
                id="home-hero-cta"
                type="text"
                maxLength={40}
                value={homeDraft.heroCtaLabel}
                onChange={(e) =>
                  setHomeDraft({ ...homeDraft, heroCtaLabel: e.target.value })
                }
                placeholder="Watch live"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
            </div>
          </div>

          {/* Optional Station Spotlight Banner */}
          <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#f5f4f8]">
                  Home Welcome / Spotlight Banner
                </h3>
                <p className="text-xs text-[#a5a3b2] mt-0.5">
                  Optional featured message strip at the top of the Home screen
                </p>
              </div>
              <input
                type="checkbox"
                checked={homeDraft.welcomeBannerEnabled}
                onChange={(e) =>
                  setHomeDraft({
                    ...homeDraft,
                    welcomeBannerEnabled: e.target.checked,
                  })
                }
                aria-label="Enable Home welcome spotlight banner"
                className="w-5 h-5 accent-[#ffd21f] cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Kicker Label
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={homeDraft.welcomeBannerKicker}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      welcomeBannerKicker: e.target.value,
                    })
                  }
                  placeholder="Station Spotlight"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Banner Heading
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={homeDraft.welcomeBannerTitle}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      welcomeBannerTitle: e.target.value,
                    })
                  }
                  placeholder="e.g. Weekend Live Coverage Across Kakumiro"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Action Button Label
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={homeDraft.welcomeBannerCtaLabel}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      welcomeBannerCtaLabel: e.target.value,
                    })
                  }
                  placeholder="Watch now"
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Button Destination
                </label>
                <select
                  value={homeDraft.welcomeBannerChannelId}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      welcomeBannerChannelId: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  <option value="">Open Channels Lineup</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      Play {ch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#a5a3b2] mb-1">
                Banner Description
              </label>
              <textarea
                rows={2}
                maxLength={280}
                value={homeDraft.welcomeBannerBody}
                onChange={(e) =>
                  setHomeDraft({
                    ...homeDraft,
                    welcomeBannerBody: e.target.value,
                  })
                }
                placeholder="Optional short summary shown below the banner heading"
                className="w-full px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
            </div>
          </div>

          {/* Popular Channels Section Editor */}
          <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#f5f4f8]">
                Popular Channels Section
              </h3>
              <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                <input
                  type="checkbox"
                  checked={homeDraft.showChannelsSection}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      showChannelsSection: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#ffd21f]"
                />
                Visible on Home
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Section Title
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={homeDraft.channelsTitle}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      channelsTitle: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Section Subtitle
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={homeDraft.channelsSubtitle}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      channelsSubtitle: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  View All Button Label
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={homeDraft.channelsActionLabel}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      channelsActionLabel: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Channels Shown on Home
                </label>
                <select
                  value={homeDraft.channelsCount}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      channelsCount: Number(e.target.value),
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm font-mono-tabular text-[#f5f4f8]"
                >
                  {[3, 6, 9, 12, 18, 24].map((count) => (
                    <option key={count} value={count}>
                      Up to {count} channels
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-[#e4e2ec]">
                    Pin &amp; Order Channels on Home
                  </p>
                  <p className="text-[11px] text-[#a5a3b2]">
                    Pinned channels appear first in your exact order (leave none pinned to use default lineup order)
                  </p>
                </div>
                {homeDraft.featuredChannelIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setHomeDraft({ ...homeDraft, featuredChannelIds: [] })
                    }
                    className="text-xs text-[#ffd21f] hover:underline"
                  >
                    Clear pinned order
                  </button>
                )}
              </div>

              {homeDraft.featuredChannelIds.length > 0 && (
                <div className="space-y-1.5">
                  {homeDraft.featuredChannelIds.map((id, idx) => {
                    const ch = channels.find((c) => c.id === id);
                    if (!ch) return null;
                    return (
                      <div
                        key={id}
                        className="px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#ffd21f]/30 flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-semibold text-[#f5f4f8] truncate">
                          <span className="font-mono-tabular text-[#ffd21f] mr-2">
                            #{idx + 1}
                          </span>
                          {ch.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveFeaturedChannel(id, -1)}
                            disabled={idx === 0}
                            aria-label={`Move ${ch.name} earlier`}
                            className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg bg-[#101016] text-[#f5f4f8] disabled:opacity-35"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveFeaturedChannel(id, 1)}
                            disabled={
                              idx === homeDraft.featuredChannelIds.length - 1
                            }
                            aria-label={`Move ${ch.name} later`}
                            className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg bg-[#101016] text-[#f5f4f8] disabled:opacity-35"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFeaturedChannel(id)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-[#2a151b] text-[#ff9aa9] text-xs font-semibold"
                          >
                            Unpin
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {channels.map((ch) => {
                  const pinned = homeDraft.featuredChannelIds.includes(ch.id);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleFeaturedChannel(ch.id)}
                      className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 text-left transition-colors ${
                        pinned
                          ? 'bg-[#252116] border-[#ffd21f]/50 text-[#ffd21f]'
                          : 'bg-[#1d1d26] border-white/[0.06] text-[#c9c7d2] hover:bg-[#262631]'
                      }`}
                    >
                      <span className="truncate">{ch.name}</span>
                      <span className="shrink-0 text-[11px]">
                        {pinned ? (
                          <span className="inline-flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Pinned
                          </span>
                        ) : (
                          'Pin'
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Continue Watching & Movies Shelf Editors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#f5f4f8]">
                  Continue Watching Section
                </h3>
                <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={homeDraft.showContinueWatching}
                    onChange={(e) =>
                      setHomeDraft({
                        ...homeDraft,
                        showContinueWatching: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#ffd21f]"
                  />
                  Visible
                </label>
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Section Title
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={homeDraft.continueWatchingTitle}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      continueWatchingTitle: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Section Subtitle
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={homeDraft.continueWatchingSubtitle}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      continueWatchingSubtitle: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#f5f4f8]">
                  Movies &amp; Series Shelf
                </h3>
                <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={homeDraft.showMoviesSection}
                    onChange={(e) =>
                      setHomeDraft({
                        ...homeDraft,
                        showMoviesSection: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#ffd21f]"
                  />
                  Visible
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs text-[#a5a3b2] mb-1">
                    Section Title
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={homeDraft.moviesTitle}
                    onChange={(e) =>
                      setHomeDraft({
                        ...homeDraft,
                        moviesTitle: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#a5a3b2] mb-1">
                    Browse Button Label
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={homeDraft.moviesActionLabel}
                    onChange={(e) =>
                      setHomeDraft({
                        ...homeDraft,
                        moviesActionLabel: e.target.value,
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Section Subtitle
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={homeDraft.moviesSubtitle}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      moviesSubtitle: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                <select
                  value={homeDraft.moviesCount}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      moviesCount: Number(e.target.value),
                    })
                  }
                  aria-label="Number of movies on Home"
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs font-mono-tabular text-[#f5f4f8]"
                >
                  {[4, 6, 8, 12, 16, 24].map((count) => (
                    <option key={count} value={count}>
                      Show up to {count} titles
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs font-medium text-[#e4e2ec] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={homeDraft.moviesFeaturedOnly}
                    onChange={(e) =>
                      setHomeDraft({
                        ...homeDraft,
                        moviesFeaturedOnly: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#ffd21f]"
                  />
                  Featured titles only
                </label>
              </div>
            </div>
          </div>

          {/* Watch Catch-up Rail & Global Auto-Art Photos Shortcut */}
          <div className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#f5f4f8]">
                  Watch Catch-up Rail &amp; Online Auto Art
                </p>
                <p className="text-[11px] text-[#a5a3b2]">
                  Configure the Watch player catch-up rail and jump to Media Library for Auto-Art fallback photos
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSection('library')}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-[#ffd21f]/35 text-[11px] font-semibold text-[#ffd21f] flex items-center gap-1.5"
              >
                <Library className="w-3.5 h-3.5" />
                <span>Manage Auto-Art Photos</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <label className="flex items-center gap-2 text-xs font-medium text-[#e4e2ec] cursor-pointer">
                <input
                  type="checkbox"
                  checked={homeDraft.showWatchCatchupRail !== false}
                  onChange={(e) =>
                    setHomeDraft({
                      ...homeDraft,
                      showWatchCatchupRail: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#ffd21f]"
                />
                Show Watch Catch-up Rail below player
              </label>
              <input
                type="text"
                maxLength={80}
                value={homeDraft.watchCatchupTitle ?? 'More like this'}
                onChange={(e) =>
                  setHomeDraft({
                    ...homeDraft,
                    watchCatchupTitle: e.target.value,
                  })
                }
                placeholder="Catch-up rail title (e.g. More like this)"
                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Home Screen
            </button>
          </div>
        </form>
      )}

      {/* 3. TV GUIDE SCHEDULE */}
      {section === 'guide' && (
        <div className="space-y-2.5">
          <p className="text-xs text-[#a5a3b2]">
            Edit the current and upcoming programme slots displayed in the TV Guide.
          </p>
          {channels.map((ch) => {
            const slot = guideSchedule.find((g) => g.channelId === ch.id);
            const isEditing = editingGuideId === ch.id && guideDraft;

            return (
              <div
                key={ch.id}
                className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] space-y-3"
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-[#ffd21f]">
                      {ch.name}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={guideDraft.currentTitle}
                        onChange={(e) =>
                          setGuideDraft({
                            ...guideDraft,
                            currentTitle: e.target.value,
                          })
                        }
                        placeholder="On now title"
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                      />
                      <input
                        type="text"
                        value={guideDraft.currentTime}
                        onChange={(e) =>
                          setGuideDraft({
                            ...guideDraft,
                            currentTime: e.target.value,
                          })
                        }
                        placeholder="On now time (e.g. 12:00 AM)"
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] font-mono-tabular"
                      />
                      <input
                        type="text"
                        value={guideDraft.nextTitle}
                        onChange={(e) =>
                          setGuideDraft({
                            ...guideDraft,
                            nextTitle: e.target.value,
                          })
                        }
                        placeholder="Up next title"
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                      />
                      <input
                        type="text"
                        value={guideDraft.nextTime}
                        onChange={(e) =>
                          setGuideDraft({
                            ...guideDraft,
                            nextTime: e.target.value,
                          })
                        }
                        placeholder="Up next time (e.g. 1:00 AM)"
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] font-mono-tabular"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGuideId(null);
                          setGuideDraft(null);
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#262631] text-xs font-semibold text-[#c9c7d2]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEditGuide}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#ffd21f] text-[#101016] text-xs font-bold flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Save slot
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChannelLogo
                        brand={ch.brand}
                        name={ch.name}
                        iconUrl={ch.iconUrl}
                        type={ch.type}
                        defaultStationIconUrl={homeConfig.stationIconUrl}
                        defaultRadioIconUrl={homeConfig.radioIconUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                          {ch.name}
                        </p>
                        <p className="text-xs text-[#a5a3b2] truncate font-mono-tabular">
                          {slot?.currentTime || '12:00 AM'} ·{' '}
                          {slot?.currentTitle || ch.program} →{' '}
                          {slot?.nextTime || '1:00 AM'} ·{' '}
                          {slot?.nextTitle || 'Late Broadcast'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEditGuide(ch)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] shrink-0 transition-colors"
                    >
                      Edit guide
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. HERO & PROMO SPOTLIGHT */}
      {section === 'spotlight' && (
        <form onSubmit={handleSaveSpotlight} className="space-y-5">
          <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8]">
                Hero Carousel Slides
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddSlide}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-[#ffd21f]" />
                  Add slide
                </button>
                {heroSlides.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextSlide = heroSlides.find(
                        (s) => s.id !== slideDraft.id
                      );
                      onDeleteHeroSlide(slideDraft.id);
                      if (nextSlide) {
                        setSelectedSlideId(nextSlide.id);
                        setSlideDraft(nextSlide);
                      }
                      showNotice('Removed hero slide.');
                    }}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-200"
                  >
                    Delete slide
                  </button>
                )}
              </div>
            </div>

            {/* Carousel Auto-Play & Interval Controls */}
            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-[#f5f4f8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={configDraft.heroAutoplay}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      heroAutoplay: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                />
                Auto-play hero carousel slides
              </label>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="hero-interval-select"
                  className="text-xs text-[#a5a3b2]"
                >
                  Rotation:
                </label>
                <select
                  id="hero-interval-select"
                  value={configDraft.heroIntervalSec}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      heroIntervalSec: Number(e.target.value),
                    })
                  }
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#101016] border border-[#30303b] text-xs font-mono-tabular text-[#f5f4f8]"
                >
                  <option value={4}>4s</option>
                  <option value={6}>6s</option>
                  <option value={8}>8s</option>
                  <option value={10}>10s</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {heroSlides.map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => handleSelectSlide(slide.id)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    slideDraft.id === slide.id
                      ? 'bg-[#ffd21f] text-[#101016]'
                      : 'bg-[#1d1d26] text-[#c9c7d2] border border-white/[0.08]'
                  }`}
                >
                  {slide.mediaMode === 'video' || slide.useChannelStream ? (
                    <Video className="w-3 h-3" />
                  ) : (
                    <ImageIcon className="w-3 h-3" />
                  )}
                  Slide {idx + 1}: {slide.title}
                </button>
              ))}
            </div>

            {/* Slide Type Selector: Photo Slide vs Active Stream / Video Slide */}
            <div>
              <span className="block text-xs text-[#a5a3b2] mb-1.5">
                Slide Media Type
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSlideDraft({
                      ...slideDraft,
                      mediaMode: 'photo',
                      useChannelStream: false,
                    })
                  }
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors ${
                    slideDraft.mediaMode !== 'video' && !slideDraft.useChannelStream
                      ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                      : 'bg-[#1d1d26] text-[#c9c7d2] border-white/[0.08] hover:bg-[#262631]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Photo Slide
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSlideDraft({
                      ...slideDraft,
                      mediaMode: 'video',
                      useChannelStream:
                        slideDraft.useChannelStream ?? !slideDraft.streamUrl,
                    })
                  }
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors ${
                    slideDraft.mediaMode === 'video' || slideDraft.useChannelStream
                      ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                      : 'bg-[#1d1d26] text-[#c9c7d2] border-white/[0.08] hover:bg-[#262631]'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  Active Stream / Video
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Kicker
                </label>
                <input
                  type="text"
                  value={slideDraft.kicker}
                  onChange={(e) =>
                    setSlideDraft({ ...slideDraft, kicker: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Title / Headline
                </label>
                <input
                  type="text"
                  value={slideDraft.title}
                  onChange={(e) =>
                    setSlideDraft({
                      ...slideDraft,
                      title: e.target.value,
                      badgeText: slideDraft.badgeText
                        ? e.target.value
                        : undefined,
                    })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Linked Channel
                </label>
                <select
                  value={slideDraft.channelId}
                  onChange={(e) =>
                    setSlideDraft({ ...slideDraft, channelId: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Preset Photo Backdrop
                </label>
                <select
                  value={
                    !slideDraft.imagePath.trim()
                      ? 'none'
                      : BACKDROP_OPTIONS.some((o) => o.value === slideDraft.imagePath)
                      ? slideDraft.imagePath
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'none') {
                      setSlideDraft({ ...slideDraft, imagePath: '' });
                    } else if (e.target.value !== 'custom') {
                      setSlideDraft({ ...slideDraft, imagePath: e.target.value });
                    }
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  <option value="none">No Photo (Gradient Backdrop)</option>
                  {BACKDROP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {slideDraft.imagePath.trim() &&
                    !BACKDROP_OPTIONS.some(
                      (o) => o.value === slideDraft.imagePath
                    ) && <option value="custom">Custom Uploaded / URL Photo</option>}
                </select>
              </div>
            </div>

            {/* Photo Slide URL & Local Upload */}
            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#e4e2ec] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                  {slideDraft.mediaMode === 'video'
                    ? 'Poster / Fallback Photo'
                    : 'Slide Photo Source'}
                </span>
                <div className="flex items-center gap-2">
                  {slideDraft.imagePath.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setSlideDraft({ ...slideDraft, imagePath: '' });
                        showNotice('Slide photo removed. Save Home Spotlight to apply.');
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#2a151b] hover:bg-[#3f1a24] text-xs font-semibold text-[#ff9aa9] flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Photo
                    </button>
                  )}
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSlidePhotoUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AutoImagePreview
                  src={slideDraft.imagePath}
                  alt={slideDraft.title || 'Slide photo preview'}
                  fallbackLabel="No photo"
                  allowExpand
                  onStatusChange={setSlidePhotoStatus}
                  className="w-24 h-14 rounded-lg border border-white/15 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={
                      slideDraft.imagePath.startsWith('data:')
                        ? ''
                        : slideDraft.imagePath
                    }
                    onChange={(e) =>
                      setSlideDraft({ ...slideDraft, imagePath: e.target.value })
                    }
                    placeholder={
                      slideDraft.imagePath.startsWith('data:')
                        ? 'Uploaded local photo active (or paste a new image URL)'
                        : 'Or paste custom photo URL (https://...)'
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                  {slideDraft.imagePath.trim() && (
                    <p
                      className={`text-[11px] ${
                        slidePhotoStatus === 'error'
                          ? 'text-red-300'
                          : slidePhotoStatus === 'loaded'
                            ? 'text-[#ffd21f]'
                            : 'text-[#a5a3b2]'
                      }`}
                    >
                      {slidePhotoStatus === 'loading'
                        ? 'Loading active slide image preview...'
                        : slidePhotoStatus === 'loaded'
                          ? 'Live image preview ready · Tap thumbnail to enlarge'
                          : slidePhotoStatus === 'error'
                            ? 'Could not load image from this URL — check link or upload file'
                            : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Active Stream / Video Slide Configuration */}
            {(slideDraft.mediaMode === 'video' || slideDraft.useChannelStream) && (
              <div className="p-3 rounded-xl bg-[#1d1d26] border border-[#ffd21f]/25 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2.5 text-xs font-semibold text-[#f5f4f8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(slideDraft.useChannelStream)}
                      onChange={(e) =>
                        setSlideDraft({
                          ...slideDraft,
                          mediaMode: 'video',
                          useChannelStream: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                    />
                    Auto-play linked channel&apos;s active stream URL
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setSlideDraft({
                        ...slideDraft,
                        mediaMode: 'photo',
                        useChannelStream: false,
                        streamUrl: '',
                      });
                      showNotice('Slide video stream removed. Save Home Spotlight to apply.');
                    }}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#2a151b] hover:bg-[#3f1a24] text-xs font-semibold text-[#ff9aa9] flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Video
                  </button>
                </div>

                {slideDraft.useChannelStream ? (
                  <p className="text-[11px] text-[#a5a3b2]">
                    Mirrors the linked channel&apos;s active broadcast automatically while keeping the source URL hidden.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[11px] text-[#a5a3b2]">
                          Dedicated Slide Stream URL (Masked)
                        </label>
                        <button
                          type="button"
                          onClick={() => setRevealSlideUrl((prev) => !prev)}
                          className="text-[11px] text-[#ffd21f] hover:underline inline-flex items-center gap-1"
                        >
                          {revealSlideUrl ? (
                            <>
                              <EyeOff className="w-3 h-3" />
                              Hide
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              Reveal
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        type={revealSlideUrl ? 'text' : 'password'}
                        autoComplete="off"
                        value={slideDraft.streamUrl || ''}
                        onChange={(e) =>
                          setSlideDraft({
                            ...slideDraft,
                            streamUrl: e.target.value,
                          })
                        }
                        placeholder="Paste slide video or embed URL"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#a5a3b2] mb-1">
                        Stream Mode
                      </label>
                      <select
                        value={slideDraft.streamType || 'auto'}
                        onChange={(e) =>
                          setSlideDraft({
                            ...slideDraft,
                            streamType: e.target.value as StreamFormat,
                          })
                        }
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8]"
                      >
                        {STREAM_FORMAT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-[#a5a3b2] mb-1">
                Subtitle
              </label>
              <input
                type="text"
                value={slideDraft.subtitle}
                onChange={(e) =>
                  setSlideDraft({ ...slideDraft, subtitle: e.target.value })
                }
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#f5f4f8]">
                Home Promotional Card (Hero Promo)
              </h3>
              <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                <input
                  type="checkbox"
                  checked={promoDraft.enabled}
                  onChange={(e) =>
                    setPromoDraft({ ...promoDraft, enabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#ffd21f]"
                />
                Visible on Home
              </label>
            </div>

            {/* Promo Media Mode Toggle */}
            <div>
              <label className="block text-xs text-[#a5a3b2] mb-1.5">
                Promo Media Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPromoDraft({
                      ...promoDraft,
                      mediaMode: 'photo',
                      useChannelStream: false,
                    })
                  }
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors ${
                    promoDraft.mediaMode !== 'video' && !promoDraft.useChannelStream
                      ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                      : 'bg-[#1d1d26] text-[#c9c7d2] border-white/[0.08] hover:bg-[#262631]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Photo / Backdrop
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPromoDraft({
                      ...promoDraft,
                      mediaMode: 'video',
                      useChannelStream:
                        promoDraft.useChannelStream ?? !promoDraft.streamUrl,
                      autoplayStream: promoDraft.autoplayStream ?? true,
                    })
                  }
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors ${
                    promoDraft.mediaMode === 'video' || promoDraft.useChannelStream
                      ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                      : 'bg-[#1d1d26] text-[#c9c7d2] border-white/[0.08] hover:bg-[#262631]'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  Active Stream / Video
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Emblem Text
                </label>
                <input
                  type="text"
                  value={promoDraft.badgeText}
                  onChange={(e) =>
                    setPromoDraft({ ...promoDraft, badgeText: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Heading
                </label>
                <input
                  type="text"
                  value={promoDraft.heading}
                  onChange={(e) =>
                    setPromoDraft({ ...promoDraft, heading: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Linked Channel
                </label>
                <select
                  value={promoDraft.channelId || channels[0]?.id || ''}
                  onChange={(e) =>
                    setPromoDraft({ ...promoDraft, channelId: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Preset Promo Photo
                </label>
                <select
                  value={
                    !promoDraft.imagePath?.trim()
                      ? 'none'
                      : BACKDROP_OPTIONS.some((o) => o.value === promoDraft.imagePath)
                      ? promoDraft.imagePath
                      : 'custom'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'none') {
                      setPromoDraft({ ...promoDraft, imagePath: '' });
                    } else if (e.target.value !== 'custom') {
                      setPromoDraft({ ...promoDraft, imagePath: e.target.value });
                    }
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  <option value="none">No Photo (Gradient Backdrop)</option>
                  {BACKDROP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                  {promoDraft.imagePath?.trim() &&
                    !BACKDROP_OPTIONS.some(
                      (o) => o.value === promoDraft.imagePath
                    ) && <option value="custom">Custom Uploaded / URL Photo</option>}
                </select>
              </div>
            </div>

            {/* Promo Photo Source & Delete Photo */}
            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#e4e2ec] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                  {promoDraft.mediaMode === 'video'
                    ? 'Promo Poster / Fallback Photo'
                    : 'Hero Promo Photo'}
                </span>
                <div className="flex items-center gap-2">
                  {promoDraft.imagePath?.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setPromoDraft({ ...promoDraft, imagePath: '' });
                        showNotice('Hero promo photo removed. Save Home Spotlight to apply.');
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#2a151b] hover:bg-[#3f1a24] text-xs font-semibold text-[#ff9aa9] flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Photo
                    </button>
                  )}
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePromoPhotoUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AutoImagePreview
                  src={promoDraft.imagePath}
                  alt={promoDraft.heading || 'Hero promo preview'}
                  fallbackLabel="No photo"
                  allowExpand
                  onStatusChange={setPromoPhotoStatus}
                  className="w-24 h-14 rounded-lg border border-white/15 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={
                      promoDraft.imagePath?.startsWith('data:')
                        ? ''
                        : promoDraft.imagePath || ''
                    }
                    onChange={(e) =>
                      setPromoDraft({ ...promoDraft, imagePath: e.target.value })
                    }
                    placeholder={
                      promoDraft.imagePath?.startsWith('data:')
                        ? 'Uploaded local photo active (or paste a new image URL)'
                        : 'Or paste custom promo photo URL (https://...)'
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                  {promoDraft.imagePath?.trim() && (
                    <p
                      className={`text-[11px] ${
                        promoPhotoStatus === 'error'
                          ? 'text-red-300'
                          : promoPhotoStatus === 'loaded'
                            ? 'text-[#ffd21f]'
                            : 'text-[#a5a3b2]'
                      }`}
                    >
                      {promoPhotoStatus === 'loading'
                        ? 'Loading active promo image preview...'
                        : promoPhotoStatus === 'loaded'
                          ? 'Live promo preview ready · Tap thumbnail to enlarge'
                          : promoPhotoStatus === 'error'
                            ? 'Could not load image from this URL — check link or upload file'
                            : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Promo Active Stream / Video Configuration */}
            {(promoDraft.mediaMode === 'video' || promoDraft.useChannelStream) && (
              <div className="p-3 rounded-xl bg-[#1d1d26] border border-[#ffd21f]/25 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" />
                    Promo Active Stream Playback
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPromoDraft({
                        ...promoDraft,
                        mediaMode: 'photo',
                        useChannelStream: false,
                        streamUrl: '',
                      });
                      showNotice('Hero promo video stream removed. Save Home Spotlight to apply.');
                    }}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#2a151b] hover:bg-[#3f1a24] text-xs font-semibold text-[#ff9aa9] flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Video
                  </button>
                </div>

                <label className="flex items-center gap-2.5 text-xs font-semibold text-[#f5f4f8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={promoDraft.autoplayStream !== false}
                    onChange={(e) =>
                      setPromoDraft({
                        ...promoDraft,
                        autoplayStream: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                  />
                  Automatically play active stream when Home opens
                </label>

                <label className="flex items-center gap-2.5 text-xs font-semibold text-[#f5f4f8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(promoDraft.useChannelStream)}
                    onChange={(e) =>
                      setPromoDraft({
                        ...promoDraft,
                        mediaMode: 'video',
                        useChannelStream: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                  />
                  Auto-play linked channel&apos;s active stream URL
                </label>

                {promoDraft.useChannelStream ? (
                  <p className="text-[11px] text-[#a5a3b2]">
                    Mirrors the linked channel&apos;s active stream inside the Hero Promo card while keeping source URLs hidden from viewers.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[11px] text-[#a5a3b2]">
                          Promo Active Stream URL (Masked)
                        </label>
                        <button
                          type="button"
                          onClick={() => setRevealPromoUrl((prev) => !prev)}
                          className="text-[11px] text-[#ffd21f] hover:underline inline-flex items-center gap-1"
                        >
                          {revealPromoUrl ? (
                            <>
                              <EyeOff className="w-3 h-3" />
                              Hide
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3" />
                              Reveal
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        type={revealPromoUrl ? 'text' : 'password'}
                        autoComplete="off"
                        value={promoDraft.streamUrl || ''}
                        onChange={(e) =>
                          setPromoDraft({
                            ...promoDraft,
                            streamUrl: e.target.value,
                          })
                        }
                        placeholder="Paste HLS, MP4, YouTube, Vimeo, or embed stream URL"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#a5a3b2] mb-1">
                        Stream Mode
                      </label>
                      <select
                        value={promoDraft.streamType || 'auto'}
                        onChange={(e) =>
                          setPromoDraft({
                            ...promoDraft,
                            streamType: e.target.value as StreamFormat,
                          })
                        }
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8]"
                      >
                        {STREAM_FORMAT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-[#a5a3b2] mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={promoDraft.description}
                onChange={(e) =>
                  setPromoDraft({ ...promoDraft, description: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Home Spotlight
            </button>
          </div>
        </form>
      )}

      {/* 4. MOVIES & SERIES */}
      {section === 'movies' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSaveMovie}
            className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                <Clapperboard className="w-4 h-4 text-[#ffd21f]" />
                {editingMovieId
                  ? 'Edit movie or series'
                  : 'Publish movie, series, or Bunyoro film'}
              </h3>
              {editingMovieId && (
                <button
                  type="button"
                  onClick={resetMovieForm}
                  className="text-xs text-[#ffd21f] hover:underline"
                >
                  Cancel editing
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={movieTitle}
                onChange={(e) => setMovieTitle(e.target.value)}
                placeholder="Movie or series title"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
              <select
                value={movieFormat}
                onChange={(e) => {
                  const next = e.target.value as MovieFormat;
                  setMovieFormat(next);
                  if (next === 'series') {
                    setMovieGenre('Series');
                  }
                }}
                aria-label="Format"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                <option value="movie">Movie</option>
                <option value="series">Series</option>
              </select>
              <select
                value={movieGenre}
                onChange={(e) => setMovieGenre(e.target.value as MovieGenre)}
                aria-label="Genre"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                {MOVIE_GENRES.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
              <select
                value={movieChannelId}
                onChange={(e) => setMovieChannelId(e.target.value)}
                aria-label="Linked channel"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={movieYear}
                onChange={(e) => setMovieYear(e.target.value)}
                placeholder="Release year (e.g. 2025)"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
              <input
                type="text"
                value={movieDuration}
                onChange={(e) => setMovieDuration(e.target.value)}
                placeholder="Duration (e.g. 1h 48m or Season 1 · 10 Episodes)"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
            </div>

            {/* Poster Photo Controls */}
            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#e4e2ec] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                  Movie Poster Image (Auto-Detect / Cutout / Upload)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={
                      movieAutoDetecting ||
                      (!movieStreamUrl.trim() && !movieLocalVideoUrl)
                    }
                    onClick={() =>
                      void runMovieThumbnailAutoDetect(
                        movieLocalVideoUrl || movieStreamUrl,
                        true
                      )
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] disabled:opacity-45 text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5 transition-colors"
                  >
                    {movieAutoDetecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    Auto-detect
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoutTarget('movie')}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 transition-colors"
                  >
                    <Scissors className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Cutout / Frame
                  </button>
                  {moviePoster.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        moviePosterManualRef.current = false;
                        setMoviePoster('');
                        setMovieAutoDetectNote(null);
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#2a151b] hover:bg-[#3f1a24] text-xs font-semibold text-[#ff9aa9] flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Upload Poster
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMoviePosterUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AutoImagePreview
                  src={moviePoster}
                  alt={movieTitle.trim() || 'Movie poster preview'}
                  fallbackLabel="Auto art"
                  allowExpand
                  onStatusChange={setMoviePosterStatus}
                  className="w-16 h-24 rounded-lg border border-white/15 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    type="text"
                    value={moviePoster.startsWith('data:') ? '' : moviePoster}
                    onChange={(e) => {
                      const val = e.target.value;
                      moviePosterManualRef.current = Boolean(val.trim());
                      setMovieAutoDetectNote(null);
                      setMoviePoster(val);
                    }}
                    placeholder={
                      moviePoster.startsWith('data:')
                        ? 'Cutout / uploaded poster image active (or paste a new URL)'
                        : 'Or paste poster URL (https://...)'
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                  <p
                    className={`text-[11px] leading-snug ${
                      moviePosterStatus === 'error'
                        ? 'text-red-300'
                        : moviePosterStatus === 'loaded' || movieAutoDetectNote
                          ? 'text-[#ffd21f]'
                          : 'text-[#8d8b9b]'
                    }`}
                  >
                    {movieAutoDetecting
                      ? 'Detecting thumbnail from video URL...'
                      : movieAutoDetectNote
                        ? movieAutoDetectNote
                        : !moviePoster.trim()
                          ? 'Paste a movie video URL or upload a video below to auto-detect or cut out a 2:3 poster frame.'
                          : moviePosterStatus === 'loading'
                            ? 'Loading active poster URL preview...'
                            : moviePosterStatus === 'loaded'
                              ? 'Active poster preview ready · Tap thumbnail to enlarge or Cutout / Frame to crop'
                              : 'Image URL could not be loaded — check link or use Cutout / Frame'}
                  </p>
                </div>
              </div>
            </div>

            {/* Masked Stream URL & Direct Cloud Upload */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#c9c7d2]">
                  Movie Video Source URL or Direct Cloud Upload
                </span>
                <label className="min-h-[32px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                  {uploadingMovieVideo ? 'Uploading...' : 'Upload Video'}
                  <input
                    type="file"
                    accept="video/*"
                    disabled={uploadingMovieVideo}
                    onChange={(e) => void handleMovieVideoUpload(e)}
                    className="sr-only"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 relative">
                  <input
                    type={revealMovieUrl ? 'text' : 'password'}
                    autoComplete="off"
                    value={movieStreamUrl}
                    onChange={(e) => setMovieStreamUrl(e.target.value)}
                    placeholder="Masked movie video or embed URL (HLS, MP4, YouTube, Vimeo...)"
                    className="w-full min-h-[42px] pl-3 pr-10 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealMovieUrl((prev) => !prev)}
                    aria-label={revealMovieUrl ? 'Hide URL' : 'Reveal URL'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#a5a3b2] hover:text-[#ffd21f]"
                  >
                    {revealMovieUrl ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <select
                  value={movieStreamType}
                  onChange={(e) =>
                    setMovieStreamType(e.target.value as StreamFormat)
                  }
                  aria-label="Movie stream mode"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  {STREAM_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <textarea
              rows={2}
              value={movieDescription}
              onChange={(e) => setMovieDescription(e.target.value)}
              placeholder="Short synopsis or cast description"
              className="w-full px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                <input
                  type="checkbox"
                  checked={movieFeatured}
                  onChange={(e) => setMovieFeatured(e.target.checked)}
                  className="w-4 h-4 accent-[#ffd21f]"
                />
                Feature in Movies spotlight row
              </label>

              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {editingMovieId ? 'Update title' : 'Publish title'}
              </button>
            </div>
          </form>

          {/* Existing Movies & Series Catalog */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[#c9c7d2]">
                Published Movies &amp; Series ({movies.length})
              </p>
              <select
                value={movieListFilter}
                onChange={(e) =>
                  setMovieListFilter(e.target.value as 'All' | MovieGenre)
                }
                aria-label="Filter published movies"
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8]"
              >
                <option value="All">All Genres</option>
                {MOVIE_GENRES.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </div>

            {movies
              .filter((m) =>
                movieListFilter === 'All' ? true : m.genre === movieListFilter
              )
              .map((movie) => (
                <div
                  key={movie.id}
                  className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <AutoImagePreview
                      src={movie.posterPath}
                      alt={movie.title}
                      fallbackLabel="Auto art"
                      allowExpand
                      className="w-10 h-14 rounded-lg border border-white/10 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                        {movie.title}
                      </p>
                      <p className="text-xs text-[#a5a3b2] truncate">
                        {movie.format === 'series' ? 'Series' : 'Movie'} ·{' '}
                        {movie.genre} · {movie.year} · {movie.duration}
                        {movie.streamUrl ? ' · Stream linked' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onPreviewMovie && (
                      <button
                        type="button"
                        onClick={() => onPreviewMovie(movie)}
                        aria-label={`Play ${movie.title}`}
                        className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#ffd21f] hover:bg-[#ffd21f]/10 transition-colors"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditMovie(movie)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteMovie(movie.id);
                        if (editingMovieId === movie.id) resetMovieForm();
                        showNotice(`Removed "${movie.title}".`);
                      }}
                      aria-label={`Remove ${movie.title}`}
                      className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 5. ARCHIVE & PODCASTS */}
      {section === 'archive' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddArchive}
            className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#ffd21f]" />
                {editingArchiveId
                  ? 'Edit catch-up or podcast episode'
                  : 'Publish catch-up or podcast episode'}
              </h3>
              {editingArchiveId && (
                <button
                  type="button"
                  onClick={resetArchiveForm}
                  className="text-xs font-semibold text-[#a5a3b2] hover:text-[#f5f4f8]"
                >
                  Cancel edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={arcTitle}
                onChange={(e) => setArcTitle(e.target.value)}
                placeholder="Episode title"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
              <select
                value={arcCategory}
                onChange={(e) =>
                  setArcCategory(e.target.value as 'archive' | 'podcast')
                }
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                <option value="archive">TV Archive</option>
                <option value="podcast">Podcasts</option>
              </select>
              <select
                value={arcChannelId}
                onChange={(e) => setArcChannelId(e.target.value)}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={arcDuration}
                onChange={(e) => setArcDuration(e.target.value)}
                placeholder="Duration (e.g. 42m)"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
            </div>
            {/* Archive / Podcast Thumbnail Controls (Auto-detect / Cutout / Upload) */}
            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#e4e2ec] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                  Program Thumbnail (Auto-Detect / Cutout / Upload)
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={
                      arcAutoDetecting ||
                      (!arcMediaUrl.trim() && !arcLocalVideoUrl)
                    }
                    onClick={() =>
                      void runArchiveThumbnailAutoDetect(
                        arcLocalVideoUrl || arcMediaUrl,
                        true
                      )
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] disabled:opacity-45 text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5 transition-colors"
                  >
                    {arcAutoDetecting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    Auto-detect
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoutTarget('archive')}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 transition-colors"
                  >
                    <Scissors className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Cutout / Frame
                  </button>
                  {arcThumbnail.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        arcThumbnailManualRef.current = false;
                        setArcThumbnail('');
                        setArcAutoDetectNote(null);
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#2a151b] hover:bg-[#3f1a24] text-xs font-semibold text-[#ff9aa9] flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleArchiveThumbnailUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AutoImagePreview
                  src={arcThumbnail}
                  alt={arcTitle.trim() || 'Program thumbnail preview'}
                  fallbackLabel="Default art"
                  allowExpand
                  onStatusChange={setArcThumbnailStatus}
                  className="w-24 h-14 rounded-lg border border-white/15 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <input
                    type="text"
                    value={arcThumbnail.startsWith('data:') ? '' : arcThumbnail}
                    onChange={(e) => {
                      const val = e.target.value;
                      arcThumbnailManualRef.current = Boolean(val.trim());
                      setArcAutoDetectNote(null);
                      setArcThumbnail(val);
                    }}
                    placeholder={
                      arcThumbnail.startsWith('data:')
                        ? 'Cutout / uploaded thumbnail active (or paste a new URL)'
                        : 'Or paste thumbnail image URL (https://...)'
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                  <p
                    className={`text-[11px] leading-snug ${
                      arcThumbnailStatus === 'error'
                        ? 'text-red-300'
                        : arcThumbnailStatus === 'loaded' || arcAutoDetectNote
                          ? 'text-[#ffd21f]'
                          : 'text-[#8d8b9b]'
                    }`}
                  >
                    {arcAutoDetecting
                      ? 'Detecting thumbnail from recording URL...'
                      : arcAutoDetectNote
                        ? arcAutoDetectNote
                        : !arcThumbnail.trim()
                          ? 'Paste a recording URL or upload a video below to auto-detect or cut out a 16:9 thumbnail frame.'
                          : arcThumbnailStatus === 'loading'
                            ? 'Loading thumbnail preview...'
                            : arcThumbnailStatus === 'loaded'
                              ? 'Active thumbnail preview ready · Tap thumbnail to enlarge or Cutout / Frame to crop'
                              : 'Thumbnail URL could not be loaded — check link or use Cutout / Frame'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#c9c7d2]">
                  Recording URL or Direct Cloud Upload
                </span>
                <label className="min-h-[32px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                  {uploadingArchiveMedia ? 'Uploading...' : 'Upload Video / Audio'}
                  <input
                    type="file"
                    accept="video/*,audio/*"
                    disabled={uploadingArchiveMedia}
                    onChange={(e) => void handleArchiveMediaUpload(e)}
                    className="sr-only"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 relative">
                  <input
                    type={revealArcUrl ? 'text' : 'password'}
                    autoComplete="off"
                    value={arcMediaUrl}
                    onChange={(e) => setArcMediaUrl(e.target.value)}
                    placeholder="Masked media or embed URL"
                    className="w-full min-h-[42px] pl-3 pr-10 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealArcUrl((prev) => !prev)}
                    aria-label={revealArcUrl ? 'Hide URL' : 'Reveal URL'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#a5a3b2] hover:text-[#ffd21f]"
                  >
                    {revealArcUrl ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <select
                  value={arcStreamType}
                  onChange={(e) => setArcStreamType(e.target.value as StreamFormat)}
                  aria-label="Episode stream mode"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  {STREAM_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input
              type="text"
              value={arcDescription}
              onChange={(e) => setArcDescription(e.target.value)}
              placeholder="Short summary"
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {editingArchiveId ? 'Update item' : 'Publish item'}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {archiveItems.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <AutoImagePreview
                    src={item.thumbnailPath}
                    alt={item.title}
                    fallbackLabel="No art"
                    allowExpand
                    className="w-16 h-10 rounded-lg border border-white/10 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-[#a5a3b2] truncate">
                      {item.category === 'archive' ? 'TV Archive' : 'Podcast'} ·{' '}
                      {item.channelName} · {item.duration}
                      {item.mediaUrl ? ' · Media linked' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onPreviewArchiveItem && (
                    <button
                      type="button"
                      onClick={() => onPreviewArchiveItem(item)}
                      aria-label={`Play ${item.title}`}
                      className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#ffd21f] hover:bg-[#ffd21f]/10 transition-colors"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEditArchive(item)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteArchiveItem(item.id);
                      if (editingArchiveId === item.id) resetArchiveForm();
                      showNotice(`Removed "${item.title}".`);
                    }}
                    aria-label={`Remove ${item.title}`}
                    className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10 shrink-0 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5a2. WRITTEN BREAKING NEWS */}
      {section === 'news' && (
        <div className="space-y-5">
          <form
            onSubmit={(e) => void handleSaveNewsArticle(e)}
            className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#ffd21f]" />
                {editingNewsId
                  ? 'Edit Written News Article'
                  : 'Write & Publish Breaking News'}
              </h3>
              {editingNewsId && (
                <button
                  type="button"
                  onClick={resetNewsForm}
                  className="text-xs text-[#a5a3b2] hover:text-[#f5f4f8]"
                >
                  Cancel edit
                </button>
              )}
            </div>

            <input
              type="text"
              value={newsHeadline}
              onChange={(e) => setNewsHeadline(e.target.value)}
              placeholder="Headline (e.g. Kakumiro District Launches Phase II Road Upgrade)"
              maxLength={180}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={newsCategory}
                onChange={(e) => setNewsCategory(e.target.value as NewsCategory)}
                aria-label="News category"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                {NEWS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={newsAuthor}
                onChange={(e) => setNewsAuthor(e.target.value)}
                placeholder="Author / Reporter"
                maxLength={80}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />

              <select
                value={newsChannelId}
                onChange={(e) => setNewsChannelId(e.target.value)}
                aria-label="Related live channel"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                <option value="">No linked TV/Radio channel</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#c9c7d2] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                  Article Cover Photo (Optional)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {newsImageUrl && (
                    <button
                      type="button"
                      onClick={() => setNewsImageUrl('')}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-red-500/20 text-xs font-semibold text-[#c9c7d2] hover:text-red-300"
                    >
                      Clear
                    </button>
                  )}
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleNewsImageUpload(e)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AutoImagePreview
                  src={newsImageUrl}
                  alt={newsHeadline.trim() || 'News photo preview'}
                  fallbackLabel="No photo"
                  allowExpand
                  onStatusChange={setNewsImageStatus}
                  className="w-24 h-14 rounded-lg border border-white/15 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={newsImageUrl.startsWith('data:') ? '' : newsImageUrl}
                    onChange={(e) => setNewsImageUrl(e.target.value)}
                    placeholder={
                      newsImageUrl.startsWith('data:')
                        ? 'Uploaded photo attached (or paste image URL)'
                        : 'Or paste image URL (https://...)'
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                  {newsImageStatus === 'error' && newsImageUrl.trim() && (
                    <p className="text-[11px] text-red-300">
                      Cover image URL could not be loaded.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <textarea
              rows={2}
              value={newsSummary}
              onChange={(e) => setNewsSummary(e.target.value)}
              placeholder="Short summary / lead paragraph shown on news cards (optional — auto-filled from body if blank)"
              maxLength={400}
              className="w-full px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
            />

            <textarea
              rows={6}
              value={newsBody}
              onChange={(e) => setNewsBody(e.target.value)}
              placeholder="Write the full breaking news report here. Separate paragraphs with a blank line."
              maxLength={20000}
              className="w-full px-3 py-2.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d] leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newsFeatured}
                    onChange={(e) => setNewsFeatured(e.target.checked)}
                    className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                  />
                  Feature as lead story
                </label>

                {!editingNewsId && onPublishBroadcastAlert && (
                  <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newsAlsoPush}
                      onChange={(e) => setNewsAlsoPush(e.target.checked)}
                      className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                    />
                    Also send push alert notification
                  </label>
                )}
              </div>

              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {editingNewsId ? 'Update Article' : 'Publish Written Article'}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {newsArticles.map((article) => (
              <div
                key={article.id}
                className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <AutoImagePreview
                    src={article.imageUrl}
                    alt={article.headline}
                    fallbackLabel="Text"
                    allowExpand
                    className="w-16 h-10 rounded-lg border border-white/10 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                      {article.headline}
                    </p>
                    <p className="text-xs text-[#a5a3b2] truncate">
                      {article.category} · {article.author} · {article.publishedAt}
                      {article.featured ? ' · Featured' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEditNews(article)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] transition-colors"
                  >
                    Edit
                  </button>
                  {onDeleteNewsArticle && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteNewsArticle(article.id);
                        if (editingNewsId === article.id) resetNewsForm();
                        showNotice(`Deleted "${article.headline}".`);
                      }}
                      aria-label={`Delete ${article.headline}`}
                      className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10 shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5a3. FEATURED ARTISTS */}
      {section === 'artists' && (
        <div className="space-y-5">
          <form
            onSubmit={handleSaveArtist}
            className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                <Mic2 className="w-4 h-4 text-[#ffd21f]" />
                {editingArtistId
                  ? 'Edit Artist Profile'
                  : 'Add Artist to More → Artists'}
              </h3>
              {editingArtistId && (
                <button
                  type="button"
                  onClick={resetArtistForm}
                  className="text-xs text-[#a5a3b2] hover:text-[#f5f4f8]"
                >
                  Cancel edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="Artist / Group name (e.g. Luke Remete)"
                maxLength={100}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />
              <select
                value={artistGenre}
                onChange={(e) => setArtistGenre(e.target.value as ArtistGenre)}
                aria-label="Artist genre"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              >
                {ARTIST_GENRES.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={artistOrigin}
                onChange={(e) => setArtistOrigin(e.target.value)}
                placeholder="Origin / City (e.g. Kakumiro, Bunyoro)"
                maxLength={100}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />
              <input
                type="text"
                value={artistRelease}
                onChange={(e) => setArtistRelease(e.target.value)}
                placeholder="Latest song / album / session title"
                maxLength={140}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={artistMediaUrl}
                onChange={(e) => setArtistMediaUrl(e.target.value)}
                placeholder="Optional music video or audio stream URL"
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={artistStreamType}
                  onChange={(e) =>
                    setArtistStreamType(e.target.value as StreamFormat)
                  }
                  aria-label="Artist media format"
                  className="min-h-[42px] px-2.5 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  {STREAM_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={artistChannelId}
                  onChange={(e) => setArtistChannelId(e.target.value)}
                  aria-label="Linked TV or Radio channel"
                  className="min-h-[42px] px-2.5 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  <option value="">Default station</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#c9c7d2] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                  Artist Portrait / Cover Photo
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {artistPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => setArtistPhotoUrl('')}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-red-500/20 text-xs font-semibold text-[#c9c7d2] hover:text-red-300"
                    >
                      Clear
                    </button>
                  )}
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleArtistPhotoUpload(e)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AutoImagePreview
                  src={artistPhotoUrl}
                  alt={artistName.trim() || 'Artist photo preview'}
                  fallbackLabel="No photo"
                  allowExpand
                  onStatusChange={setArtistPhotoStatus}
                  className="w-20 h-14 rounded-lg border border-white/15 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    type="text"
                    value={artistPhotoUrl.startsWith('data:') ? '' : artistPhotoUrl}
                    onChange={(e) => setArtistPhotoUrl(e.target.value)}
                    placeholder={
                      artistPhotoUrl.startsWith('data:')
                        ? 'Uploaded photo attached (or paste image URL)'
                        : 'Or paste image URL (https://...)'
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                  {artistPhotoStatus === 'error' && artistPhotoUrl.trim() && (
                    <p className="text-[11px] text-red-300">
                      Artist photo URL could not be loaded.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <textarea
              rows={3}
              value={artistBio}
              onChange={(e) => setArtistBio(e.target.value)}
              placeholder="Short artist biography, musical style, and broadcast highlights..."
              maxLength={2000}
              className="w-full px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-[#e4e2ec] cursor-pointer">
                <input
                  type="checkbox"
                  checked={artistFeatured}
                  onChange={(e) => setArtistFeatured(e.target.checked)}
                  className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                />
                Feature in Artists Spotlight
              </label>

              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {editingArtistId ? 'Update Artist' : 'Publish Artist'}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {artists.map((artist) => (
              <div
                key={artist.id}
                className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <AutoImagePreview
                    src={artist.photoUrl}
                    alt={artist.name}
                    fallbackLabel="Artist"
                    allowExpand
                    className="w-12 h-12 rounded-lg border border-white/10 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                      {artist.name}
                    </p>
                    <p className="text-xs text-[#a5a3b2] truncate">
                      {artist.stageGenre} · {artist.origin} · {artist.latestRelease}
                      {artist.featured ? ' · Featured' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onPreviewArtist && (
                    <button
                      type="button"
                      onClick={() => onPreviewArtist(artist)}
                      aria-label={`Play ${artist.name}`}
                      className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg bg-[#262631] hover:bg-[#323240] text-[#ffd21f] transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEditArtist(artist)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] transition-colors"
                  >
                    Edit
                  </button>
                  {onDeleteArtist && (
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteArtist(artist.id);
                        if (editingArtistId === artist.id) resetArtistForm();
                        showNotice(`Removed "${artist.name}".`);
                      }}
                      aria-label={`Delete ${artist.name}`}
                      className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10 shrink-0 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5b. MEDIA LIBRARY */}
      {section === 'library' && (
        <AdminMediaLibraryTab
          channels={channels}
          guideSchedule={guideSchedule}
          movies={movies}
          archiveItems={archiveItems}
          homeConfig={homeConfig}
          firebaseConnected={Boolean(auth.currentUser?.emailVerified)}
          onPreviewChannel={onPreviewChannel}
          onPreviewMovie={onPreviewMovie}
          onPreviewArchiveItem={onPreviewArchiveItem}
          onJumpToChannel={(chId) => {
            setSelectedChannelId(chId);
            setSection('channels');
          }}
          onJumpToGuide={(chId) => {
            const ch = channels.find((c) => c.id === chId);
            if (ch) startEditGuide(ch);
            setSection('guide');
          }}
          onJumpToMovie={(mov) => {
            startEditMovie(mov);
            setSection('movies');
          }}
          onJumpToArchive={(item) => {
            startEditArchive(item);
            setSection('archive');
          }}
          onUpdateMovie={onUpdateMovie}
          onUpdateArchiveItem={onUpdateArchiveItem}
          onUpdateHomeConfig={onUpdateHomeConfig}
          onSyncToCloud={onSyncToCloud}
          onDeleteChannel={onDeleteChannel}
          onDeleteMovie={onDeleteMovie}
          onDeleteArchiveItem={onDeleteArchiveItem}
          onNotice={showNotice}
        />
      )}

      {/* 5c. CLOUD STORAGE */}
      {section === 'storage' && (
        <AdminCloudStorageTab
          cloudFiles={cloudFiles}
          onAttachUrlToChannel={(url, cat) => {
            setEditForm((prev) => ({
              ...prev,
              streamUrl: url,
              streamType: cat === 'audio' ? 'audio' : 'media',
            }));
            setSection('channels');
            showNotice(
              `Attached cloud file to "${editForm.name}". Click Save Stream & Metadata to apply.`
            );
          }}
          onAttachUrlToMovie={(url, cat) => {
            if (cat === 'image') {
              setMoviePoster(url);
              showNotice('Attached cloud image as Movie Poster.');
            } else {
              setMovieStreamUrl(url);
              setMovieStreamType('media');
              showNotice('Attached cloud video to Movie form.');
            }
            setSection('movies');
          }}
          onAttachUrlToArchive={(url, cat) => {
            setArcMediaUrl(url);
            setArcStreamType(cat === 'audio' ? 'audio' : 'media');
            setSection('archive');
            showNotice('Attached cloud media to Archive / Podcast form.');
          }}
          onNotice={showNotice}
        />
      )}

      {/* 5d. BACKUPS & RESTORE */}
      {section === 'backups' && (
        <AdminBackupsTab
          backups={cloudBackups}
          channels={channels}
          guideSchedule={guideSchedule}
          heroSlides={heroSlides}
          movies={movies}
          archiveItems={archiveItems}
          promo={promo}
          appConfig={appConfig}
          homeConfig={homeConfig}
          broadcastAlerts={broadcastAlerts}
          onApplyRestoredCatalog={(payload) => {
            if (onApplyRestoredCatalog) {
              onApplyRestoredCatalog(payload);
            }
          }}
          onNotice={showNotice}
        />
      )}

      {/* 5e. USERS & ADMINS */}
      {section === 'users' && <AdminUsersTab onNotice={showNotice} />}

      {/* 6. LIVE ALERTS & CLOUD SERVER */}
      {section === 'alerts' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#ffd21f]" />
                Firebase &amp; Cloud Backend Diagnostics
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {onSyncToCloud && (
                  <button
                    type="button"
                    onClick={() => void handleSyncCatalogNow()}
                    disabled={syncingToCloud}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[#ffd21f] hover:bg-[#ffe055] text-xs font-bold text-[#101016] flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    {syncingToCloud ? 'Syncing...' : 'Sync Catalog to Firebase'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void loadCloudStatus()}
                  disabled={loadingServerStatus}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#f5f4f8] whitespace-nowrap disabled:opacity-60"
                >
                  {loadingServerStatus ? 'Checking...' : 'Run Firebase Check'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06]">
                <p className="text-[#a5a3b2]">Cloud Firestore Database</p>
                <p
                  className={`font-semibold mt-1 ${
                    firebaseHealth
                      ? firebaseHealth.firestoreConnected
                        ? 'text-[#ffd21f]'
                        : 'text-red-300'
                      : 'text-[#f5f4f8]'
                  }`}
                >
                  {loadingServerStatus && !firebaseHealth
                    ? 'Probing Firestore...'
                    : firebaseHealth
                      ? firebaseHealth.firestoreConnected
                        ? 'Connected · Read/Write live'
                        : 'Offline / Unreachable'
                      : 'Pending check'}
                </p>
                {firebaseHealth && (
                  <p className="text-[11px] text-[#a5a3b2] font-mono-tabular mt-0.5 truncate">
                    {firebaseHealth.projectId} ({firebaseHealth.databaseId})
                  </p>
                )}
              </div>

              <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06]">
                <p className="text-[#a5a3b2]">Public Broadcast Catalog</p>
                <p
                  className={`font-semibold mt-1 ${
                    firebaseHealth
                      ? firebaseHealth.catalogReadable
                        ? 'text-[#ffd21f]'
                        : 'text-red-300'
                      : 'text-[#f5f4f8]'
                  }`}
                >
                  {firebaseHealth
                    ? firebaseHealth.catalogReadable
                      ? 'Readable by viewers & guests'
                      : 'Catalog read failed'
                    : 'Checking catalog...'}
                </p>
                <p className="text-[11px] text-[#a5a3b2] mt-0.5">
                  RTDB Live Viewers:{' '}
                  <span className="text-[#f5f4f8] font-semibold">
                    {firebaseHealth
                      ? firebaseHealth.rtdbConnected
                        ? 'Connected'
                        : 'Unavailable'
                      : 'Checking'}
                  </span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06]">
                <p className="text-[#a5a3b2]">Firebase Auth &amp; Admin</p>
                <p className="text-[#f5f4f8] font-semibold mt-1 truncate">
                  {firebaseHealth?.authEmail
                    ? `${firebaseHealth.authEmail} · ${
                        firebaseHealth.isAdmin ? 'Admin verified' : 'Viewer'
                      }`
                    : 'Not signed in'}
                </p>
                {firebaseHealth?.hostname && (
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-[11px] text-[#a5a3b2] font-mono-tabular truncate">
                      Host: {firebaseHealth.hostname}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyHost()}
                      className="text-[11px] text-[#ffd21f] hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedHost ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06]">
                <p className="text-[#a5a3b2]">Cloud Backend &amp; Android/Web Push</p>
                <p className="text-[#f5f4f8] font-semibold mt-1">
                  {serverStatus?.ok
                    ? `Online · Uptime ${serverStatus.uptimeSec}s`
                    : 'Connected to Cloud Host'}
                </p>
                <p className="text-[11px] text-[#a5a3b2] mt-0.5 font-mono-tabular">
                  {serverStatus?.registeredDevices ?? 0} push devices (
                  {serverStatus?.webPushDevices ?? 0} Web Push ·{' '}
                  {serverStatus?.fcmDevices ?? 0} FCM) ·{' '}
                  {serverStatus?.webPushReady || serverStatus?.fcmServerReady
                    ? 'System push ready'
                    : 'In-app live alerts active'}
                </p>
              </div>

              <div className="sm:col-span-2 p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06]">
                <p className="text-[#a5a3b2]">Firebase Cloud Storage &amp; Vault</p>
                <p
                  className={`font-semibold mt-1 ${
                    firebaseHealth
                      ? firebaseHealth.storageBucketReady
                        ? 'text-[#ffd21f]'
                        : 'text-amber-300'
                      : 'text-[#f5f4f8]'
                  }`}
                >
                  {firebaseHealth
                    ? firebaseHealth.storageBucketReady
                      ? 'Firebase Storage Bucket Online'
                      : 'Firestore Cloud Vault Active (Storage bucket not yet activated in Firebase Console)'
                    : 'Checking Cloud Storage bucket...'}
                </p>
                {firebaseHealth?.storageBucket && (
                  <p className="text-[11px] text-[#a5a3b2] font-mono-tabular mt-0.5 truncate">
                    Bucket: {firebaseHealth.storageBucket}
                  </p>
                )}
              </div>
            </div>

            {firebaseHealth?.error && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
                Diagnostic note: {firebaseHealth.error}
              </p>
            )}
          </div>

          {/* Broadcast Alert & FCM Push Composer */}
          <form
            onSubmit={(e) => void handleSendAlert(e)}
            className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3"
          >
            <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#ffd21f]" />
              Send Live Alert &amp; Android System Notification
            </h3>
            <p className="text-xs text-[#a5a3b2]">
              Publishes immediately to all viewers and dispatches Android system tray &amp; closed-app push notifications via Web Push &amp; FCM.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Alert Category
                </label>
                <select
                  value={alertCategory}
                  onChange={(e) =>
                    setAlertCategory(e.target.value as BroadcastAlertCategory)
                  }
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  <option value="news">Breaking News</option>
                  <option value="sports">Live Sports</option>
                  <option value="tvGuide">TV Guide Update</option>
                  <option value="live">Now Streaming Live</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#a5a3b2] mb-1">
                  Deep-Link Channel (Optional)
                </label>
                <select
                  value={alertChannelId}
                  onChange={(e) => setAlertChannelId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
                >
                  <option value="">Open Home Screen</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <input
              type="text"
              value={alertTitle}
              onChange={(e) => setAlertTitle(e.target.value)}
              placeholder="Headline (e.g. Breaking News: Kakumiro Evening Bulletin Live)"
              maxLength={120}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
            />

            <textarea
              rows={2}
              value={alertBody}
              onChange={(e) => setAlertBody(e.target.value)}
              placeholder="Short update for viewers and closed-app notification banner"
              maxLength={280}
              className="w-full px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
            />

            <div className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AutoImagePreview
                    src={alertIconUrl || homeConfig.updatesIconUrl}
                    alt="Update icon preview"
                    className="w-10 h-10 rounded-lg border border-white/10 shrink-0"
                    fallbackNode={<BellRing className="w-4 h-4 text-[#ffd21f]" />}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#f5f4f8]">
                      Update / Alert Icon (Optional)
                    </p>
                    <p className="text-[11px] text-[#a5a3b2] truncate">
                      Defaults to Global Updates Icon when left blank.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                    {uploadingAlertIcon ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#ffd21f] animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                    )}
                    Upload Icon
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingAlertIcon}
                      onChange={(e) => void handleAlertIconUpload(e)}
                      className="sr-only"
                    />
                  </label>
                  {alertIconUrl && (
                    <button
                      type="button"
                      onClick={() => setAlertIconUrl('')}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#101016] hover:bg-[#262631] border border-white/10 text-xs font-medium text-[#c9c7d2]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                value={alertIconUrl}
                onChange={(e) => setAlertIconUrl(e.target.value)}
                placeholder="Paste custom icon URL for this live alert / update"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sendingAlert}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-60 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingAlert ? 'Dispatching...' : 'Publish Live Alert & Push'}
              </button>
            </div>
          </form>

          {broadcastAlerts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#c9c7d2]">
                Published Broadcast Alerts ({broadcastAlerts.length})
              </p>
              {broadcastAlerts.map((alert) => {
                const effectiveAlertIcon =
                  alert.iconUrl || homeConfig.updatesIconUrl;
                return (
                  <div
                    key={alert.id}
                    className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AutoImagePreview
                        src={effectiveAlertIcon}
                        alt={alert.title}
                        className="w-9 h-9 rounded-lg border border-white/10 shrink-0"
                        fallbackNode={
                          <BellRing className="w-4 h-4 text-[#ffd21f]" />
                        }
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                          {alert.title}
                        </p>
                        <p className="text-xs text-[#a5a3b2] truncate">
                          {alert.category.toUpperCase()} · {alert.createdAt} ·{' '}
                          {alert.body}
                        </p>
                      </div>
                    </div>
                    {onDeleteBroadcastAlert && (
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteBroadcastAlert(alert.id);
                          showNotice('Removed broadcast alert.');
                        }}
                        aria-label={`Delete alert ${alert.title}`}
                        className="min-h-[38px] min-w-[38px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10 shrink-0 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7. APP FEATURES & CONTROLS */}
      {section === 'controls' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSaveControls}
            className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-4"
          >
            <div>
              <h3 className="text-sm font-semibold text-[#f5f4f8] mb-2">
                Enabled App Features
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    { key: 'enableTvGuide' as const, label: 'TV Guide Tab' },
                    { key: 'enableMovies' as const, label: 'Movies & Series Section' },
                    { key: 'enableRadios' as const, label: 'Radio Channels' },
                    { key: 'enableArchive' as const, label: 'TV Archive' },
                    { key: 'enablePodcasts' as const, label: 'Podcasts' },
                    {
                      key: 'enableLauncherScreen' as const,
                      label: 'Welcome Launcher Screen',
                    },
                    {
                      key: 'autoTimeSync' as const,
                      label: 'Automatic Internet Time Sync',
                    },
                  ]
                ).map((feat) => (
                  <label
                    key={feat.key}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-[#e4e2ec]">
                      {feat.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={configDraft[feat.key]}
                      onChange={(e) =>
                        setConfigDraft({
                          ...configDraft,
                          [feat.key]: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-[#ffd21f] cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#f5f4f8]">
                    Broadcast Announcement Bar
                  </p>
                  <p className="text-xs text-[#a5a3b2]">
                    Show a station-wide notice banner at the top of the app
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={configDraft.announcementEnabled}
                  onChange={(e) =>
                    setConfigDraft({
                      ...configDraft,
                      announcementEnabled: e.target.checked,
                    })
                  }
                  aria-label="Enable broadcast announcement bar"
                  className="w-5 h-5 accent-[#ffd21f] cursor-pointer"
                />
              </div>

              <input
                type="text"
                value={configDraft.announcementText}
                onChange={(e) =>
                  setConfigDraft({
                    ...configDraft,
                    announcementText: e.target.value,
                  })
                }
                placeholder="e.g. Live coverage of Kakumiro Community Day starts at 4:00 PM EAT"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-sm text-[#f5f4f8]"
              />
            </div>

            <label className="flex items-center justify-between gap-4 min-h-[44px] pt-2 border-t border-white/[0.06] cursor-pointer">
              <div>
                <span className="block text-sm font-semibold text-[#f5f4f8]">
                  Allow guest streaming
                </span>
                <span className="block text-xs text-[#a5a3b2]">
                  When disabled, viewers must sign in via My Account to open streams
                </span>
              </div>
              <input
                type="checkbox"
                checked={configDraft.allowGuestPlayback}
                onChange={(e) =>
                  setConfigDraft({
                    ...configDraft,
                    allowGuestPlayback: e.target.checked,
                  })
                }
                className="w-5 h-5 accent-[#ffd21f] cursor-pointer"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" />
                Save App Features
              </button>
            </div>
          </form>

          <div className="p-4 rounded-xl bg-[#101016] border border-red-500/20 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#f5f4f8]">
                Reset App Configuration
              </p>
              <p className="text-xs text-[#a5a3b2]">
                Restore default channels, TV guide, hero slides, promo card, and
                archive catalog
              </p>
            </div>

            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#262631] text-xs font-semibold text-[#c9c7d2]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResetDefaults();
                    setConfirmReset(false);
                    showNotice('App data restored to factory defaults.');
                  }}
                  className="min-h-[40px] px-4 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-bold"
                >
                  Confirm reset
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-[40px] px-4 py-1.5 rounded-lg bg-[#262631] hover:bg-red-500/15 hover:text-red-200 border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset defaults
              </button>
            )}
          </div>
        </div>
      )}

      <ThumbnailCutoutModal
        open={cutoutTarget !== null}
        title={
          cutoutTarget === 'movie'
            ? 'Movie Poster Cutout & Frame Capture'
            : 'Archived Program Thumbnail Cutout'
        }
        defaultAspect={cutoutTarget === 'movie' ? 'poster' : 'landscape'}
        mediaUrl={cutoutTarget === 'movie' ? movieStreamUrl : arcMediaUrl}
        localVideoFileUrl={
          cutoutTarget === 'movie' ? movieLocalVideoUrl : arcLocalVideoUrl
        }
        imageUrl={cutoutTarget === 'movie' ? moviePoster : arcThumbnail}
        onClose={() => setCutoutTarget(null)}
        onApply={(dataUrl) => {
          if (cutoutTarget === 'movie') {
            moviePosterManualRef.current = true;
            setMoviePoster(dataUrl);
            setMovieAutoDetectNote('Custom cutout poster applied and ready to save.');
            showNotice('Movie poster cutout applied.');
          } else if (cutoutTarget === 'archive') {
            arcThumbnailManualRef.current = true;
            setArcThumbnail(dataUrl);
            setArcAutoDetectNote('Custom cutout thumbnail applied and ready to save.');
            showNotice('Program thumbnail cutout applied.');
          }
        }}
      />
    </div>
  );
}
