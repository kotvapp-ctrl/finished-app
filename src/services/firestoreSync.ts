import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { type User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AdminRecordEntry,
  AppConfig,
  ArchiveItem,
  ArtistGenre,
  ArtistProfile,
  BrandTheme,
  BroadcastAlert,
  BroadcastAlertCategory,
  Channel,
  ChatMessage,
  ContinueWatchingItem,
  FcmSubscription,
  GuideProgramme,
  HeroSlide,
  HomeConfig,
  HomeSectionKey,
  MovieGenre,
  MovieItem,
  NewsArticle,
  NewsCategory,
  NotificationTopic,
  PlaybackSettings,
  PromoConfig,
  StationUpdate,
  StationUpdateCategory,
  StreamFormat,
  UserDirectoryEntry,
  UserLoginEvent,
  UserProfile,
} from '../types/broadcast';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_BRANDS: BrandTheme[] = [
  'default',
  'nbs',
  'citizen',
  'sanyuka',
  'sport',
  'radio',
];
const VALID_STREAM_TYPES: StreamFormat[] = [
  'auto',
  'hls',
  'media',
  'audio',
  'embed',
];
const VALID_MOVIE_GENRES: MovieGenre[] = [
  'Action',
  'Horror',
  'Adventure',
  'Bunyoro Films',
  'Series',
  'Thriller',
  'Drama',
  'Comedy',
];
const VALID_NEWS_CATEGORIES: NewsCategory[] = [
  'Breaking',
  'Politics',
  'Sports',
  'Business',
  'Community',
  'Entertainment',
];
const VALID_ARTIST_GENRES: ArtistGenre[] = [
  'Afrobeat',
  'Gospel',
  'Kadongo Kamu',
  'Hip Hop & Rap',
  'Traditional',
  'RnB & Soul',
  'Dancehall',
];
const VALID_PLANS: UserProfile['plan'][] = ['Free', 'Plus', 'Family'];

