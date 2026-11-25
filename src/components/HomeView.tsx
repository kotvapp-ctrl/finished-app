import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  Channel,
  ContinueWatchingItem,
  HeroSlide,
  HomeConfig,
  HomeSectionKey,
  MovieItem,
  PromoConfig,
  StreamFormat,
} from '../types/broadcast';
import {
  DEFAULT_HOME_CONFIG,
  HERO_IMAGE,
  PROMO_IMAGE,
} from '../data/channels';
import { resolveStreamSource } from '../utils/streamUrl';
import { getRelayImageFallbackUrl, normalizeMediaAssetUrl } from '../utils/mediaAssets';
import { formatClockWithSeconds, formatShortDate } from '../utils/timeFormat';
import { sanitizeRtdbKey } from '../services/liveViewers';
import { ChannelCard } from './ChannelCard';
import { ChannelLogo } from './ChannelLogo';
import { AutoImagePreview } from './AutoImagePreview';

interface HomeViewProps {
  channels: Channel[];
  heroSlides: HeroSlide[];
  promo: PromoConfig;
  movies: MovieItem[];
  homeConfig?: HomeConfig;
  continueWatching?: ContinueWatchingItem[];
  enableMovies: boolean;
  favorites: Set<string>;
  activeChannelId?: string | null;
  viewerCounts?: Record<string, number>;
  heroAutoplay?: boolean;
  heroIntervalSec?: number;
  dataSaver?: boolean;
  networkNow: Date;
  isOnline: boolean;
  autoTimeSync: boolean;
  onSelectChannel: (
    channel: Channel,
    contextTitle?: string,
    overrideStreamUrl?: string,
    overrideStreamType?: StreamFormat
  ) => void;
  onRemoveContinueWatching?: (itemId: string) => void;
  onClearContinueWatching?: () => void;
  onToggleFavorite: (channelId: string) => void;
  onNavigateChannels: () => void;
  onNavigateMovies: () => void;
}

