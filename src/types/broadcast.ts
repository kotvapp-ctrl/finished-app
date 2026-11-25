export type ChannelType = 'Television' | 'Radios';

export type BrandTheme = 'default' | 'nbs' | 'citizen' | 'sanyuka' | 'sport' | 'radio';

export type StreamFormat = 'auto' | 'hls' | 'media' | 'audio' | 'embed';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  subtitle: string;
  brand: BrandTheme;
  progress: number;
  program: string;
  streamUrl?: string;
  streamType?: StreamFormat;
  useRelayServer?: boolean;
  iconUrl?: string;
}

export interface GuideProgramme {
  channelId: string;
  currentTitle: string;
  currentTime: string;
  nextTitle: string;
  nextTime: string;
}

export interface ArchiveItem {
  id: string;
  title: string;
  channelName: string;
  channelId: string;
  duration: string;
  recordedAt: string;
  category: 'archive' | 'podcast';
  description: string;
  thumbnailPath?: string;
  mediaUrl?: string;
  streamType?: StreamFormat;
}

export interface HeroSlide {
  id: string;
  kicker: string;
  title: string;
  badgeText?: string;
  subtitle: string;
  channelId: string;
  imagePath: string;
  mediaMode?: 'photo' | 'video';
  streamUrl?: string;
  streamType?: StreamFormat;
  useChannelStream?: boolean;
  useRelayServer?: boolean;
}

export interface UserProfile {
  identifier: string;
  displayName: string;
  plan: 'Free' | 'Plus' | 'Family';
  role: 'viewer' | 'admin';
  signedIn: boolean;
}

export interface PlaybackSettings {
  autoplay: boolean;
  dataSaver: boolean;
  rememberLastChannel: boolean;
}

export interface PromoConfig {
  badgeText: string;
  heading: string;
  description: string;
  enabled: boolean;
  mediaMode?: 'photo' | 'video';
  imagePath?: string;
  channelId?: string;
  streamUrl?: string;
  streamType?: StreamFormat;
  useChannelStream?: boolean;
  autoplayStream?: boolean;
  useRelayServer?: boolean;
}

export type MovieFormat = 'movie' | 'series';

export type MovieGenre =
  | 'Action'
  | 'Horror'
  | 'Adventure'
  | 'Bunyoro Films'
  | 'Series'
  | 'Thriller'
  | 'Drama'
  | 'Comedy';

export interface MovieItem {
  id: string;
  title: string;
  format: MovieFormat;
  genre: MovieGenre;
  year: string;
  duration: string;
  description: string;
  posterPath?: string;
  channelId: string;
  channelName: string;
  streamUrl?: string;
  streamType?: StreamFormat;
  episodesCount?: number;
  featured?: boolean;
  useRelayServer?: boolean;
}

export interface AppConfig {
  announcementEnabled: boolean;
  announcementText: string;
  allowGuestPlayback: boolean;
  enableTvGuide: boolean;
  enableMovies: boolean;
  enableArchive: boolean;
  enablePodcasts: boolean;
  enableRadios: boolean;
  enableLauncherScreen: boolean;
  heroAutoplay: boolean;
  heroIntervalSec: number;
  autoTimeSync: boolean;
}

export type HomeSectionKey =
  | 'spotlight'
  | 'continueWatching'
  | 'channels'
  | 'movies';

export interface HomeConfig {
  sectionOrder: HomeSectionKey[];
  showHeroCarousel: boolean;
  heroCtaLabel: string;
  showContinueWatching: boolean;
  continueWatchingTitle: string;
  continueWatchingSubtitle: string;
  showChannelsSection: boolean;
  channelsTitle: string;
  channelsSubtitle: string;
  channelsActionLabel: string;
  channelsCount: number;
  featuredChannelIds: string[];
  showMoviesSection: boolean;
  moviesTitle: string;
  moviesSubtitle: string;
  moviesActionLabel: string;
  moviesCount: number;
  moviesFeaturedOnly: boolean;
  welcomeBannerEnabled: boolean;
  welcomeBannerKicker: string;
  welcomeBannerTitle: string;
  welcomeBannerBody: string;
  welcomeBannerCtaLabel: string;
  welcomeBannerChannelId: string;
  showWatchCatchupRail?: boolean;
  watchCatchupTitle?: string;
  tvArchiveAutoArtUrl?: string;
  podcastAutoArtUrl?: string;
  watchCatchupAutoArtUrl?: string;
  movieAutoArtUrl?: string;
  stationIconUrl?: string;
  radioIconUrl?: string;
  updatesIconUrl?: string;
  newsIconUrl?: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  streamKey?: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  timestampMs?: number;
  likes: number;
  likedByMe?: boolean;
  pendingSync?: boolean;
  replyTo?: {
    messageId: string;
    senderName: string;
    excerpt: string;
  };
}