function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = (typeof raw === 'string' ? raw : '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64);
  if (cleaned && VALID_ID_REGEX.test(cleaned)) return cleaned;
  return `${fallbackPrefix}-${Date.now()}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' ? val : fallback;
  return str.slice(0, maxLen);
}

function safeBrand(val: unknown): BrandTheme {
  return VALID_BRANDS.includes(val as BrandTheme)
    ? (val as BrandTheme)
    : 'default';
}

function safeStreamType(val: unknown): StreamFormat | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  return VALID_STREAM_TYPES.includes(val as StreamFormat)
    ? (val as StreamFormat)
    : 'auto';
}

function safeMovieGenre(val: unknown): MovieGenre {
  return VALID_MOVIE_GENRES.includes(val as MovieGenre)
    ? (val as MovieGenre)
    : 'Drama';
}

function safeNewsCategory(val: unknown): NewsCategory {
  return VALID_NEWS_CATEGORIES.includes(val as NewsCategory)
    ? (val as NewsCategory)
    : 'Breaking';
}

function safeArtistGenre(val: unknown): ArtistGenre {
  return VALID_ARTIST_GENRES.includes(val as ArtistGenre)
    ? (val as ArtistGenre)
    : 'Afrobeat';
}

function safeMediaMode(val: unknown): 'photo' | 'video' | undefined {
  if (val === 'photo' || val === 'video') return val;
  return undefined;
}

function safeImagePayload(val: unknown, maxLen = 200000): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  return trimmed.length <= maxLen ? trimmed : '';
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result as T;
}

function sanitizeBoundedStringList(
  items: Iterable<string>,
  maxItems: number,
  maxItemLength = 160
): string[] {
  const result: string[] = [];
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().slice(0, maxItemLength);
    if (!trimmed) continue;
    result.push(trimmed);
    if (result.length >= maxItems) break;
  }
  return result;
}

function sanitizeContinueWatchingList(
  items?: ContinueWatchingItem[]
): ContinueWatchingItem[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const cleaned: ContinueWatchingItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = clampString(item.id, 160).trim();
    const title = clampString(item.title, 140).trim();
    const channelId = sanitizeId(item.channelId, 'ch');
    if (!id || !title || !channelId) continue;
    const posterPathRaw =
      typeof item.posterPath === 'string' &&
      !item.posterPath.startsWith('data:') &&
      item.posterPath.length <= 1000
        ? item.posterPath.trim()
        : undefined;
    const kind: 'movie' | 'channel' =
      item.kind === 'movie' ? 'movie' : 'channel';
    cleaned.push(
      stripUndefined({
        id,
        kind,
        channelId,
        channelName: clampString(item.channelName, 80, 'Channel'),
        brand: safeBrand(item.brand),
        title,
        subtitle: item.subtitle ? clampString(item.subtitle, 160) : undefined,
        posterPath: posterPathRaw || undefined,
        overrideStreamUrl: item.overrideStreamUrl
          ? clampString(item.overrideStreamUrl.trim(), 1000)
          : undefined,
        overrideStreamType: safeStreamType(item.overrideStreamType),
        playedAtMs:
          typeof item.playedAtMs === 'number' && item.playedAtMs > 0
            ? item.playedAtMs
            : Date.now(),
      })
    );
    if (cleaned.length >= 5) break;
  }
  return cleaned;
}

export function sanitizeChannelPayload(channel: Channel) {
  return stripUndefined({
    id: sanitizeId(channel.id, 'ch'),
    name: clampString(channel.name, 80, 'Channel').trim() || 'Channel',
    type: channel.type === 'Radios' ? 'Radios' : 'Television',
    subtitle: clampString(channel.subtitle, 120),
    brand: safeBrand(channel.brand),
    progress: Math.min(100, Math.max(0, Number(channel.progress) || 0)),
    program: clampString(channel.program, 140),
    streamUrl: channel.streamUrl
      ? clampString(channel.streamUrl.trim(), 1000)
      : undefined,
    streamType: safeStreamType(channel.streamType),
    useRelayServer:
      typeof channel.useRelayServer === 'boolean'
        ? channel.useRelayServer
        : undefined,
    iconUrl: channel.iconUrl
      ? safeImagePayload(channel.iconUrl, 200000) || undefined
      : undefined,
    updatedAt: serverTimestamp(),
  });
}

export function sanitizeGuideSlotPayload(entry: GuideProgramme) {
  return {
    channelId: sanitizeId(entry.channelId, 'ch'),
    currentTitle:
      clampString(entry.currentTitle, 140, 'Live Programme').trim() ||
      'Live Programme',
    currentTime:
      clampString(entry.currentTime, 60, 'Live now').trim() || 'Live now',
    nextTitle:
      clampString(entry.nextTitle, 140, 'Up Next').trim() || 'Up Next',
    nextTime: clampString(entry.nextTime, 60, 'Next').trim() || 'Next',
    updatedAt: serverTimestamp(),
  };
}

export function sanitizeHeroSlidePayload(slide: HeroSlide) {
  return stripUndefined({
    id: sanitizeId(slide.id, 'slide'),
    kicker: clampString(slide.kicker, 60),
    title: clampString(slide.title, 140, 'Featured').trim() || 'Featured',
    badgeText: slide.badgeText
      ? clampString(slide.badgeText, 40)
      : undefined,
    subtitle: clampString(slide.subtitle, 240),
    channelId: sanitizeId(slide.channelId, 'ch'),
    imagePath: safeImagePayload(slide.imagePath),
    mediaMode: safeMediaMode(slide.mediaMode),
    streamUrl: slide.streamUrl
      ? clampString(slide.streamUrl.trim(), 1000)
      : undefined,
    streamType: safeStreamType(slide.streamType),
    useChannelStream:
      typeof slide.useChannelStream === 'boolean'
        ? slide.useChannelStream
        : undefined,
    useRelayServer:
      typeof slide.useRelayServer === 'boolean'
        ? slide.useRelayServer
        : undefined,
    updatedAt: serverTimestamp(),
  });
}

export function sanitizeMoviePayload(movie: MovieItem) {
  return stripUndefined({
    id: sanitizeId(movie.id, 'mov'),
    title: clampString(movie.title, 140, 'Untitled').trim() || 'Untitled',
    format: movie.format === 'series' ? 'series' : 'movie',
    genre: safeMovieGenre(movie.genre),
    year: clampString(movie.year, 12, '2026'),
    duration: clampString(movie.duration, 40, '90m'),
    description: clampString(movie.description, 600),
    posterPath: movie.posterPath
      ? safeImagePayload(movie.posterPath)
      : undefined,
    channelId: sanitizeId(movie.channelId, 'ch'),
    channelName: clampString(movie.channelName, 80),
    streamUrl: movie.streamUrl
      ? clampString(movie.streamUrl.trim(), 1000)
      : undefined,
    streamType: safeStreamType(movie.streamType),
    episodesCount:
      typeof movie.episodesCount === 'number'
        ? Math.min(2000, Math.max(0, movie.episodesCount))
        : undefined,
    featured: typeof movie.featured === 'boolean' ? movie.featured : undefined,
    useRelayServer:
      typeof movie.useRelayServer === 'boolean'
        ? movie.useRelayServer
        : undefined,
    updatedAt: serverTimestamp(),
  });
}

export function sanitizeArchiveItemPayload(item: ArchiveItem) {
  return stripUndefined({
    id: sanitizeId(item.id, 'arch'),
    title: clampString(item.title, 140, 'Recording').trim() || 'Recording',
    channelName: clampString(item.channelName, 80),
    channelId: sanitizeId(item.channelId, 'ch'),
    duration: clampString(item.duration, 40),
    recordedAt: clampString(item.recordedAt, 60),
    category: item.category === 'podcast' ? 'podcast' : 'archive',
    description: clampString(item.description, 600),
    thumbnailPath: item.thumbnailPath
      ? safeImagePayload(item.thumbnailPath)
      : undefined,
    mediaUrl: item.mediaUrl
      ? clampString(item.mediaUrl.trim(), 1000)
      : undefined,
    streamType: safeStreamType(item.streamType),
    updatedAt: serverTimestamp(),
  });
}

export function sanitizeNewsArticlePayload(
  article: NewsArticle,
  uid?: string,
  options?: { isCreate?: boolean }
) {
  const cleanId = sanitizeId(article.id, 'news');
  const cleanBody =
    clampString(article.body, 20000, '').trim() ||
    clampString(article.summary, 400, 'Full report pending.').trim() ||
    'Report published by Kakumiro Online TV.';
  const cleanSummary =
    clampString(article.summary, 400, '').trim() ||
    cleanBody.slice(0, 220).trim() ||
    'Written report.';

  return stripUndefined({
    id: cleanId,
    headline:
      clampString(article.headline, 180, 'Breaking Update').trim() ||
      'Breaking Update',
    summary: cleanSummary,
    body: cleanBody,
    category: safeNewsCategory(article.category),
    author:
      clampString(article.author, 80, 'KOTV News Desk').trim() ||
      'KOTV News Desk',
    imageUrl: article.imageUrl
      ? safeImagePayload(article.imageUrl, 200000) || undefined
      : undefined,
    channelId: article.channelId
      ? sanitizeId(article.channelId, 'ch')
      : undefined,
    featured: typeof article.featured === 'boolean' ? article.featured : undefined,
    publishedAt:
      clampString(article.publishedAt, 60, 'Just now').trim() || 'Just now',
    timestampMs:
      typeof article.timestampMs === 'number' && article.timestampMs > 0
        ? article.timestampMs
        : Date.now(),
    sentByUid: uid
      ? sanitizeId(uid, 'admin')
      : article.sentByUid
        ? sanitizeId(article.sentByUid, 'admin')
        : undefined,
    serverCreatedAt: options?.isCreate ? serverTimestamp() : undefined,
    updatedAt: serverTimestamp(),
  });
}

export function sanitizeArtistPayload(
  artist: ArtistProfile,
  uid?: string,
  options?: { isCreate?: boolean }
) {
  const cleanId = sanitizeId(artist.id, 'artist');
  return stripUndefined({
    id: cleanId,
    name: clampString(artist.name, 100, 'Featured Artist').trim() || 'Featured Artist',
    stageGenre: safeArtistGenre(artist.stageGenre),
    origin: clampString(artist.origin, 100, 'Kakumiro, Uganda').trim() || 'Kakumiro, Uganda',
    bio: clampString(artist.bio, 2000, 'Featured artist on Kakumiro Online TV.').trim() || 'Featured artist on Kakumiro Online TV.',
    latestRelease: clampString(artist.latestRelease, 140, 'Live Studio Session').trim() || 'Live Studio Session',
    photoUrl: artist.photoUrl
      ? safeImagePayload(artist.photoUrl, 200000) || undefined
      : undefined,
    mediaUrl: artist.mediaUrl
      ? clampString(artist.mediaUrl.trim(), 1000) || undefined
      : undefined,
    streamType: safeStreamType(artist.streamType),
    channelId: artist.channelId ? sanitizeId(artist.channelId, 'ch') : undefined,
    featured: typeof artist.featured === 'boolean' ? artist.featured : undefined,
    timestampMs:
      typeof artist.timestampMs === 'number' && artist.timestampMs > 0
        ? artist.timestampMs
        : Date.now(),
    sentByUid: uid
      ? sanitizeId(uid, 'admin')
      : artist.sentByUid
        ? sanitizeId(artist.sentByUid, 'admin')
        : undefined,
    serverCreatedAt: options?.isCreate ? serverTimestamp() : undefined,
    updatedAt: serverTimestamp(),
  });
}

export function sanitizePromoPayload(promo: PromoConfig) {
  return stripUndefined({
    badgeText: clampString(promo.badgeText, 50),
    heading: clampString(promo.heading, 140),
    description: clampString(promo.description, 300),
    enabled: Boolean(promo.enabled),
    mediaMode: safeMediaMode(promo.mediaMode),
    imagePath:
      promo.imagePath !== undefined
        ? safeImagePayload(promo.imagePath)
        : undefined,
    channelId: promo.channelId ? sanitizeId(promo.channelId, 'ch') : undefined,
    streamUrl: promo.streamUrl
      ? clampString(promo.streamUrl.trim(), 1000)
      : undefined,
    streamType: safeStreamType(promo.streamType),
    useChannelStream:
      typeof promo.useChannelStream === 'boolean'
        ? promo.useChannelStream
        : undefined,
    autoplayStream:
      typeof promo.autoplayStream === 'boolean'
        ? promo.autoplayStream
        : undefined,
    useRelayServer:
      typeof promo.useRelayServer === 'boolean'
        ? promo.useRelayServer
        : undefined,
    updatedAt: serverTimestamp(),
  });
}

export function sanitizeAppConfigPayload(config: AppConfig) {
  return {
    announcementEnabled: Boolean(config.announcementEnabled),
    announcementText: clampString(config.announcementText, 280),
    allowGuestPlayback: Boolean(config.allowGuestPlayback),
    enableTvGuide: Boolean(config.enableTvGuide),
    enableMovies: Boolean(config.enableMovies),
    enableArchive: Boolean(config.enableArchive),
    enablePodcasts: Boolean(config.enablePodcasts),
    enableRadios: Boolean(config.enableRadios),
    enableLauncherScreen: Boolean(config.enableLauncherScreen),
    heroAutoplay: Boolean(config.heroAutoplay),
    heroIntervalSec: Math.min(
      60,
      Math.max(3, Number(config.heroIntervalSec) || 6)
    ),
    autoTimeSync: Boolean(config.autoTimeSync),
    updatedAt: serverTimestamp(),
  };
}

const VALID_HOME_SECTIONS: HomeSectionKey[] = [
  'spotlight',
  'continueWatching',
  'channels',
  'movies',
];

export function sanitizeHomeConfigPayload(config: HomeConfig) {
  const dedupedOrder: HomeSectionKey[] = [];
  for (const key of Array.isArray(config.sectionOrder)
    ? config.sectionOrder
    : VALID_HOME_SECTIONS) {
    if (VALID_HOME_SECTIONS.includes(key) && !dedupedOrder.includes(key)) {
      dedupedOrder.push(key);
    }
  }
  for (const key of VALID_HOME_SECTIONS) {
    if (!dedupedOrder.includes(key)) dedupedOrder.push(key);
  }

  const featuredIds = Array.isArray(config.featuredChannelIds)
    ? Array.from(
        new Set(
          config.featuredChannelIds
            .filter(
              (id): id is string =>
                typeof id === 'string' && id.trim().length > 0
            )
            .map((id) => sanitizeId(id, 'ch'))
        )
      ).slice(0, 24)
    : [];

  return stripUndefined({
    sectionOrder: dedupedOrder.slice(0, 4),
    showHeroCarousel: Boolean(config.showHeroCarousel),
    heroCtaLabel:
      clampString(config.heroCtaLabel, 40, 'Watch live').trim() || 'Watch live',
    showContinueWatching: Boolean(config.showContinueWatching),
    continueWatchingTitle:
      clampString(
        config.continueWatchingTitle,
        80,
        'Continue watching'
      ).trim() || 'Continue watching',
    continueWatchingSubtitle: clampString(config.continueWatchingSubtitle, 160),
    showChannelsSection: Boolean(config.showChannelsSection),
    channelsTitle:
      clampString(config.channelsTitle, 80, 'Popular channels').trim() ||
      'Popular channels',
    channelsSubtitle: clampString(config.channelsSubtitle, 160),
    channelsActionLabel:
      clampString(config.channelsActionLabel, 40, 'View all').trim() ||
      'View all',
    channelsCount: Math.min(24, Math.max(1, Number(config.channelsCount) || 6)),
    featuredChannelIds: featuredIds,
    showMoviesSection: Boolean(config.showMoviesSection),
    moviesTitle:
      clampString(
        config.moviesTitle,
        80,
        'Movies, Series & Bunyoro Films'
      ).trim() || 'Movies, Series & Bunyoro Films',
    moviesSubtitle: clampString(config.moviesSubtitle, 160),
    moviesActionLabel:
      clampString(config.moviesActionLabel, 40, 'Browse movies').trim() ||
      'Browse movies',
    moviesCount: Math.min(24, Math.max(1, Number(config.moviesCount) || 8)),
    moviesFeaturedOnly: Boolean(config.moviesFeaturedOnly),
    welcomeBannerEnabled: Boolean(config.welcomeBannerEnabled),
    welcomeBannerKicker: clampString(config.welcomeBannerKicker, 50),
    welcomeBannerTitle: clampString(config.welcomeBannerTitle, 120),
    welcomeBannerBody: clampString(config.welcomeBannerBody, 280),
    welcomeBannerCtaLabel:
      clampString(config.welcomeBannerCtaLabel, 40, 'Watch now').trim() ||
      'Watch now',
    welcomeBannerChannelId: config.welcomeBannerChannelId
      ? sanitizeId(config.welcomeBannerChannelId, 'ch')
      : '',
    showWatchCatchupRail: config.showWatchCatchupRail !== false,
    watchCatchupTitle:
      clampString(config.watchCatchupTitle, 80, 'More like this').trim() ||
      'More like this',
    tvArchiveAutoArtUrl: safeImagePayload(config.tvArchiveAutoArtUrl, 140000),
    podcastAutoArtUrl: safeImagePayload(config.podcastAutoArtUrl, 140000),
    watchCatchupAutoArtUrl: safeImagePayload(
      config.watchCatchupAutoArtUrl,
      140000
    ),
    movieAutoArtUrl: safeImagePayload(config.movieAutoArtUrl, 140000),
    stationIconUrl: safeImagePayload(config.stationIconUrl, 140000),
    radioIconUrl: safeImagePayload(config.radioIconUrl, 140000),
    updatesIconUrl: safeImagePayload(config.updatesIconUrl, 140000),
    newsIconUrl: safeImagePayload(config.newsIconUrl, 140000),
    updatedAt: serverTimestamp(),
  });
}

export async function saveChannelToFirestore(channel: Channel) {
  const payload = sanitizeChannelPayload(channel);
  const path = `channels/${payload.id}`;
  try {
    await setDoc(doc(db, 'channels', payload.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteChannelFromFirestore(channelId: string) {
  const cleanId = sanitizeId(channelId);
  const path = `channels/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'channels', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveGuideSlotToFirestore(entry: GuideProgramme) {
  const payload = sanitizeGuideSlotPayload(entry);
  const path = `guideSlots/${payload.channelId}`;
  try {
    await setDoc(doc(db, 'guideSlots', payload.channelId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveHeroSlideToFirestore(slide: HeroSlide) {
  const payload = sanitizeHeroSlidePayload(slide);
  const path = `heroSlides/${payload.id}`;
  try {
    await setDoc(doc(db, 'heroSlides', payload.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteHeroSlideFromFirestore(slideId: string) {
  const cleanId = sanitizeId(slideId);
  const path = `heroSlides/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'heroSlides', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveMovieToFirestore(movie: MovieItem) {
  const payload = sanitizeMoviePayload(movie);
  const path = `movies/${payload.id}`;
  try {
    await setDoc(doc(db, 'movies', payload.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteMovieFromFirestore(movieId: string) {
  const cleanId = sanitizeId(movieId);
  const path = `movies/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'movies', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveArchiveItemToFirestore(item: ArchiveItem) {
  const payload = sanitizeArchiveItemPayload(item);
  const path = `archiveItems/${payload.id}`;
  try {
    await setDoc(doc(db, 'archiveItems', payload.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteArchiveItemFromFirestore(itemId: string) {
  const cleanId = sanitizeId(itemId);
  const path = `archiveItems/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'archiveItems', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveNewsArticleToFirestore(
  article: NewsArticle,
  uid?: string
) {
  const cleanId = sanitizeId(article.id, 'news');
  const path = `newsArticles/${cleanId}`;
  const docRef = doc(db, 'newsArticles', cleanId);
  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      const existingData = existing.data() as { serverCreatedAt?: unknown };
      const updatePayload = sanitizeNewsArticlePayload(
        { ...article, id: cleanId },
        undefined,
        { isCreate: false }
      );
      await updateDoc(docRef, {
        ...updatePayload,
        serverCreatedAt: existingData.serverCreatedAt ?? serverTimestamp(),
      });
    } else {
      const createPayload = sanitizeNewsArticlePayload(
        { ...article, id: cleanId },
        uid,
        { isCreate: true }
      );
      await setDoc(docRef, createPayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteNewsArticleFromFirestore(articleId: string) {
  const cleanId = sanitizeId(articleId, 'news');
  const path = `newsArticles/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'newsArticles', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveArtistToFirestore(
  artist: ArtistProfile,
  uid?: string
) {
  const cleanId = sanitizeId(artist.id, 'artist');
  const path = `artists/${cleanId}`;
  const docRef = doc(db, 'artists', cleanId);
  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      const existingData = existing.data() as { serverCreatedAt?: unknown };
      const updatePayload = sanitizeArtistPayload(
        { ...artist, id: cleanId },
        undefined,
        { isCreate: false }
      );
      await updateDoc(docRef, {
        ...updatePayload,
        serverCreatedAt: existingData.serverCreatedAt ?? serverTimestamp(),
      });
    } else {
      const createPayload = sanitizeArtistPayload(
        { ...artist, id: cleanId },
        uid,
        { isCreate: true }
      );
      await setDoc(docRef, createPayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteArtistFromFirestore(artistId: string) {
  const cleanId = sanitizeId(artistId, 'artist');
  const path = `artists/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'artists', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function savePromoToFirestore(promo: PromoConfig) {
  const payload = sanitizePromoPayload(promo);
  const path = 'settings/promo';
  try {
    await setDoc(doc(db, 'settings', 'promo'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveAppConfigToFirestore(config: AppConfig) {
  const payload = sanitizeAppConfigPayload(config);
  const path = 'settings/appConfig';
  try {
    await setDoc(doc(db, 'settings', 'appConfig'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveHomeConfigToFirestore(config: HomeConfig) {
  const payload = sanitizeHomeConfigPayload(config);
  const path = 'settings/homeConfig';
  try {
    await setDoc(doc(db, 'settings', 'homeConfig'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function seedCatalogToFirestore(params: {
  channels: Channel[];
  guideSchedule: GuideProgramme[];
  heroSlides: HeroSlide[];
  movies: MovieItem[];
  archiveItems: ArchiveItem[];
  newsArticles?: NewsArticle[];
  artists?: ArtistProfile[];
  promo: PromoConfig;
  appConfig: AppConfig;
  homeConfig?: HomeConfig;
}) {
  const operations: Array<{
    ref: ReturnType<typeof doc>;
    data: Record<string, unknown>;
  }> = [];

  for (const ch of params.channels) {
    const data = sanitizeChannelPayload(ch);
    operations.push({ ref: doc(db, 'channels', data.id), data });
  }
  for (const slot of params.guideSchedule) {
    const data = sanitizeGuideSlotPayload(slot);
    operations.push({ ref: doc(db, 'guideSlots', data.channelId), data });
  }
  for (const slide of params.heroSlides) {
    const data = sanitizeHeroSlidePayload(slide);
    operations.push({ ref: doc(db, 'heroSlides', data.id), data });
  }
  for (const mov of params.movies) {
    const data = sanitizeMoviePayload(mov);
    operations.push({ ref: doc(db, 'movies', data.id), data });
  }
  for (const item of params.archiveItems) {
    const data = sanitizeArchiveItemPayload(item);
    operations.push({ ref: doc(db, 'archiveItems', data.id), data });
  }
  if (Array.isArray(params.newsArticles) && params.newsArticles.length > 0) {
    let existingCreatedMap = new Map<string, unknown>();
    try {
      const existingNewsSnap = await getDocs(collection(db, 'newsArticles'));
      existingCreatedMap = new Map(
        existingNewsSnap.docs.map((d) => [d.id, d.data().serverCreatedAt])
      );
    } catch {
      // Proceed assuming fresh create
    }
    for (const article of params.newsArticles) {
      const cleanId = sanitizeId(article.id, 'news');
      const existingCreated = existingCreatedMap.get(cleanId);
      if (existingCreated) {
        const data = {
          ...sanitizeNewsArticlePayload(
            { ...article, id: cleanId },
            undefined,
            { isCreate: false }
          ),
          serverCreatedAt: existingCreated,
        };
        operations.push({ ref: doc(db, 'newsArticles', cleanId), data });
      } else {
        const data = sanitizeNewsArticlePayload(
          { ...article, id: cleanId },
          undefined,
          { isCreate: true }
        );
        operations.push({ ref: doc(db, 'newsArticles', cleanId), data });
      }
    }
  }
  if (Array.isArray(params.artists) && params.artists.length > 0) {
    let existingArtistCreatedMap = new Map<string, unknown>();
    try {
      const existingArtistsSnap = await getDocs(collection(db, 'artists'));
      existingArtistCreatedMap = new Map(
        existingArtistsSnap.docs.map((d) => [d.id, d.data().serverCreatedAt])
      );
    } catch {
      // Proceed assuming fresh create
    }
    for (const artist of params.artists) {
      const cleanId = sanitizeId(artist.id, 'artist');
      const existingCreated = existingArtistCreatedMap.get(cleanId);
      if (existingCreated) {
        const data = {
          ...sanitizeArtistPayload(
            { ...artist, id: cleanId },
            undefined,
            { isCreate: false }
          ),
          serverCreatedAt: existingCreated,
        };
        operations.push({ ref: doc(db, 'artists', cleanId), data });
      } else {
        const data = sanitizeArtistPayload(
          { ...artist, id: cleanId },
          undefined,
          { isCreate: true }
        );
        operations.push({ ref: doc(db, 'artists', cleanId), data });
      }
    }
  }
  operations.push({
    ref: doc(db, 'settings', 'promo'),
    data: sanitizePromoPayload(params.promo),
  });
  operations.push({
    ref: doc(db, 'settings', 'appConfig'),
    data: sanitizeAppConfigPayload(params.appConfig),
  });
  if (params.homeConfig) {
    operations.push({
      ref: doc(db, 'settings', 'homeConfig'),
      data: sanitizeHomeConfigPayload(params.homeConfig),
    });
  }

  try {
    const CHUNK_SIZE = 20;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const op of operations.slice(i, i + CHUNK_SIZE)) {
        batch.set(op.ref, op.data);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'channels');
  }
}

export async function sendChatMessageToFirestore(
  message: ChatMessage,
  uid: string
) {
  const cleanId = sanitizeId(message.id, 'chat');
  const cleanChannelId = sanitizeId(message.channelId, 'ch');
  const path = `chatMessages/${cleanId}`;
  const replyMessageId = message.replyTo
    ? clampString(message.replyTo.messageId, 64).trim() || 'msg'
    : '';
  const replySenderName = message.replyTo
    ? clampString(message.replyTo.senderName, 60).trim() || 'Viewer'
    : '';

  const payload = stripUndefined({
    id: cleanId,
    channelId: cleanChannelId,
    streamKey: clampString(message.streamKey || cleanChannelId, 320),
    senderId: sanitizeId(uid, 'user'),
    senderName: clampString(message.senderName, 60, 'Viewer').trim() || 'Viewer',
    text: clampString(message.text, 280, '').trim() || ' ',
    createdAt: clampString(message.createdAt, 40, 'Just now'),
    timestampMs: message.timestampMs || Date.now(),
    likes: 0,
    replyTo: message.replyTo
      ? {
          messageId: replyMessageId,
          senderName: replySenderName,
          excerpt: clampString(message.replyTo.excerpt, 120),
        }
      : undefined,
    serverCreatedAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'chatMessages', cleanId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateChatLikesInFirestore(
  messageId: string,
  delta: 1 | -1
) {
  const cleanId = sanitizeId(messageId, 'chat');
  const path = `chatMessages/${cleanId}`;
  const msgRef = doc(db, 'chatMessages', cleanId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(msgRef);
      if (!snap.exists()) return;
      const current = Number(snap.data().likes) || 0;
      const next = delta > 0 ? current + 1 : Math.max(0, current - 1);
      if (next === current) return;
      tx.update(msgRef, { likes: next });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteChatMessageFromFirestore(messageId: string) {
  const cleanId = sanitizeId(messageId, 'chat');
  const path = `chatMessages/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'chatMessages', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteChatMessagesBatchFromFirestore(
  messageIds: string[]
) {
  if (messageIds.length === 0) return;
  try {
    const CHUNK_SIZE = 200;
    for (let i = 0; i < messageIds.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const id of messageIds.slice(i, i + CHUNK_SIZE)) {
        batch.delete(doc(db, 'chatMessages', sanitizeId(id, 'chat')));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'chatMessages');
  }
}

export async function syncUserDocumentsToFirestore(params: {
  user: User;
  profile: UserProfile;
  favorites: Set<string>;
  reminders: Set<string>;
  followedSenders: Set<string>;
  settings: PlaybackSettings;
  continueWatching?: ContinueWatchingItem[];
}) {
  const {
    user,
    profile,
    favorites,
    reminders,
    followedSenders,
    settings,
    continueWatching,
  } = params;
  const uid = sanitizeId(user.uid, 'user');
  const prefPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  try {
    const safePlan = VALID_PLANS.includes(profile.plan) ? profile.plan : 'Free';
    const prefData = stripUndefined({
      uid,
      displayName:
        clampString(profile.displayName || user.displayName || 'Viewer', 60)
          .trim() || 'Viewer',
      plan: safePlan,
      favorites: sanitizeBoundedStringList(favorites, 100, 128),
      reminders: sanitizeBoundedStringList(reminders, 200, 160),
      followedSenders: sanitizeBoundedStringList(followedSenders, 200, 128),
      settings: {
        autoplay: Boolean(settings.autoplay),
        dataSaver: Boolean(settings.dataSaver),
        rememberLastChannel: Boolean(settings.rememberLastChannel),
      },
      continueWatching: sanitizeContinueWatchingList(continueWatching),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', uid), prefData);

    const existingPrivate = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    const email = clampString(user.email || profile.identifier || '', 160);
    if (email.length >= 3) {
      if (existingPrivate.exists()) {
        await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
          email,
          identifier: clampString(profile.identifier || email, 160),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', uid, 'private', 'info'), {
          uid,
          email,
          identifier: clampString(profile.identifier || email, 160),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${prefPath} | ${privatePath}`
    );
  }
}

export async function publishBroadcastAlertToFirestore(
  alert: BroadcastAlert,
  uid: string
) {
  const cleanId = sanitizeId(alert.id, 'alert');
  const path = `broadcastAlerts/${cleanId}`;
  const allowedCats: BroadcastAlertCategory[] = [
    'news',
    'sports',
    'tvGuide',
    'live',
  ];
  const category = allowedCats.includes(alert.category)
    ? alert.category
    : 'live';
  const payload = stripUndefined({
    id: cleanId,
    category,
    title: clampString(alert.title, 120, 'Live Update').trim() || 'Live Update',
    body: clampString(alert.body, 280, '').trim() || 'Tune in now.',
    channelId: alert.channelId ? sanitizeId(alert.channelId, 'ch') : undefined,
    iconUrl: alert.iconUrl
      ? safeImagePayload(alert.iconUrl, 200000) || undefined
      : undefined,
    createdAt: clampString(alert.createdAt, 40, 'Just now'),
    timestampMs: alert.timestampMs || Date.now(),
    sentByUid: sanitizeId(uid, 'admin'),
    serverCreatedAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'broadcastAlerts', cleanId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteBroadcastAlertFromFirestore(alertId: string) {
  const cleanId = sanitizeId(alertId, 'alert');
  const path = `broadcastAlerts/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'broadcastAlerts', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

const VALID_STATION_UPDATE_CATEGORIES: StationUpdateCategory[] = [
  'admin',
  'news',
  'channel',
  'live',
  'radio',
  'artist',
  'podcast',
  'archive',
  'movie',
  'tvGuide',
  'sports',
];

export async function publishStationUpdateToFirestore(
  update: StationUpdate,
  uid: string
) {
  const cleanId = sanitizeId(update.id, 'upd');
  const path = `stationUpdates/${cleanId}`;
  const category: StationUpdateCategory =
    VALID_STATION_UPDATE_CATEGORIES.includes(update.category)
      ? update.category
      : 'admin';

  const payload = stripUndefined({
    id: cleanId,
    category,
    title: clampString(update.title, 140, 'Station Update').trim() || 'Station Update',
    summary: clampString(update.summary, 300, 'Updated on Kakumiro Online TV.').trim() || 'Updated on Kakumiro Online TV.',
    targetId: update.targetId ? sanitizeId(update.targetId, 'item') : undefined,
    channelId: update.channelId ? sanitizeId(update.channelId, 'ch') : undefined,
    iconUrl: update.iconUrl
      ? safeImagePayload(update.iconUrl, 200000) || undefined
      : undefined,
    actionLabel: update.actionLabel
      ? clampString(update.actionLabel, 40).trim() || undefined
      : undefined,
    createdAt: clampString(update.createdAt, 40, 'Just now') || 'Just now',
    timestampMs:
      typeof update.timestampMs === 'number' && update.timestampMs > 0
        ? update.timestampMs
        : Date.now(),
    sentByUid: sanitizeId(uid, 'admin'),
    serverCreatedAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'stationUpdates', cleanId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteStationUpdateFromFirestore(updateId: string) {
  const cleanId = sanitizeId(updateId, 'upd');
  const path = `stationUpdates/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'stationUpdates', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveFcmSubscriptionToFirestore(params: {
  uid: string;
  token: string;
  topics: NotificationTopic[];
  platform: string;
  webPushJson?: string;
}) {
  const cleanToken = clampString(params.token.trim(), 512);
  if (cleanToken.length < 10) return;

  const uid = sanitizeId(params.uid, 'user');
  const path = `fcmSubscriptions/${uid}`;
  const cleanTopics = params.topics
    .filter((t): t is NotificationTopic =>
      ['news', 'sports', 'tvGuide', 'live'].includes(t)
    )
    .slice(0, 10);

  const cleanWebPush =
    typeof params.webPushJson === 'string' &&
    params.webPushJson.trim().length > 0 &&
    params.webPushJson.trim().length <= 1200
      ? params.webPushJson.trim()
      : undefined;

  const payload = stripUndefined({
    id: uid,
    uid,
    token: cleanToken,
    topics: cleanTopics,
    platform: clampString(params.platform || 'web', 40, 'web') || 'web',
    webPushJson: cleanWebPush,
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(doc(db, 'fcmSubscriptions', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchPushTargetsForAdmin(): Promise<{
  fcmTokens: string[];
  webPushSubscriptions: { subscriptionJson: string; topics: NotificationTopic[] }[];
}> {
  try {
    const snap = await getDocs(collection(db, 'fcmSubscriptions'));
    const fcmTokens: string[] = [];
    const webPushSubscriptions: {
      subscriptionJson: string;
      topics: NotificationTopic[];
    }[] = [];

    for (const d of snap.docs) {
      const data = d.data() as Partial<FcmSubscription>;
      const topics = Array.isArray(data.topics)
        ? data.topics.filter((t): t is NotificationTopic =>
            ['news', 'sports', 'tvGuide', 'live'].includes(String(t))
          )
        : ['news', 'sports', 'tvGuide', 'live'];

      if (
        typeof data.token === 'string' &&
        data.token.trim().length >= 10 &&
        !data.token.startsWith('webpush:')
      ) {
        fcmTokens.push(data.token.trim());
      }
      if (
        typeof data.webPushJson === 'string' &&
        data.webPushJson.trim().startsWith('{')
      ) {
        webPushSubscriptions.push({
          subscriptionJson: data.webPushJson.trim(),
          topics: topics as NotificationTopic[],
        });
      }
    }
    return { fcmTokens, webPushSubscriptions };
  } catch {
    return { fcmTokens: [], webPushSubscriptions: [] };
  }
}

export async function fetchFcmTokensForAdmin(): Promise<string[]> {
  const res = await fetchPushTargetsForAdmin();
  return res.fcmTokens;
}

export interface UserPreferencesData {
  displayName?: string;
  plan?: UserProfile['plan'];
  favorites?: string[];
  reminders?: string[];
  followedSenders?: string[];
  settings?: PlaybackSettings;
  continueWatching?: ContinueWatchingItem[];
}

export interface PublicCatalogCallbacks {
  onChannels: (channels: Channel[], isEmpty: boolean) => void;
  onGuide: (guide: GuideProgramme[], isEmpty: boolean) => void;
  onHeroSlides: (slides: HeroSlide[], isEmpty: boolean) => void;
  onMovies: (movies: MovieItem[], isEmpty: boolean) => void;
  onArchive: (items: ArchiveItem[], isEmpty: boolean) => void;
  onPromo: (promo: PromoConfig) => void;
  onAppConfig: (config: AppConfig) => void;
  onHomeConfig?: (config: HomeConfig) => void;
  onChatMessages: (messages: ChatMessage[]) => void;
  onBroadcastAlerts?: (alerts: BroadcastAlert[]) => void;
  onStationUpdates?: (updates: StationUpdate[]) => void;
  onNewsArticles?: (articles: NewsArticle[], isEmpty: boolean) => void;
  onArtists?: (artists: ArtistProfile[], isEmpty: boolean) => void;
}

export interface CatalogCallbacks extends PublicCatalogCallbacks {
  onUserPreferences: (data: UserPreferencesData) => void;
}

export function subscribePublicBroadcastCatalog(
  callbacks: PublicCatalogCallbacks
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      collection(db, 'channels'),
      (snap) => {
        if (snap.empty) {
          callbacks.onChannels([], true);
          return;
        }
        const list = snap.docs.map((d) => d.data() as Channel);
        callbacks.onChannels(list, false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'channels')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'guideSlots'),
      (snap) => {
        callbacks.onGuide(
          snap.docs.map((d) => d.data() as GuideProgramme),
          snap.empty
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'guideSlots')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'heroSlides'),
      (snap) => {
        callbacks.onHeroSlides(
          snap.docs.map((d) => d.data() as HeroSlide),
          snap.empty
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'heroSlides')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'movies'),
      (snap) => {
        callbacks.onMovies(
          snap.docs.map((d) => d.data() as MovieItem),
          snap.empty
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'movies')
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'archiveItems'),
      (snap) => {
        callbacks.onArchive(
          snap.docs.map((d) => d.data() as ArchiveItem),
          snap.empty
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'archiveItems')
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'settings', 'promo'),
      (snap) => {
        if (snap.exists()) {
          callbacks.onPromo(snap.data() as PromoConfig);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/promo')
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'settings', 'appConfig'),
      (snap) => {
        if (snap.exists()) {
          callbacks.onAppConfig(snap.data() as AppConfig);
        }
      },
      (err) =>
        handleFirestoreError(err, OperationType.GET, 'settings/appConfig')
    )
  );

  if (callbacks.onHomeConfig) {
    const onHomeConfig = callbacks.onHomeConfig;
    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'homeConfig'),
        (snap) => {
          if (snap.exists()) {
            onHomeConfig(snap.data() as HomeConfig);
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.GET, 'settings/homeConfig')
      )
    );
  }

  unsubs.push(
    onSnapshot(
      query(collection(db, 'chatMessages'), orderBy('timestampMs', 'asc')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ChatMessage);
        callbacks.onChatMessages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chatMessages')
    )
  );

  if (callbacks.onBroadcastAlerts) {
    const onAlerts = callbacks.onBroadcastAlerts;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'broadcastAlerts'), orderBy('timestampMs', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as BroadcastAlert);
          onAlerts(list);
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'broadcastAlerts')
      )
    );
  }

  if (callbacks.onNewsArticles) {
    const onNews = callbacks.onNewsArticles;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'newsArticles'), orderBy('timestampMs', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as NewsArticle);
          onNews(list, snap.empty);
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'newsArticles')
      )
    );
  }

  if (callbacks.onArtists) {
    const onArtists = callbacks.onArtists;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'artists'), orderBy('timestampMs', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as ArtistProfile);
          onArtists(list, snap.empty);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'artists')
      )
    );
  }

  if (callbacks.onStationUpdates) {
    const onStationUpdates = callbacks.onStationUpdates;
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'stationUpdates'),
          orderBy('timestampMs', 'desc'),
          limit(60)
        ),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as StationUpdate);
          onStationUpdates(list);
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'stationUpdates')
      )
    );
  }

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export function subscribeAuthenticatedUserPreferences(
  user: User,
  onUserPreferences: (data: UserPreferencesData) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', user.uid),
    (snap) => {
      if (snap.exists()) {
        onUserPreferences(snap.data() as UserPreferencesData);
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
  );
}

export function subscribeAuthenticatedFirestore(
  user: User,
  callbacks: CatalogCallbacks
): Unsubscribe {
  const unsubPublic = subscribePublicBroadcastCatalog(callbacks);
  const unsubUser = subscribeAuthenticatedUserPreferences(
    user,
    callbacks.onUserPreferences
  );

  return () => {
    unsubPublic();
    unsubUser();
  };
}

export async function fetchUserDirectoryForAdmin(): Promise<UserDirectoryEntry[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => {
      const data = d.data() as {
        uid?: string;
        displayName?: string;
        plan?: UserProfile['plan'];
        favorites?: unknown[];
        reminders?: unknown[];
        followedSenders?: unknown[];
        updatedAt?: { toDate?: () => Date };
      };
      const updatedDate =
        typeof data.updatedAt?.toDate === 'function'
          ? data.updatedAt.toDate()
          : null;
      return {
        uid: data.uid || d.id,
        displayName: data.displayName || 'Viewer',
        plan: VALID_PLANS.includes(data.plan as UserProfile['plan'])
          ? (data.plan as UserProfile['plan'])
          : 'Free',
        favoritesCount: Array.isArray(data.favorites) ? data.favorites.length : 0,
        remindersCount: Array.isArray(data.reminders) ? data.reminders.length : 0,
        followedCount: Array.isArray(data.followedSenders)
          ? data.followedSenders.length
          : 0,
        updatedAtLabel: updatedDate
          ? updatedDate.toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })
          : undefined,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function fetchAdminAllowlistForAdmin(): Promise<AdminRecordEntry[]> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.docs.map((d) => {
      const data = d.data() as {
        uid?: string;
        email?: string;
        grantedAt?: { toDate?: () => Date };
      };
      const granted =
        typeof data.grantedAt?.toDate === 'function'
          ? data.grantedAt.toDate()
          : null;
      return {
        uid: data.uid || d.id,
        email: data.email || '',
        grantedAtLabel: granted
          ? granted.toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : undefined,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admins');
  }
}

export async function grantAdminAccessInFirestore(
  uid: string,
  email: string
): Promise<void> {
  const cleanUid = sanitizeId(uid, 'admin');
  const cleanEmail = clampString(email.trim(), 160);
  if (cleanEmail.length < 3) {
    throw new Error('Enter a valid email address for the admin record.');
  }
  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      uid: cleanUid,
      email: cleanEmail,
      grantedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${cleanUid}`);
  }
}

export async function revokeAdminAccessInFirestore(uid: string): Promise<void> {
  const cleanUid = sanitizeId(uid, 'admin');
  try {
    await deleteDoc(doc(db, 'admins', cleanUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `admins/${cleanUid}`);
  }
}

export async function deleteUserAccountDataFromFirestore(
  uid: string
): Promise<void> {
  const cleanUid = sanitizeId(uid, 'user');
  try {
    await deleteDoc(doc(db, 'users', cleanUid, 'private', 'info')).catch(
      () => undefined
    );
    await deleteDoc(doc(db, 'fcmSubscriptions', cleanUid)).catch(
      () => undefined
    );
    await deleteDoc(doc(db, 'users', cleanUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${cleanUid}`);
  }
}

export async function recordUserLoginEventToFirestore(params: {
  id?: string;
  uid: string;
  displayName: string;
  eventType: 'login' | 'signup';
  provider: 'google' | 'password';
  platform?: string;
  createdAt?: string;
  timestampMs?: number;
}): Promise<UserLoginEvent> {
  const cleanUid = sanitizeId(params.uid, 'user');
  const loginId = sanitizeId(
    params.id || `auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    'auth'
  );
  const event: UserLoginEvent = {
    id: loginId,
    uid: cleanUid,
    displayName:
      clampString(params.displayName || 'Viewer', 60).trim() || 'Viewer',
    eventType: params.eventType === 'signup' ? 'signup' : 'login',
    provider: params.provider === 'password' ? 'password' : 'google',
    platform: clampString(params.platform || 'web', 40, 'web') || 'web',
    createdAt: clampString(
      params.createdAt ||
        new Date().toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      60
    ),
    timestampMs:
      typeof params.timestampMs === 'number' && params.timestampMs > 0
        ? params.timestampMs
        : Date.now(),
  };

  try {
    await setDoc(doc(db, 'userLogins', loginId), {
      ...event,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `userLogins/${loginId}`);
  }
  return event;
}

export async function fetchUserLoginsForAdmin(): Promise<UserLoginEvent[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'userLogins'),
        orderBy('timestampMs', 'desc'),
        limit(60)
      )
    );
    return snap.docs.map((d) => d.data() as UserLoginEvent);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'userLogins');
  }
}


