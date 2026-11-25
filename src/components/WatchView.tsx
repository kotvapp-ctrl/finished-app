import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FastForward,
  Heart,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  Rewind,
  Share2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import {
  ArchiveItem,
  Channel,
  ChatMessage,
  GuideProgramme,
  HomeConfig,
  MovieItem,
  StreamFormat,
} from '../types/broadcast';
import { HERO_IMAGE, PROMO_IMAGE, STUDIO_IMAGE } from '../data/channels';
import {
  buildChannelShareUrl,
  normalizeMediaAssetUrl,
} from '../utils/mediaAssets';
import { AutoImagePreview } from './AutoImagePreview';
import { resolveStreamSource } from '../utils/streamUrl';
import {
  getLiveHourSlots,
  isDefaultSlotPlaceholder,
} from '../utils/timeFormat';
import { ChannelLogo } from './ChannelLogo';
import { StreamChatSection } from './StreamChatSection';
import {
  sanitizeRtdbKey,
  useChannelLivePresence,
} from '../services/liveViewers';
import { resolveCloudFilePlayableUrl } from '../services/cloudStorage';

interface WatchViewProps {
  channel: Channel;
  channels: Channel[];
  guideSchedule: GuideProgramme[];
  archiveItems: ArchiveItem[];
  movies?: MovieItem[];
  homeConfig?: HomeConfig;
  favorites: Set<string>;
  reminders: Set<string>;
  viewerName: string;
  currentUserId?: string;
  isSignedIn: boolean;
  isFirebaseConnected?: boolean;
  isAdmin?: boolean;
  networkNow: Date;
  autoTimeSync: boolean;
  chatMessages: ChatMessage[];
  followedSenders: Set<string>;
  viewerCounts?: Record<string, number>;
  autoplay?: boolean;
  dataSaver?: boolean;
  isOnline?: boolean;
  contextTitle?: string;
  overrideStreamUrl?: string;
  overrideStreamType?: StreamFormat;
  onRequestSignIn: () => void;
  onSelectChannel: (
    channel: Channel,
    contextTitle?: string,
    overrideStreamUrl?: string,
    overrideStreamType?: StreamFormat
  ) => void;
  onToggleFavorite: (channelId: string) => void;
  onToggleReminder: (key: string) => void;
  onSendChatMessage: (
    channelId: string,
    text: string,
    replyTo?: ChatMessage['replyTo'],
    streamKey?: string
  ) => void;
  onToggleLikeMessage: (messageId: string) => void;
  onToggleFollowSender: (senderId: string) => void;
  onDeleteChatMessage?: (messageId: string) => void;
  onNavigatePage: (page: 'home' | 'channels' | 'guide' | 'movies' | 'more') => void;
  onOpenControlPanel?: (
    section: 'archive' | 'library' | 'movies',
    itemId?: string
  ) => void;
  onClose: () => void;
}

function EqualizerBars() {
  return (
    <span
      className="inline-flex items-end gap-[2.5px] h-4 shrink-0 text-[#ffd21f]"
      aria-hidden="true"
    >
      <span className="w-[2.5px] h-2 bg-current rounded-full" />
      <span className="w-[2.5px] h-4 bg-current rounded-full" />
      <span className="w-[2.5px] h-2.5 bg-current rounded-full" />
      <span className="w-[2.5px] h-3.5 bg-current rounded-full" />
    </span>
  );
}

const SLEEP_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '60m', minutes: 60 },
];

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