function formatPlayedAgo(playedAtMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - playedAtMs) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function HomeView({
  channels,
  heroSlides,
  promo,
  movies,
  homeConfig,
  continueWatching = [],
  enableMovies,
  favorites,
  activeChannelId = null,
  viewerCounts = {},
  heroAutoplay = true,
  heroIntervalSec = 6,
  dataSaver = false,
  networkNow,
  isOnline,
  autoTimeSync,
  onSelectChannel,
  onRemoveContinueWatching,
  onClearContinueWatching,
  onToggleFavorite,
  onNavigateChannels,
  onNavigateMovies,
}: HomeViewProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [heroMuted, setHeroMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [promoMuted, setPromoMuted] = useState(true);
  const [promoPaused, setPromoPaused] = useState(false);
  const [promoVideoReady, setPromoVideoReady] = useState(false);
  const promoVideoRef = useRef<HTMLVideoElement | null>(null);
  const promoHlsRef = useRef<Hls | null>(null);

  const safeIndex = activeSlideIndex < heroSlides.length ? activeSlideIndex : 0;
  const activeSlide: HeroSlide | undefined = heroSlides[safeIndex] || heroSlides[0];
  const linkedChannel =
    channels.find((c) => c.id === activeSlide?.channelId) || channels[0];

  const rawSlideStream = activeSlide
    ? activeSlide.useChannelStream
      ? linkedChannel?.streamUrl || ''
      : activeSlide.streamUrl || ''
    : '';

  const shouldPlayHeroVideo =
    Boolean(activeSlide) &&
    !dataSaver &&
    (activeSlide?.mediaMode === 'video' || Boolean(activeSlide?.useChannelStream)) &&
    Boolean(rawSlideStream.trim());

  const resolvedHeroStream = shouldPlayHeroVideo && activeSlide
    ? resolveStreamSource(
        rawSlideStream,
        activeSlide.streamType || linkedChannel?.streamType || 'auto',
        linkedChannel?.type || 'Television',
        Boolean(
          activeSlide.useRelayServer ||
            (activeSlide.useChannelStream && linkedChannel?.useRelayServer)
        )
      )
    : null;

  // Promo active stream resolution
  const linkedPromoChannel =
    channels.find((c) => c.id === promo.channelId) || channels[0];
  const rawPromoStream = promo.useChannelStream
    ? linkedPromoChannel?.streamUrl || ''
    : promo.streamUrl || '';
  const promoHasStream =
    (promo.mediaMode === 'video' || Boolean(promo.useChannelStream)) &&
    Boolean(rawPromoStream.trim());
  const shouldPlayPromoVideo = !dataSaver && promoHasStream;
  const resolvedPromoStream = shouldPlayPromoVideo
    ? resolveStreamSource(
        rawPromoStream,
        promo.streamType || linkedPromoChannel?.streamType || 'auto',
        linkedPromoChannel?.type || 'Television',
        Boolean(
          promo.useRelayServer ||
            (promo.useChannelStream && linkedPromoChannel?.useRelayServer)
        )
      )
    : null;
  const promoAutoplayEnabled = !dataSaver && promo.autoplayStream !== false;

  // Automatic Hero Carousel rotation
  useEffect(() => {
    if (!heroAutoplay || carouselPaused || heroSlides.length <= 1) return;
    const delay = Math.max(3, heroIntervalSec) * 1000;
    const timer = window.setInterval(() => {
      setActiveSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, delay);
    return () => window.clearInterval(timer);
  }, [heroAutoplay, heroIntervalSec, carouselPaused, heroSlides.length]);

  // Attach live video / HLS stream when slide uses video mode
  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setVideoReady(false);

    const video = videoRef.current;
    if (
      !video ||
      !resolvedHeroStream ||
      resolvedHeroStream.kind === 'embed' ||
      resolvedHeroStream.kind === 'audio'
    ) {
      return;
    }

    video.muted = heroMuted;

    if (resolvedHeroStream.kind === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(resolvedHeroStream.playableUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video
            .play()
            .then(() => setVideoReady(true))
            .catch(() => setVideoReady(false));
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) setVideoReady(false);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = resolvedHeroStream.playableUrl;
        video
          .play()
          .then(() => setVideoReady(true))
          .catch(() => setVideoReady(false));
      }
    } else {
      video.src = resolvedHeroStream.playableUrl;
      video
        .play()
        .then(() => setVideoReady(true))
        .catch(() => setVideoReady(false));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeSlide?.id, resolvedHeroStream?.kind, resolvedHeroStream?.playableUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = heroMuted;
    }
  }, [heroMuted]);

  // Attach live video / HLS stream for Hero Promo Card
  useEffect(() => {
    if (promoHlsRef.current) {
      promoHlsRef.current.destroy();
      promoHlsRef.current = null;
    }
    setPromoVideoReady(false);
    setPromoPaused(!promoAutoplayEnabled);

    const video = promoVideoRef.current;
    if (
      !video ||
      !resolvedPromoStream ||
      resolvedPromoStream.kind === 'embed' ||
      resolvedPromoStream.kind === 'audio'
    ) {
      return;
    }

    video.muted = promoMuted;

    const tryAutoplay = () => {
      if (!promoAutoplayEnabled) return;
      video
        .play()
        .then(() => {
          setPromoVideoReady(true);
          setPromoPaused(false);
        })
        .catch(() => {
          setPromoVideoReady(false);
          setPromoPaused(true);
        });
    };

    if (resolvedPromoStream.kind === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        promoHlsRef.current = hls;
        hls.loadSource(resolvedPromoStream.playableUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setPromoVideoReady(true);
          tryAutoplay();
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) setPromoVideoReady(false);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = resolvedPromoStream.playableUrl;
        tryAutoplay();
      }
    } else {
      video.src = resolvedPromoStream.playableUrl;
      tryAutoplay();
    }

    return () => {
      if (promoHlsRef.current) {
        promoHlsRef.current.destroy();
        promoHlsRef.current = null;
      }
    };
  }, [
    promoAutoplayEnabled,
    resolvedPromoStream?.kind,
    resolvedPromoStream?.playableUrl,
  ]);

  useEffect(() => {
    if (promoVideoRef.current) {
      promoVideoRef.current.muted = promoMuted;
    }
  }, [promoMuted]);

  const handleTogglePromoPlayback = () => {
    const video = promoVideoRef.current;
    if (!video) return;
    if (video.paused) {
      video
        .play()
        .then(() => {
          setPromoVideoReady(true);
          setPromoPaused(false);
        })
        .catch(() => {});
    } else {
      video.pause();
      setPromoPaused(true);
    }
  };

  const handlePlayPromo = () => {
    if (!linkedPromoChannel) return;
    if (
      promoHasStream &&
      !promo.useChannelStream &&
      promo.streamUrl?.trim()
    ) {
      onSelectChannel(
        linkedPromoChannel,
        promo.heading,
        promo.streamUrl,
        promo.streamType
      );
    } else {
      onSelectChannel(linkedPromoChannel, promo.heading);
    }
  };

  const handlePlaySlide = () => {
    if (!linkedChannel || !activeSlide) return;
    if (
      activeSlide.mediaMode === 'video' &&
      !activeSlide.useChannelStream &&
      activeSlide.streamUrl?.trim()
    ) {
      onSelectChannel(
        linkedChannel,
        activeSlide.title,
        activeSlide.streamUrl,
        activeSlide.streamType
      );
    } else {
      onSelectChannel(linkedChannel, activeSlide.title);
    }
  };

  const stepSlide = (delta: number) => {
    if (heroSlides.length <= 1) return;
    setActiveSlideIndex(
      (prev) => (prev + delta + heroSlides.length) % heroSlides.length
    );
  };

  const cfg: HomeConfig = { ...DEFAULT_HOME_CONFIG, ...homeConfig };
  const validKeys: HomeSectionKey[] = [
    'spotlight',
    'continueWatching',
    'channels',
    'movies',
  ];
  const sectionOrder: HomeSectionKey[] = [];
  for (const key of cfg.sectionOrder || []) {
    if (validKeys.includes(key) && !sectionOrder.includes(key)) {
      sectionOrder.push(key);
    }
  }
  for (const key of validKeys) {
    if (!sectionOrder.includes(key)) sectionOrder.push(key);
  }

  const orderedHomeChannels = (() => {
    const pinnedIds = cfg.featuredChannelIds || [];
    if (pinnedIds.length === 0) {
      return channels.slice(0, cfg.channelsCount);
    }
    const pinnedSet = new Set(pinnedIds);
    const pinned = pinnedIds
      .map((id) => channels.find((c) => c.id === id))
      .filter((c): c is Channel => Boolean(c));
    const rest = channels.filter((c) => !pinnedSet.has(c.id));
    return [...pinned, ...rest].slice(0, cfg.channelsCount);
  })();

  const homeMovies = (
    cfg.moviesFeaturedOnly ? movies.filter((m) => Boolean(m.featured)) : movies
  ).slice(0, cfg.moviesCount);

  const welcomeBannerChannel =
    channels.find((c) => c.id === cfg.welcomeBannerChannelId) || null;

  const renderSpotlightSection = () => {
    const showCarousel = cfg.showHeroCarousel && Boolean(activeSlide);
    if (!showCarousel && !promo.enabled) return null;
    return (
      <div
        key="spotlight"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
      >
        {showCarousel && activeSlide && (
          <div
            className={`${
              promo.enabled ? 'lg:col-span-8' : 'lg:col-span-12'
            } flex flex-col`}
            onMouseEnter={() => setCarouselPaused(true)}
            onMouseLeave={() => setCarouselPaused(false)}
          >
            <div className="relative flex-1 min-h-[360px] sm:min-h-[410px] rounded-2xl overflow-hidden bg-gradient-to-br from-[#52111b] via-[#2b1019] to-[#101016] border border-white/[0.06] flex items-end group">
            {/* Base Photo Backdrop (rendered only when slide photo is present) */}
            {activeSlide.imagePath?.trim() && (
              <img
                key={normalizeMediaAssetUrl(activeSlide.imagePath)}
                src={normalizeMediaAssetUrl(activeSlide.imagePath)}
                alt={activeSlide.title}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const relay = getRelayImageFallbackUrl(activeSlide.imagePath);
                  if (
                    relay &&
                    !e.currentTarget.dataset.relayed &&
                    e.currentTarget.src !== window.location.origin + relay
                  ) {
                    e.currentTarget.dataset.relayed = '1';
                    e.currentTarget.src = relay;
                    return;
                  }
                  if (
                    e.currentTarget.src !==
                    window.location.origin + HERO_IMAGE
                  ) {
                    e.currentTarget.src = HERO_IMAGE;
                  }
                }}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
              />
            )}

            {/* Active Stream / Video Layer for Video Slides */}
            {resolvedHeroStream &&
              resolvedHeroStream.kind === 'embed' && (
                <iframe
                  key={resolvedHeroStream.playableUrl}
                  src={resolvedHeroStream.playableUrl}
                  title={activeSlide.title}
                  className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              )}

            {resolvedHeroStream &&
              resolvedHeroStream.kind !== 'embed' &&
              resolvedHeroStream.kind !== 'audio' && (
                <video
                  ref={videoRef}
                  muted={heroMuted}
                  loop
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                    videoReady ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              )}

            <div className="absolute inset-0 bg-gradient-to-t from-[#101016] via-[#101016]/55 to-black/20" />

            {/* Top-right hero controls (mute for active video slide + pause autoplay) */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              {resolvedHeroStream &&
                resolvedHeroStream.kind !== 'embed' &&
                resolvedHeroStream.kind !== 'audio' && (
                  <button
                    type="button"
                    onClick={() => setHeroMuted((m) => !m)}
                    aria-label={heroMuted ? 'Unmute featured preview' : 'Mute featured preview'}
                    className="min-h-[40px] min-w-[40px] grid place-items-center rounded-xl bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm transition-colors"
                  >
                    {heroMuted ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                )}

              {heroSlides.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCarouselPaused((p) => !p)}
                  aria-label={
                    carouselPaused
                      ? 'Resume slide auto-play'
                      : 'Pause slide auto-play'
                  }
                  className="min-h-[40px] min-w-[40px] grid place-items-center rounded-xl bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm transition-colors"
                >
                  {carouselPaused ? (
                    <Play className="w-4 h-4 fill-current" />
                  ) : (
                    <Pause className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>

            {/* Prev / Next arrows on hover */}
            {heroSlides.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => stepSlide(-1)}
                  aria-label="Previous slide"
                  className="hidden sm:grid absolute left-3 top-1/2 -translate-y-1/2 z-20 min-h-[44px] min-w-[44px] place-items-center rounded-full bg-black/50 hover:bg-black/75 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => stepSlide(1)}
                  aria-label="Next slide"
                  className="hidden sm:grid absolute right-3 top-1/2 -translate-y-1/2 z-20 min-h-[44px] min-w-[44px] place-items-center rounded-full bg-black/50 hover:bg-black/75 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <div className="relative z-10 w-full p-6 sm:p-8 flex flex-col items-start">
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#ffd21f]">
                {activeSlide.kicker}
              </p>

              {activeSlide.badgeText ? (
                <div className="mt-3 inline-block px-4 py-2 bg-[#087b48] border-4 border-white -rotate-3 shadow-xl">
                  <span className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#ffe52b]">
                    {activeSlide.badgeText}
                  </span>
                </div>
              ) : (
                <h2 className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#f5f4f8] max-w-xl text-balance">
                  {activeSlide.title}
                </h2>
              )}

              <p className="mt-3 text-sm sm:text-base text-[#e4e2ec] max-w-lg leading-relaxed">
                {activeSlide.subtitle}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handlePlaySlide}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {cfg.heroCtaLabel || 'Watch live'}
                </button>
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-center gap-2.5 mt-4"
            role="tablist"
            aria-label="Featured programmes"
          >
            {heroSlides.map((slide, idx) => {
              const isActive = idx === safeIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Show slide ${idx + 1}: ${slide.title}`}
                  onClick={() => setActiveSlideIndex(idx)}
                  className="min-h-[32px] px-1 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#1685ff] rounded"
                >
                  <span
                    className={`block h-2.5 rounded-full transition-all duration-200 ${
                      isActive
                        ? 'w-7 bg-[#ffd21f]'
                        : 'w-2.5 bg-[#41414b] hover:bg-[#626270]'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>
        )}

        {promo.enabled && (
          <div
            className={`${
              showCarousel ? 'lg:col-span-4' : 'lg:col-span-12'
            } flex`}
          >
            <div className="relative w-full rounded-2xl overflow-hidden border border-[#4a3d1a] bg-gradient-to-br from-[#2a1d08] via-[#1b1710] to-[#15151b] p-6 flex flex-col justify-between min-h-[200px]">
              {promo.imagePath?.trim() && (
                <img
                  key={normalizeMediaAssetUrl(promo.imagePath)}
                  src={normalizeMediaAssetUrl(promo.imagePath)}
                  alt={promo.heading}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const relay = getRelayImageFallbackUrl(promo.imagePath);
                    if (
                      relay &&
                      !e.currentTarget.dataset.relayed &&
                      e.currentTarget.src !== window.location.origin + relay
                    ) {
                      e.currentTarget.dataset.relayed = '1';
                      e.currentTarget.src = relay;
                      return;
                    }
                    if (
                      e.currentTarget.src !==
                      window.location.origin + PROMO_IMAGE
                    ) {
                      e.currentTarget.src = PROMO_IMAGE;
                    }
                  }}
                  className="absolute inset-0 w-full h-full object-cover opacity-30"
                />
              )}

              {resolvedPromoStream &&
                resolvedPromoStream.kind === 'embed' &&
                !promoPaused && (
                  <iframe
                    key={resolvedPromoStream.playableUrl}
                    src={resolvedPromoStream.playableUrl}
                    title={promo.heading}
                    className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                )}

              {resolvedPromoStream &&
                resolvedPromoStream.kind !== 'embed' &&
                resolvedPromoStream.kind !== 'audio' && (
                  <video
                    ref={promoVideoRef}
                    muted={promoMuted}
                    autoPlay={promoAutoplayEnabled}
                    loop
                    playsInline
                    onPlay={() => {
                      setPromoVideoReady(true);
                      setPromoPaused(false);
                    }}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                      promoVideoReady ? 'opacity-90' : 'opacity-0'
                    }`}
                  />
                )}

              <div className="absolute inset-0 bg-gradient-to-t from-[#15151b]/95 via-[#1b1710]/75 to-[#2a1d08]/60" />

              {resolvedPromoStream && resolvedPromoStream.kind !== 'audio' && (
                <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (resolvedPromoStream.kind === 'embed') {
                        setPromoPaused((p) => !p);
                      } else {
                        handleTogglePromoPlayback();
                      }
                    }}
                    aria-label={
                      promoPaused ? 'Play promo stream' : 'Pause promo stream'
                    }
                    className="min-h-[36px] min-w-[36px] grid place-items-center rounded-xl bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm transition-colors"
                  >
                    {promoPaused ? (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {resolvedPromoStream.kind !== 'embed' && (
                    <button
                      type="button"
                      onClick={() => setPromoMuted((m) => !m)}
                      aria-label={
                        promoMuted ? 'Unmute promo stream' : 'Mute promo stream'
                      }
                      className="min-h-[36px] min-w-[36px] grid place-items-center rounded-xl bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm transition-colors"
                    >
                      {promoMuted ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              )}

              <div className="relative z-10 flex items-start gap-4 lg:flex-col">
                <div className="w-24 h-24 rounded-2xl border-2 border-[#ffd21f] bg-[#101016]/70 grid place-items-center text-center p-2 shrink-0">
                  <span className="font-display text-xs font-extrabold leading-tight text-[#ffd21f] uppercase">
                    {promo.badgeText}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-xl font-bold text-[#ffd21f] text-balance">
                    {promo.heading}
                  </h3>
                  <p className="text-sm text-[#e4e2ec] mt-2 leading-relaxed">
                    {promo.description}
                  </p>
                </div>
              </div>

              <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
                {promoHasStream && (
                  <button
                    type="button"
                    onClick={handlePlayPromo}
                    className="min-h-[44px] flex-1 px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Watch live</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onNavigateChannels}
                  className={`min-h-[44px] ${
                    promoHasStream ? 'px-3.5' : 'w-full px-4'
                  } py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[#f5f4f8] text-sm font-semibold flex items-center justify-between gap-2 transition-colors whitespace-nowrap`}
                >
                  <span>
                    {promoHasStream ? 'Lineup' : 'Browse full lineup'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#ffd21f]" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContinueWatchingSection = () => {
    if (!cfg.showContinueWatching || continueWatching.length === 0) return null;
    return (
      <section
        key="continueWatching"
        aria-labelledby="continue-watching-heading"
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2
              id="continue-watching-heading"
              className="font-display text-xl sm:text-2xl font-bold text-[#f5f4f8]"
            >
              {cfg.continueWatchingTitle}
            </h2>
            {cfg.continueWatchingSubtitle && (
              <p className="text-sm text-[#a5a3b2] mt-0.5">
                {cfg.continueWatchingSubtitle}
              </p>
            )}
          </div>
          {onClearContinueWatching && (
            <button
              type="button"
              onClick={onClearContinueWatching}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#30303d] border border-white/10 text-sm font-semibold text-[#f5f4f8] whitespace-nowrap transition-colors"
            >
              Clear history
            </button>
          )}
        </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {continueWatching.slice(0, 5).map((item) => {
              const latestChannel =
                channels.find((c) => c.id === item.channelId) || channels[0];
              const latestMovie =
                item.kind === 'movie'
                  ? movies.find((m) => `movie:${m.id}` === item.id)
                  : undefined;
              const posterUrl = normalizeMediaAssetUrl(
                latestMovie?.posterPath ?? item.posterPath
              );
              const isLiveChannel =
                item.kind === 'channel' &&
                (Boolean(latestChannel?.streamUrl?.trim()) ||
                  activeChannelId === item.channelId);

              const handleResume = () => {
                if (!latestChannel) return;
                if (item.kind === 'movie') {
                  onSelectChannel(
                    latestChannel,
                    latestMovie?.title ?? item.title,
                    latestMovie?.streamUrl ?? item.overrideStreamUrl,
                    latestMovie?.streamType ?? item.overrideStreamType
                  );
                } else {
                  onSelectChannel(
                    latestChannel,
                    item.overrideStreamUrl ? item.title : undefined,
                    item.overrideStreamUrl,
                    item.overrideStreamType
                  );
                }
              };

              return (
                <article
                  key={item.id}
                  className="group relative w-[260px] sm:w-[280px] shrink-0 bg-[#1d1d26] hover:bg-[#23232e] rounded-2xl overflow-hidden border border-white/[0.06] transition-colors duration-150"
                >
                  <button
                    type="button"
                    onClick={handleResume}
                    className="w-full text-left focus-visible:outline-2 focus-visible:outline-[#1685ff] rounded-2xl"
                  >
                    <div className="relative aspect-[16/9] bg-gradient-to-br from-[#232330] via-[#181822] to-[#101016] overflow-hidden">
                      {item.kind === 'movie' ? (
                        <AutoImagePreview
                          src={posterUrl}
                          alt={item.title}
                          className="w-full h-full bg-transparent"
                          imgClassName="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                          fallbackNode={
                            <div className="w-full h-full p-4 flex flex-col justify-center bg-gradient-to-br from-[#2a1d08] via-[#1b1710] to-[#101016]">
                              <Film className="w-6 h-6 text-[#ffd21f]/70 mb-1.5" />
                              <p className="font-display text-sm font-bold text-[#f5f4f8] line-clamp-2">
                                {item.title}
                              </p>
                            </div>
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#20202b] via-[#161620] to-[#101016]">
                          <ChannelLogo
                            brand={latestChannel?.brand ?? item.brand}
                            name={latestChannel?.name ?? item.channelName}
                            size="md"
                            iconUrl={latestChannel?.iconUrl}
                            type={latestChannel?.type}
                            defaultStationIconUrl={homeConfig?.stationIconUrl}
                            defaultRadioIconUrl={homeConfig?.radioIconUrl}
                          />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-[#101016]/85 via-black/15 to-transparent" />

                      <span className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-[#ffd21f] text-[#101016] grid place-items-center shadow-md group-hover:scale-105 transition-transform">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </span>
                    </div>

                    <div className="p-3.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-sm font-bold text-[#f5f4f8] truncate">
                          {item.title}
                        </h3>
                        {isLiveChannel && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#d4162a] text-white text-[10px] font-extrabold tracking-[0.08em] uppercase leading-none whitespace-nowrap shrink-0">
                            LIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#a5a3b2] truncate mt-1">
                        <span>
                          {item.kind === 'movie' ? 'Movie' : 'Channel'}
                        </span>
                        {item.subtitle && (
                          <>
                            <span aria-hidden="true" className="mx-1.5">
                              ·
                            </span>
                            <span>{item.subtitle}</span>
                          </>
                        )}
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span className="font-mono-tabular">
                          {formatPlayedAgo(item.playedAtMs, networkNow.getTime())}
                        </span>
                      </p>
                    </div>
                  </button>

                  {onRemoveContinueWatching && (
                    <button
                      type="button"
                      onClick={() => onRemoveContinueWatching(item.id)}
                      aria-label={`Remove ${item.title} from continue watching`}
                      className="absolute top-1 right-1 z-10 min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-[#f5f4f8] opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      <span className="w-8 h-8 rounded-lg bg-black/60 hover:bg-black/85 grid place-items-center">
                        <X className="w-4 h-4" />
                      </span>
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
    );
  };

  const renderChannelsSection = () => {
    if (!cfg.showChannelsSection) return null;
    return (
      <section key="channels" aria-labelledby="popular-channels-heading">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2
              id="popular-channels-heading"
              className="font-display text-xl sm:text-2xl font-bold text-[#f5f4f8]"
            >
              {cfg.channelsTitle}
            </h2>
            <p className="text-sm text-[#a5a3b2] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {cfg.channelsSubtitle && (
                <>
                  <span>{cfg.channelsSubtitle}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="font-mono-tabular text-[#ffd21f]">
                {formatClockWithSeconds(networkNow)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatShortDate(networkNow)}</span>
              {!isOnline && autoTimeSync && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Offline</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateChannels}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#30303d] border border-white/10 text-sm font-semibold text-[#f5f4f8] whitespace-nowrap transition-colors"
          >
            {cfg.channelsActionLabel || 'View all'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orderedHomeChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              isFavorite={favorites.has(channel.id)}
              isActive={activeChannelId === channel.id}
              viewerCount={viewerCounts[sanitizeRtdbKey(channel.id)] ?? 0}
              defaultStationIconUrl={homeConfig?.stationIconUrl}
              defaultRadioIconUrl={homeConfig?.radioIconUrl}
              onSelect={onSelectChannel}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      </section>
    );
  };

  const renderMoviesSection = () => {
    if (!enableMovies || !cfg.showMoviesSection || homeMovies.length === 0) {
      return null;
    }
    return (
      <section key="movies" aria-labelledby="home-movies-heading">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2
              id="home-movies-heading"
              className="font-display text-xl sm:text-2xl font-bold text-[#f5f4f8]"
            >
              {cfg.moviesTitle}
            </h2>
            {cfg.moviesSubtitle && (
              <p className="text-sm text-[#a5a3b2] mt-0.5">
                {cfg.moviesSubtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onNavigateMovies}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#30303d] border border-white/10 text-sm font-semibold text-[#f5f4f8] whitespace-nowrap transition-colors"
          >
            {cfg.moviesActionLabel || 'Browse movies'}
          </button>
        </div>

        <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2">
          {homeMovies.map((movie) => {
              const targetChannel =
                channels.find((c) => c.id === movie.channelId) || channels[0];
              return (
                <button
                  key={movie.id}
                  type="button"
                  onClick={() => {
                    if (targetChannel) {
                      onSelectChannel(
                        targetChannel,
                        movie.title,
                        movie.streamUrl,
                        movie.streamType
                      );
                    }
                  }}
                  className="group w-[156px] sm:w-[180px] shrink-0 text-left focus-visible:outline-2 focus-visible:outline-[#1685ff] rounded-2xl"
                >
                  <div className="relative w-full aspect-[2/3] rounded-2xl overflow-hidden bg-gradient-to-br from-[#2a1d08] via-[#1b1710] to-[#101016] border border-white/[0.08]">
                    <AutoImagePreview
                      src={movie.posterPath || cfg.movieAutoArtUrl}
                      alt={movie.title}
                      className="w-full h-full bg-transparent"
                      imgClassName="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                      fallbackNode={
                        <div className="w-full h-full p-3.5 flex flex-col justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#ffd21f]">
                            {movie.genre}
                          </span>
                          <div>
                            <Film className="w-6 h-6 text-white/30 mb-1.5" />
                            <p className="font-display text-base font-extrabold text-[#f5f4f8] leading-snug">
                              {movie.title}
                            </p>
                          </div>
                        </div>
                      }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#101016] via-[#101016]/30 to-transparent pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-[#ffd21f] font-semibold truncate">
                          {movie.genre}
                        </p>
                        <p className="text-xs font-bold text-[#f5f4f8] line-clamp-2 mt-0.5">
                          {movie.title}
                        </p>
                      </div>
                      <span className="w-8 h-8 rounded-full bg-[#ffd21f] text-[#101016] grid place-items-center shrink-0">
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-[#a5a3b2] mt-2 truncate px-0.5">
                    <span className="font-mono-tabular">{movie.year}</span>
                    <span aria-hidden="true" className="mx-1.5">
                      ·
                    </span>
                    <span className="font-mono-tabular">{movie.duration}</span>
                  </p>
                </button>
              );
            })}
          </div>
        </section>
    );
  };

  const sectionRenderers: Record<HomeSectionKey, () => ReturnType<typeof renderSpotlightSection>> = {
    spotlight: renderSpotlightSection,
    continueWatching: renderContinueWatchingSection,
    channels: renderChannelsSection,
    movies: renderMoviesSection,
  };

  const hasVisibleSection =
    (cfg.showHeroCarousel && Boolean(activeSlide)) ||
    promo.enabled ||
    (cfg.showContinueWatching && continueWatching.length > 0) ||
    cfg.showChannelsSection ||
    (enableMovies && cfg.showMoviesSection && homeMovies.length > 0) ||
    (cfg.welcomeBannerEnabled && Boolean(cfg.welcomeBannerTitle.trim()));

  return (
    <div className="space-y-8">
      {cfg.welcomeBannerEnabled && cfg.welcomeBannerTitle.trim() && (
        <section
          aria-label={cfg.welcomeBannerKicker || 'Station spotlight'}
          className="rounded-2xl bg-[#1d1d26] border border-white/[0.08] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="min-w-0">
            {cfg.welcomeBannerKicker.trim() && (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ffd21f]">
                {cfg.welcomeBannerKicker}
              </p>
            )}
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#f5f4f8] mt-1 text-balance">
              {cfg.welcomeBannerTitle}
            </h2>
            {cfg.welcomeBannerBody.trim() && (
              <p className="text-sm text-[#c9c7d2] mt-1 leading-relaxed">
                {cfg.welcomeBannerBody}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (welcomeBannerChannel) {
                onSelectChannel(welcomeBannerChannel);
              } else {
                onNavigateChannels();
              }
            }}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{cfg.welcomeBannerCtaLabel || 'Watch now'}</span>
          </button>
        </section>
      )}

      {sectionOrder.map((key) => sectionRenderers[key]())}

      {!hasVisibleSection && (
        <div className="rounded-2xl bg-[#1d1d26] border border-white/[0.06] p-8 text-center">
          <p className="font-display text-lg font-bold text-[#f5f4f8]">
            Home screen sections are currently hidden
          </p>
          <p className="text-sm text-[#a5a3b2] mt-1">
            Browse channels from the lineup or enable sections in the Admin Control Panel.
          </p>
          <button
            type="button"
            onClick={onNavigateChannels}
            className="mt-4 min-h-[44px] px-5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm font-bold transition-colors"
          >
            Browse channels
          </button>
        </div>
      )}
    </div>
  );
}