export type BroadcastAlertCategory = 'news' | 'sports' | 'tvGuide' | 'live';

export interface BroadcastAlert {
  id: string;
  category: BroadcastAlertCategory;
  title: string;
  body: string;
  channelId?: string;
  iconUrl?: string;
  createdAt: string;
  timestampMs: number;
  sentByUid?: string;
}

export type NewsCategory =
  | 'Breaking'
  | 'Politics'
  | 'Sports'
  | 'Business'
  | 'Community'
  | 'Entertainment';

export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  body: string;
  category: NewsCategory;
  author: string;
  imageUrl?: string;
  channelId?: string;
  featured?: boolean;
  publishedAt: string;
  timestampMs: number;
  sentByUid?: string;
}

export type ArtistGenre =
  | 'Afrobeat'
  | 'Gospel'
  | 'Kadongo Kamu'
  | 'Hip Hop & Rap'
  | 'Traditional'
  | 'RnB & Soul'
  | 'Dancehall';

export interface ArtistProfile {
  id: string;
  name: string;
  stageGenre: ArtistGenre;
  origin: string;
  bio: string;
  latestRelease: string;
  photoUrl?: string;
  mediaUrl?: string;
  streamType?: StreamFormat;
  channelId?: string;
  featured?: boolean;
  timestampMs: number;
  sentByUid?: string;
}

export type StationUpdateCategory =
  | 'admin'
  | 'news'
  | 'channel'
  | 'live'
  | 'radio'
  | 'artist'
  | 'podcast'
  | 'archive'
  | 'movie'
  | 'tvGuide'
  | 'sports';

export interface StationUpdate {
  id: string;
  category: StationUpdateCategory;
  title: string;
  summary: string;
  targetId?: string;
  channelId?: string;
  iconUrl?: string;
  actionLabel?: string;
  createdAt: string;
  timestampMs: number;
  sentByUid?: string;
}

export type NotificationTopic = BroadcastAlertCategory;

export interface FcmSubscription {
  id: string;
  token: string;
  uid?: string;
  topics: NotificationTopic[];
  platform: string;
  webPushJson?: string;
}

export interface ContinueWatchingItem {
  id: string;
  kind: 'movie' | 'channel';
  channelId: string;
  channelName: string;
  brand: BrandTheme;
  title: string;
  subtitle?: string;
  posterPath?: string;
  overrideStreamUrl?: string;
  overrideStreamType?: StreamFormat;
  playedAtMs: number;
}

export type CloudFileCategory = 'video' | 'image' | 'audio' | 'document';

export type CloudFileStorageBackend =
  | 'firebase-storage'
  | 'firestore-vault'
  | 'external-url';

export interface CloudFileRecord {
  id: string;
  name: string;
  category: CloudFileCategory;
  mimeType: string;
  sizeBytes: number;
  url: string;
  storagePath?: string;
  storageBackend: CloudFileStorageBackend;
  chunkCount?: number;
  publicVisible?: boolean;
  description?: string;
  uploadedByUid: string;
  createdAt: string;
  timestampMs: number;
}

export interface BackupCatalogCounts {
  channels: number;
  guideSlots: number;
  heroSlides: number;
  movies: number;
  archiveItems: number;
  alerts: number;
}

export interface BackupSnapshot {
  id: string;
  label: string;
  createdByUid: string;
  createdByEmail: string;
  createdAt: string;
  timestampMs: number;
  sizeBytes: number;
  counts: BackupCatalogCounts;
  storageUrl?: string;
  snapshotJson: string;
}

export interface UserDirectoryEntry {
  uid: string;
  displayName: string;
  plan: UserProfile['plan'];
  favoritesCount: number;
  remindersCount: number;
  followedCount: number;
  updatedAtLabel?: string;
}

export interface AdminRecordEntry {
  uid: string;
  email: string;
  grantedAtLabel?: string;
}

export interface UserBackupSnapshot {
  id: string;
  uid: string;
  label: string;
  displayName: string;
  plan: UserProfile['plan'];
  favorites: string[];
  reminders: string[];
  followedSenders: string[];
  settings: PlaybackSettings;
  continueWatching?: ContinueWatchingItem[];
  offlineSavedTitles?: string[];
  createdAt: string;
  timestampMs: number;
  sizeBytes: number;
}

export interface UserCloudFile {
  id: string;
  uid: string;
  name: string;
  category: CloudFileCategory;
  mimeType: string;
  sizeBytes: number;
  url: string;
  storagePath?: string;
  storageBackend: CloudFileStorageBackend;
  description?: string;
  createdAt: string;
  timestampMs: number;
}

export interface UserLoginEvent {
  id: string;
  uid: string;
  displayName: string;
  eventType: 'login' | 'signup';
  provider: 'google' | 'password';
  platform: string;
  createdAt: string;
  timestampMs: number;
}