export function WatchView({
  channel,
  channels,
  guideSchedule,
  archiveItems,
  movies = [],
  homeConfig,
  favorites,
  reminders,
  viewerName,
  currentUserId,
  isSignedIn,
  isFirebaseConnected = false,
  isAdmin = false,
  networkNow,
  autoTimeSync,
  chatMessages,
  followedSenders,
  viewerCounts = {},
  autoplay = true,
  dataSaver = false,
  isOnline = true,
  contextTitle,
  overrideStreamUrl,
  overrideStreamType,
  onRequestSignIn,
  onSelectChannel,
  onToggleFavorite,
  onToggleReminder,
  onSendChatMessage,
  onToggleLikeMessage,
  onToggleFollowSender,
  onDeleteChatMessage,
  onNavigatePage,
  onOpenControlPanel,
  onClose,
}: WatchViewProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [theaterMode, setTheaterMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showControlsMenu, setShowControlsMenu] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLevels, setQualityLevels] = useState<
    { index: number; label: string }[]
  >([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepRemainingSec, setSleepRemainingSec] = useState(0);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [useRelayFallback, setUseRelayFallback] = useState(false);
  const [resolvedVaultUrl, setResolvedVaultUrl] = useState<string>('');

  const rawStreamUrl = (overrideStreamUrl ?? channel.streamUrl ?? '').trim();
  const isAlreadyBlob = rawStreamUrl.startsWith('blob:');
  const isVaultUri = rawStreamUrl.startsWith('vault://');
  const effectivePlayableRawUrl = isVaultUri ? resolvedVaultUrl : rawStreamUrl;
  const preferredType: StreamFormat =
    overrideStreamType ?? channel.streamType ?? 'auto';
  const useStreamingServer =
    !isAlreadyBlob && (Boolean(channel.useRelayServer) || useRelayFallback);

  useEffect(() => {
    let active = true;
    if (!isVaultUri) {
      setResolvedVaultUrl('');
      return;
    }
    setStatusMessage('Loading media from Cloud Vault...');
    resolveCloudFilePlayableUrl(rawStreamUrl)
      .then((blobUrl) => {
        if (active) setResolvedVaultUrl(blobUrl);
      })
      .catch((err) => {
        if (active) {
          setStreamError(
            err instanceof Error
              ? err.message
              : 'Unable to load file from Cloud Vault.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, [rawStreamUrl, isVaultUri]);

  const resolved = resolveStreamSource(
    effectivePlayableRawUrl,
    preferredType,
    channel.type,
    useStreamingServer
  );
  const activeStreamKey = rawStreamUrl
    ? `${channel.id}::${rawStreamUrl}`
    : channel.id;
  const isVodStream =
    Boolean(overrideStreamUrl?.trim()) &&
    (isAlreadyBlob ||
      movies.some((m) => m.streamUrl?.trim() === overrideStreamUrl?.trim()) ||
      archiveItems.some(
        (a) => a.mediaUrl?.trim() === overrideStreamUrl?.trim()
      ));
  const isLiveTvStreamActive =
    channel.type === 'Television' &&
    Boolean(resolved) &&
    !streamError &&
    !isVodStream;
  const liveViewerCount = useChannelLivePresence(
    channel.id,
    isLiveTvStreamActive
  );
  const currentChannelIndex = channels.findIndex((c) => c.id === channel.id);

  const {
    currentHourLabel,
    nextHourLabel,
    lateHourLabel,
    minutesRemaining,
  } = getLiveHourSlots(networkNow);

  const scheduleEntry = guideSchedule.find((g) => g.channelId === channel.id);
  const activeTitle =
    contextTitle || scheduleEntry?.currentTitle || channel.program || channel.name;
  const currentSlotTime =
    autoTimeSync && isDefaultSlotPlaceholder(scheduleEntry?.currentTime)
      ? currentHourLabel
      : scheduleEntry?.currentTime || '6:00 pm';
  const nextSlotTitle = scheduleEntry?.nextTitle || 'Up Next Broadcast';
  const nextSlotTime =
    autoTimeSync && isDefaultSlotPlaceholder(scheduleEntry?.nextTime)
      ? nextHourLabel
      : scheduleEntry?.nextTime || '7:00 pm';
  const lateSlotTime = autoTimeSync ? lateHourLabel : '11:30 pm';
  const nextReminderKey = `0:${channel.id}:${nextSlotTitle}`;
  const hasNextReminder = reminders.has(nextReminderKey);
  const isFav = favorites.has(channel.id);

  useEffect(() => {
    setStreamError(null);
    setStatusMessage(null);
    setUseRelayFallback(false);
    setIsPlaying(false);
    setQualityLevels([]);
    setCurrentQuality(-1);
    setShowControlsMenu(false);
  }, [channel.id, rawStreamUrl]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepMinutes <= 0) {
      setSleepRemainingSec(0);
      return;
    }
    setSleepRemainingSec(sleepMinutes * 60);
    const interval = window.setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
          if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
          }
          setIsPlaying(false);
          setSleepMinutes(0);
          setStatusMessage('Playback paused by sleep timer.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [sleepMinutes]);

  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!resolved) return;
    setStreamError(null);

    if (resolved.kind === 'embed') {
      setStatusMessage('Now playing');
      setIsPlaying(true);
      return;
    }

    if (resolved.kind === 'audio') {
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = resolved.playableUrl;
      audio.volume = volume;
      audio.muted = isMuted;
      audio.playbackRate = playbackRate;
      if (!autoplay) {
        setIsPlaying(false);
        setStatusMessage('Ready to play · Tap Play to listen');
        return;
      }
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setStatusMessage('Now playing');
        })
        .catch(() => {
          setIsPlaying(false);
          setStatusMessage('Ready to play');
        });
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = isMuted;
    video.playbackRate = playbackRate;

    if (resolved.kind === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls(
          dataSaver
            ? {
                enableWorker: true,
                capLevelToPlayerSize: true,
                maxBufferLength: 12,
                maxMaxBufferLength: 20,
                startLevel: 0,
              }
            : { enableWorker: true }
        );
        hlsRef.current = hls;
        hls.loadSource(resolved.playableUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          const levels = (data.levels || []).map((lvl, idx) => ({
            index: idx,
            label: lvl.height ? `${lvl.height}p` : `Level ${idx + 1}`,
          }));
          setQualityLevels(levels);
          if (dataSaver && levels.length > 0) {
            hls.currentLevel = 0;
            setCurrentQuality(0);
          }
          if (!autoplay) {
            setIsPlaying(false);
            setStatusMessage('Ready to play · Tap Play to watch');
            return;
          }
          video
            .play()
            .then(() => {
              setIsPlaying(true);
              setStatusMessage(
                useStreamingServer
                  ? 'Live broadcast · Station Streaming Server'
                  : 'Live broadcast'
              );
            })
            .catch(() => {
              setIsPlaying(false);
              setStatusMessage('Ready to play');
            });
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (!useStreamingServer && rawStreamUrl) {
              setUseRelayFallback(true);
              setStatusMessage('Connecting via Station Streaming Server...');
              return;
            }
            setStreamError('Broadcast temporarily unavailable.');
            setIsPlaying(false);
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = resolved.playableUrl;
        if (!autoplay) {
          setIsPlaying(false);
          setStatusMessage('Ready to play · Tap Play to watch');
        } else {
          video
            .play()
            .then(() => {
              setIsPlaying(true);
              if (useStreamingServer) {
                setStatusMessage('Live broadcast · Station Streaming Server');
              }
            })
            .catch(() => setIsPlaying(false));
        }
      } else {
        setStreamError('Playback is not supported in this browser.');
      }
    } else {
      video.src = resolved.playableUrl;
      if (!autoplay) {
        setIsPlaying(false);
        setStatusMessage('Ready to play · Tap Play to watch');
      } else {
        video
          .play()
          .then(() => {
            setIsPlaying(true);
            setStatusMessage(
              useStreamingServer
                ? 'Now playing · Station Streaming Server'
                : 'Now playing'
            );
          })
          .catch(() => {
            setIsPlaying(false);
            setStatusMessage('Ready to play');
          });
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel.id, resolved?.kind, resolved?.playableUrl, autoplay, dataSaver]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleTogglePlay = () => {
    if (!resolved) {
      setStatusMessage(
        `${channel.name} broadcast is currently on stand-by.`
      );
      return;
    }
    if (resolved.kind === 'embed') return;

    const mediaEl =
      resolved.kind === 'audio' ? audioRef.current : videoRef.current;
    if (!mediaEl) return;

    if (mediaEl.paused) {
      mediaEl
        .play()
        .then(() => {
          setIsPlaying(true);
          if (resolved.kind !== 'audio') {
            setShowControlsMenu(false);
          }
        })
        .catch(() =>
          setStreamError('Broadcast temporarily unavailable.')
        );
    } else {
      mediaEl.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (deltaSeconds: number) => {
    const mediaEl =
      resolved?.kind === 'audio' ? audioRef.current : videoRef.current;
    if (!mediaEl || !Number.isFinite(mediaEl.duration)) return;
    mediaEl.currentTime = Math.max(
      0,
      Math.min(mediaEl.duration, mediaEl.currentTime + deltaSeconds)
    );
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
    if (audioRef.current) audioRef.current.muted = next;
  };

  const handleVolumeChange = (nextVolume: number) => {
    setVolume(nextVolume);
    const muted = nextVolume === 0;
    setIsMuted(muted);
    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = muted;
    }
    if (audioRef.current) {
      audioRef.current.volume = nextVolume;
      audioRef.current.muted = muted;
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const handleQualityChange = (levelIndex: number) => {
    setCurrentQuality(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
  };

  const handlePiP = async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      setStatusMessage('Picture-in-Picture is unavailable for this stream.');
    }
  };

  const handleFullscreen = async () => {
    const stage = stageRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (stage?.requestFullscreen) {
        await stage.requestFullscreen();
        return;
      }
      if (video?.requestFullscreen) {
        await video.requestFullscreen();
        return;
      }
      if (typeof video?.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
      }
    } catch {
      if (typeof video?.webkitEnterFullscreen === 'function') {
        try {
          video.webkitEnterFullscreen();
        } catch {
          // Ignore unsupported fullscreen
        }
      }
    }
  };

  const handleZapChannel = (delta: number) => {
    if (channels.length === 0) return;
    const nextIndex =
      (currentChannelIndex + delta + channels.length) % channels.length;
    onSelectChannel(channels[nextIndex]);
  };

  const handleShare = async () => {
    const shareUrl = buildChannelShareUrl(channel.id);
    if (!shareUrl) return;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${channel.name} · Kakumiro Online TV`,
          text: `Watch ${activeTitle} on ${channel.name}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fall through to clipboard copy
      }
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
    setCopiedNotice(true);
    window.setTimeout(() => setCopiedNotice(false), 2000);
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const relatedItems = archiveItems.length > 0 ? archiveItems : [];
  const relatedCovers = [HERO_IMAGE, STUDIO_IMAGE, PROMO_IMAGE].map((src) =>
    normalizeMediaAssetUrl(src)
  );

  return (
    <div
      className="fixed inset-0 z-40 bg-[#101016] text-[#f5f4f8] overflow-y-auto"
      role="region"
      aria-label={`Watching ${channel.name}`}
    >
      {/* Top Action Bar on Mobile / Desktop Header */}
      <div className="sticky top-0 z-30 bg-[#101016]/90 backdrop-blur-md border-b border-white/[0.06] px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to browse"
            className="min-h-[44px] min-w-[44px] -ml-2 grid place-items-center rounded-xl text-[#f5f4f8] hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#f5f4f8] truncate">
              {channel.name}
            </p>
            <p className="text-xs text-[#a5a3b2] truncate">
              {activeTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {isLiveTvStreamActive && liveViewerCount > 0 && (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1d1d26] border border-white/[0.08] text-[11px] sm:text-xs font-semibold text-[#f5f4f8] select-none"
              aria-label={`${liveViewerCount} live ${
                liveViewerCount === 1 ? 'viewer' : 'viewers'
              } watching`}
            >
              <Eye className="w-3.5 h-3.5 text-[#ffd21f] shrink-0" />
              <span className="font-mono-tabular">
                {liveViewerCount.toLocaleString()}
              </span>
              <span className="text-[#a5a3b2] font-medium">watching</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onToggleFavorite(channel.id)}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            className={`min-h-[44px] min-w-[44px] grid place-items-center rounded-xl transition-colors ${
              isFav
                ? 'text-[#ffd21f] bg-[#ffd21f]/10'
                : 'text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06]'
            }`}
          >
            <Heart className="w-5 h-5" fill={isFav ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share channel"
            className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06] transition-colors"
          >
            {copiedNotice ? (
              <Check className="w-5 h-5 text-[#ffd21f]" />
            ) : (
              <Share2 className="w-5 h-5" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Spacious Video Stage + Discovery Rails */}
      <div className="max-w-7xl mx-auto lg:px-8 pb-12">
        <div
          className={`grid grid-cols-1 ${
            theaterMode ? '' : 'lg:grid-cols-12 lg:gap-7 lg:pt-6'
          }`}
        >
          {/* Left / Primary Column: Video Player + Programme Details + Rails */}
          <div
            className={`${
              theaterMode ? 'lg:pt-4' : 'lg:col-span-8'
            } min-w-0 space-y-6`}
          >
            {/* Full-bleed Video Playing Stage */}
            <div
              ref={stageRef}
              className="relative aspect-video bg-black lg:rounded-2xl overflow-hidden border-b lg:border border-white/[0.08]"
            >
              {!resolved ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-[#191923] via-[#101016] to-black">
                  <img
                    src={normalizeMediaAssetUrl(STUDIO_IMAGE)}
                    alt={`${channel.name} studio backdrop`}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover opacity-30"
                  />
                  <div className="relative z-10 flex flex-col items-center max-w-md">
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      aria-label="Check stream status"
                      className="w-16 h-16 rounded-full bg-[#ffd21f] text-[#101016] grid place-items-center shadow-lg hover:bg-[#ffe055] transition-colors mb-3"
                    >
                      <Play className="w-7 h-7 fill-current ml-0.5" />
                    </button>
                    <p className="text-base sm:text-lg font-semibold text-[#f5f4f8]">
                      {channel.type === 'Radios'
                        ? 'Visual Radio Stand-by'
                        : 'Stream Stand-by'}
                    </p>
                    <p className="text-xs sm:text-sm text-[#c9c7d2] mt-1.5 leading-relaxed">
                      Broadcast stream for {channel.name} is preparing to go live.
                    </p>
                  </div>
                </div>
              ) : !isOnline ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-[#191923] via-[#101016] to-black">
                  <div className="w-14 h-14 rounded-full bg-[#ffd21f]/15 text-[#ffd21f] grid place-items-center mb-3">
                    <WifiOff className="w-7 h-7" />
                  </div>
                  <p className="text-base sm:text-lg font-semibold text-[#f5f4f8]">
                    No internet connection
                  </p>
                  <p className="text-xs sm:text-sm text-[#c9c7d2] mt-1.5 max-w-md leading-relaxed">
                    Live broadcasts and streams require an active internet connection. Reconnect to resume watching.
                  </p>
                </div>
              ) : resolved.kind === 'embed' ? (
                <iframe
                  key={resolved.playableUrl}
                  src={resolved.playableUrl}
                  title={`${channel.name} live player`}
                  className="w-full h-full border-0 bg-black"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : resolved.kind === 'audio' ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-[#191923] via-[#12121a] to-[#0a0a0f]">
                  <img
                    src={normalizeMediaAssetUrl(STUDIO_IMAGE)}
                    alt={`${channel.name} visual radio`}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover opacity-35"
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <ChannelLogo
                      brand={channel.brand}
                      name={channel.name}
                      size="lg"
                      iconUrl={channel.iconUrl}
                      type={channel.type}
                      defaultStationIconUrl={homeConfig?.stationIconUrl}
                      defaultRadioIconUrl={homeConfig?.radioIconUrl}
                    />
                    <div>
                      <p className="text-base font-semibold text-[#f5f4f8]">
                        {activeTitle}
                      </p>
                      <p className="text-xs text-[#c9c7d2] mt-0.5">
                        {channel.name}
                      </p>
                    </div>
                    <audio
                      ref={audioRef}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onError={() => {
                        if (!useStreamingServer && rawStreamUrl) {
                          setUseRelayFallback(true);
                          setStatusMessage(
                            'Connecting via Station Streaming Server...'
                          );
                          return;
                        }
                        setStreamError('Broadcast temporarily unavailable.');
                      }}
                    />
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain bg-black cursor-pointer"
                  playsInline
                  onClick={handleTogglePlay}
                  onPlay={() => {
                    setIsPlaying(true);
                    setShowControlsMenu(false);
                  }}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={() => {
                    if (!useStreamingServer && rawStreamUrl) {
                      setUseRelayFallback(true);
                      setStatusMessage(
                        'Connecting via Station Streaming Server...'
                      );
                      return;
                    }
                    setStreamError('Broadcast temporarily unavailable.');
                  }}
                />
              )}

              {/* Bottom Playback Controls Bar (hidden while video is playing, shown when paused or for audio) */}
              {resolved &&
                resolved.kind !== 'embed' &&
                (!isPlaying || resolved.kind === 'audio') && (
                <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3 bg-gradient-to-t from-black/95 via-black/65 to-transparent flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleZapChannel(-1)}
                      aria-label="Previous channel"
                      className="min-h-[40px] min-w-[40px] grid place-items-center rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-colors"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      aria-label={isPlaying ? 'Pause stream' : 'Play stream'}
                      className="min-h-[40px] min-w-[40px] grid place-items-center rounded-lg bg-[#ffd21f] text-[#101016] hover:bg-[#ffe055] transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleZapChannel(1)}
                      aria-label="Next channel"
                      className="min-h-[40px] min-w-[40px] grid place-items-center rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-colors"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSeek(-10)}
                      aria-label="Rewind 10 seconds"
                      className="hidden sm:grid min-h-[40px] min-w-[40px] place-items-center rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
                    >
                      <Rewind className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSeek(10)}
                      aria-label="Forward 10 seconds"
                      className="hidden sm:grid min-h-[40px] min-w-[40px] place-items-center rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
                    >
                      <FastForward className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleMute}
                      aria-label={isMuted ? 'Unmute stream' : 'Mute stream'}
                      className="min-h-[40px] min-w-[40px] grid place-items-center rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition-colors"
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>

                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                      aria-label="Volume"
                      className="hidden sm:block w-16 accent-[#ffd21f] cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    {sleepRemainingSec > 0 && (
                      <span className="text-[11px] font-mono-tabular text-[#ffd21f] px-2">
                        {formatCountdown(sleepRemainingSec)}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowControlsMenu((prev) => !prev)}
                      aria-label="Playback options"
                      className={`min-h-[40px] px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        showControlsMenu
                          ? 'bg-white/25 text-white'
                          : 'text-white/85 hover:bg-white/15'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Options</span>
                    </button>

                    {resolved.kind !== 'audio' && (
                      <>
                        <button
                          type="button"
                          onClick={handlePiP}
                          aria-label="Picture in Picture"
                          className="hidden sm:grid min-h-[40px] min-w-[40px] place-items-center rounded-lg text-white/85 hover:bg-white/15 transition-colors"
                        >
                          <PictureInPicture2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setTheaterMode((prev) => !prev)}
                          aria-label={
                            theaterMode ? 'Exit theater mode' : 'Theater mode'
                          }
                          className="hidden lg:grid min-h-[40px] min-w-[40px] place-items-center rounded-lg text-white/85 hover:bg-white/15 transition-colors"
                        >
                          {theaterMode ? (
                            <Minimize2 className="w-4 h-4" />
                          ) : (
                            <Maximize2 className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleFullscreen()}
                          aria-label={
                            isFullscreen ? 'Exit fullscreen' : 'Fullscreen'
                          }
                          className="min-h-[40px] min-w-[40px] grid place-items-center rounded-lg text-white/85 hover:bg-white/15 transition-colors"
                        >
                          {isFullscreen ? (
                            <Minimize2 className="w-4 h-4" />
                          ) : (
                            <Maximize2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Advanced Playback Options Drawer inside Player */}
              {showControlsMenu &&
                resolved &&
                resolved.kind !== 'embed' &&
                (!isPlaying || resolved.kind === 'audio') && (
                <div className="absolute right-3 bottom-14 z-20 w-64 rounded-xl bg-[#1c1c25]/95 backdrop-blur-md border border-white/15 p-3.5 space-y-3 shadow-2xl">
                  {qualityLevels.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[#a5a3b2] mb-1.5">
                        Stream Quality
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQualityChange(-1)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            currentQuality === -1
                              ? 'bg-[#ffd21f] text-[#101016]'
                              : 'bg-[#262631] text-[#e4e2ec]'
                          }`}
                        >
                          Auto
                        </button>
                        {qualityLevels.map((lvl) => (
                          <button
                            key={lvl.index}
                            type="button"
                            onClick={() => handleQualityChange(lvl.index)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono-tabular ${
                              currentQuality === lvl.index
                                ? 'bg-[#ffd21f] text-[#101016]'
                                : 'bg-[#262631] text-[#e4e2ec]'
                            }`}
                          >
                            {lvl.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-[11px] font-semibold text-[#a5a3b2] mb-1.5">
                      Playback Speed
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SPEED_OPTIONS.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => handleSpeedChange(rate)}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold font-mono-tabular ${
                            playbackRate === rate
                              ? 'bg-[#ffd21f] text-[#101016]'
                              : 'bg-[#262631] text-[#e4e2ec]'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-[#a5a3b2] mb-1.5">
                      Sleep Timer
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SLEEP_OPTIONS.map((opt) => (
                        <button
                          key={opt.minutes}
                          type="button"
                          onClick={() => setSleepMinutes(opt.minutes)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono-tabular ${
                            sleepMinutes === opt.minutes
                              ? 'bg-[#ffd21f] text-[#101016]'
                              : 'bg-[#262631] text-[#e4e2ec]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Stream Error / Status Banner */}
            <div className="px-4 lg:px-0 space-y-5">
              {streamError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200 flex flex-wrap items-center justify-between gap-2"
                >
                  <span>{streamError}</span>
                </div>
              )}

              {statusMessage && !streamError && (
                <div className="flex items-center justify-between gap-3 text-xs text-[#a5a3b2]">
                  <span className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-[#ffd21f]" />
                    <span>{statusMessage}</span>
                  </span>
                </div>
              )}

              {/* Programme Summary Card (Matching Reference Layout) */}
              <div className="bg-[#1d1d26] border border-white/[0.06] rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg sm:text-xl font-bold text-[#f5f4f8] truncate">
                      {activeTitle}
                    </h2>
                    <div className="flex items-center gap-2.5 mt-2">
                      <span className="w-6 h-6 rounded-md overflow-hidden shrink-0 inline-flex items-center justify-center bg-white text-[8px] font-extrabold text-[#101016]">
                        {channel.name.slice(0, 3).toUpperCase()}
                      </span>
                      <p className="text-xs sm:text-sm text-[#a5a3b2] truncate">
                        <span>Today {currentSlotTime}</span>
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span className="font-mono-tabular">
                          {autoTimeSync ? `${minutesRemaining}min left` : '60min'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-[#a5a3b2] shrink-0 transition-transform duration-150 ${
                      showDetails ? 'rotate-180' : '-rotate-90'
                    }`}
                  />
                </button>

                {showDetails && (
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-3 border-t border-white/[0.06] space-y-3 text-sm text-[#c9c7d2]">
                    <p className="leading-relaxed">
                      Now streaming on <strong>{channel.name}</strong>
                      {channel.subtitle ? ` (${channel.subtitle})` : ''}. Next up:{' '}
                      <strong>{nextSlotTitle}</strong> at{' '}
                      <span className="font-mono-tabular">{nextSlotTime}</span>.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(channel.id)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5"
                      >
                        <Heart
                          className="w-3.5 h-3.5 text-[#ffd21f]"
                          fill={isFav ? 'currentColor' : 'none'}
                        />
                        {isFav ? 'Saved to Favorites' : 'Add to Favorites'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Users Live Chat Section under active stream */}
              <StreamChatSection
                channelId={channel.id}
                streamKey={activeStreamKey}
                channelName={channel.name}
                viewerName={viewerName}
                currentUserId={currentUserId}
                isSignedIn={isSignedIn}
                isFirebaseConnected={isFirebaseConnected}
                isAdmin={isAdmin}
                networkNow={networkNow}
                messages={chatMessages}
                followedSenders={followedSenders}
                onRequestSignIn={onRequestSignIn}
                onSendMessage={onSendChatMessage}
                onToggleLikeMessage={onToggleLikeMessage}
                onToggleFollowSender={onToggleFollowSender}
                onDeleteMessage={onDeleteChatMessage}
              />

              {/* Channels › Horizontal Switcher Rail (shown inline on mobile & theater mode) */}
              <section
                className={theaterMode ? '' : 'lg:hidden'}
                aria-label="Switch channels"
              >
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigatePage('channels');
                  }}
                  className="inline-flex items-center gap-1.5 mb-3 group"
                >
                  <h3 className="font-display text-lg font-bold text-[#f5f4f8] group-hover:text-[#ffd21f] transition-colors">
                    Channels
                  </h3>
                  <ChevronRight className="w-5 h-5 text-[#a5a3b2] group-hover:text-[#ffd21f]" />
                </button>

                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  {channels.map((ch) => {
                    const isActive = ch.id === channel.id;
                    const chViewers =
                      ch.type === 'Television' && Boolean(ch.streamUrl?.trim())
                        ? viewerCounts[sanitizeRtdbKey(ch.id)] ?? 0
                        : 0;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => onSelectChannel(ch)}
                        className={`w-[245px] shrink-0 bg-[#1d1d26] hover:bg-[#252531] rounded-xl overflow-hidden border text-left transition-colors ${
                          isActive
                            ? 'border-[#ffd21f]/60'
                            : 'border-white/[0.06]'
                        }`}
                      >
                        <div className="p-3.5 flex items-center gap-3">
                          <ChannelLogo
                            brand={ch.brand}
                            name={ch.name}
                            size="sm"
                            iconUrl={ch.iconUrl}
                            type={ch.type}
                            defaultStationIconUrl={homeConfig?.stationIconUrl}
                            defaultRadioIconUrl={homeConfig?.radioIconUrl}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                              {ch.name}
                            </p>
                            <p className="text-xs text-[#a5a3b2] truncate mt-0.5">
                              {ch.program || ch.subtitle || 'Live'}
                            </p>
                          </div>
                          {chViewers > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.08] text-[#e4e2ec] text-[11px] font-semibold font-mono-tabular shrink-0">
                              <Eye className="w-3 h-3 text-[#ffd21f]" />
                              {chViewers.toLocaleString()}
                            </span>
                          )}
                          {isActive && <EqualizerBars />}
                        </div>
                        <div className="h-1 w-full bg-[#3a3319]">
                          <div
                            className="h-full bg-[#ffd21f]"
                            style={{ width: `${ch.progress}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Today on {Channel} › Schedule Rail */}
              <section aria-label={`Today on ${channel.name}`}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigatePage('guide');
                  }}
                  className="inline-flex items-center gap-1.5 mb-3 group"
                >
                  <h3 className="font-display text-lg font-bold text-[#f5f4f8] group-hover:text-[#ffd21f] transition-colors">
                    Today on {channel.name}
                  </h3>
                  <ChevronRight className="w-5 h-5 text-[#a5a3b2] group-hover:text-[#ffd21f]" />
                </button>

                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                  <button
                    type="button"
                    onClick={() => onSelectChannel(channel, activeTitle)}
                    className="w-[235px] shrink-0 bg-[#1d1d26] hover:bg-[#252531] border border-[#ffd21f]/40 rounded-xl p-4 flex items-center justify-between gap-3 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                        {activeTitle}
                      </p>
                      <p className="text-xs text-[#a5a3b2] mt-1 font-mono-tabular">
                        {currentSlotTime}
                      </p>
                    </div>
                    <EqualizerBars />
                  </button>

                  <div className="w-[235px] shrink-0 bg-[#1d1d26] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectChannel(channel, nextSlotTitle)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                        {nextSlotTitle}
                      </p>
                      <p className="text-xs text-[#a5a3b2] mt-1 font-mono-tabular">
                        {nextSlotTime}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleReminder(nextReminderKey)}
                      aria-label={
                        hasNextReminder
                          ? `Cancel reminder for ${nextSlotTitle}`
                          : `Set reminder for ${nextSlotTitle}`
                      }
                      className={`min-h-[38px] min-w-[38px] grid place-items-center rounded-lg transition-colors ${
                        hasNextReminder
                          ? 'bg-[#ffd21f]/15 text-[#ffd21f]'
                          : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
                      }`}
                    >
                      {hasNextReminder ? (
                        <BellRing className="w-4 h-4" />
                      ) : (
                        <Bell className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="w-[220px] shrink-0 bg-[#1d1d26] border border-white/[0.06] rounded-xl p-4 flex flex-col justify-center">
                    <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                      Late Broadcast
                    </p>
                    <p className="text-xs text-[#a5a3b2] mt-1 font-mono-tabular">
                      {lateSlotTime}
                    </p>
                  </div>
                </div>
              </section>

              {/* More like this › Horizontal Catch-up & Related Rail */}
              {(homeConfig?.showWatchCatchupRail ?? true) &&
                relatedItems.length > 0 && (
                <section
                  aria-label={
                    homeConfig?.watchCatchupTitle?.trim() || 'More like this'
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigatePage('more');
                      }}
                      className="inline-flex items-center gap-1.5 group"
                    >
                      <h3 className="font-display text-lg font-bold text-[#f5f4f8] group-hover:text-[#ffd21f] transition-colors">
                        {homeConfig?.watchCatchupTitle?.trim() || 'More like this'}
                      </h3>
                      <ChevronRight className="w-5 h-5 text-[#a5a3b2] group-hover:text-[#ffd21f]" />
                    </button>

                    {isAdmin && onOpenControlPanel && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenControlPanel('library');
                        }}
                        className="min-h-[32px] px-3 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-[#ffd21f]/35 text-[11px] font-semibold text-[#ffd21f] flex items-center gap-1.5"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>Control Panel · Thumbnails &amp; Auto Art</span>
                      </button>
                    )}
                  </div>

                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {relatedItems.map((item, idx) => {
                      const itemChannel =
                        channels.find((c) => c.id === item.channelId) ||
                        channel;
                      const thumb = relatedCovers[idx % relatedCovers.length];
                      const effectiveCatchupThumb =
                        item.thumbnailPath ||
                        homeConfig?.watchCatchupAutoArtUrl ||
                        (item.category === 'podcast'
                          ? homeConfig?.podcastAutoArtUrl
                          : homeConfig?.tvArchiveAutoArtUrl) ||
                        thumb;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            onSelectChannel(
                              itemChannel,
                              item.title,
                              item.mediaUrl,
                              item.streamType
                            )
                          }
                          className="w-[295px] sm:w-[320px] h-[112px] shrink-0 bg-[#1d1d26] hover:bg-[#252531] border border-white/[0.06] rounded-xl overflow-hidden flex items-stretch text-left transition-colors"
                        >
                          <div className="relative w-[116px] shrink-0 bg-[#101016]">
                            <AutoImagePreview
                              src={effectiveCatchupThumb}
                              alt={item.title}
                              className="w-full h-full bg-transparent"
                              imgClassName="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-black/50 pointer-events-none" />
                          </div>
                          <div className="p-3.5 flex-1 min-w-0 flex flex-col justify-center">
                            <p className="text-sm font-semibold text-[#f5f4f8] line-clamp-2 leading-snug">
                              {item.title}
                            </p>
                            <p className="text-xs text-[#a5a3b2] mt-1.5 truncate">
                              <span>{item.channelName}</span>
                              <span aria-hidden="true" className="mx-1.5">
                                ·
                              </span>
                              <span className="font-mono-tabular">
                                {item.duration}
                              </span>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Movies & Bunyoro Films › Horizontal Discovery Rail */}
              {movies.length > 0 && (
                <section aria-label="Movies and Bunyoro films">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigatePage('movies');
                    }}
                    className="inline-flex items-center gap-1.5 mb-3 group"
                  >
                    <h3 className="font-display text-lg font-bold text-[#f5f4f8] group-hover:text-[#ffd21f] transition-colors">
                      Movies &amp; Bunyoro Films
                    </h3>
                    <ChevronRight className="w-5 h-5 text-[#a5a3b2] group-hover:text-[#ffd21f]" />
                  </button>

                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {movies.slice(0, 8).map((movie, idx) => {
                      const itemChannel =
                        channels.find((c) => c.id === movie.channelId) ||
                        channel;
                      const thumb =
                        normalizeMediaAssetUrl(movie.posterPath) ||
                        normalizeMediaAssetUrl(homeConfig?.movieAutoArtUrl) ||
                        relatedCovers[idx % relatedCovers.length];
                      return (
                        <button
                          key={movie.id}
                          type="button"
                          onClick={() =>
                            onSelectChannel(
                              itemChannel,
                              movie.title,
                              movie.streamUrl,
                              movie.streamType
                            )
                          }
                          className="w-[295px] sm:w-[320px] h-[112px] shrink-0 bg-[#1d1d26] hover:bg-[#252531] border border-white/[0.06] rounded-xl overflow-hidden flex items-stretch text-left transition-colors"
                        >
                          <div className="relative w-[88px] shrink-0 bg-[#101016]">
                            <AutoImagePreview
                              src={thumb}
                              alt={movie.title}
                              className="w-full h-full"
                              fallbackNode={
                                <img
                                  src={relatedCovers[idx % relatedCovers.length]}
                                  alt={movie.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              }
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-black/50 pointer-events-none" />
                          </div>
                          <div className="p-3.5 flex-1 min-w-0 flex flex-col justify-center">
                            <p className="text-[11px] font-semibold text-[#ffd21f] truncate">
                              {movie.genre}
                            </p>
                            <p className="text-sm font-semibold text-[#f5f4f8] line-clamp-2 leading-snug mt-0.5">
                              {movie.title}
                            </p>
                            <p className="text-xs text-[#a5a3b2] mt-1 truncate">
                              <span className="font-mono-tabular">
                                {movie.year}
                              </span>
                              <span aria-hidden="true" className="mx-1.5">
                                ·
                              </span>
                              <span className="font-mono-tabular">
                                {movie.duration}
                              </span>
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Desktop Right Sidebar Rail: Live Channels Switcher */}
          {!theaterMode && (
            <aside
              className="hidden lg:block lg:col-span-4 space-y-3"
              aria-label="Channel switcher"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigatePage('channels');
                  }}
                  className="inline-flex items-center gap-1 group"
                >
                  <h3 className="font-display text-lg font-bold text-[#f5f4f8] group-hover:text-[#ffd21f] transition-colors">
                    Channels
                  </h3>
                  <ChevronRight className="w-5 h-5 text-[#a5a3b2] group-hover:text-[#ffd21f]" />
                </button>
                <span className="text-xs text-[#a5a3b2] font-mono-tabular">
                  {channels.length} stations
                </span>
              </div>

              <div className="space-y-2.5 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
                {channels.map((ch) => {
                  const isActive = ch.id === channel.id;
                  const chViewers =
                    ch.type === 'Television' && Boolean(ch.streamUrl?.trim())
                      ? viewerCounts[sanitizeRtdbKey(ch.id)] ?? 0
                      : 0;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => onSelectChannel(ch)}
                      className={`w-full bg-[#1d1d26] hover:bg-[#252531] rounded-xl overflow-hidden border text-left transition-colors ${
                        isActive ? 'border-[#ffd21f]/60' : 'border-white/[0.06]'
                      }`}
                    >
                      <div className="p-3.5 flex items-center gap-3">
                        <ChannelLogo
                          brand={ch.brand}
                          name={ch.name}
                          size="sm"
                          iconUrl={ch.iconUrl}
                          type={ch.type}
                          defaultStationIconUrl={homeConfig?.stationIconUrl}
                          defaultRadioIconUrl={homeConfig?.radioIconUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                            {ch.name}
                          </p>
                          <p className="text-xs text-[#a5a3b2] truncate mt-0.5">
                            {ch.program || ch.subtitle || 'Live'}
                          </p>
                        </div>
                        {chViewers > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.08] text-[#e4e2ec] text-[11px] font-semibold font-mono-tabular shrink-0">
                            <Eye className="w-3 h-3 text-[#ffd21f]" />
                            {chViewers.toLocaleString()}
                          </span>
                        )}
                        {isActive && <EqualizerBars />}
                      </div>
                      <div className="h-1 w-full bg-[#3a3319]">
                        <div
                          className="h-full bg-[#ffd21f]"
                          style={{ width: `${ch.progress}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
