import { ChannelType, StreamFormat } from '../types/broadcast';

export interface ResolvedStream {
  kind: 'hls' | 'video' | 'audio' | 'embed';
  playableUrl: string;
  providerLabel: string;
}

export function normalizeStreamInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Support pasting full <iframe src="..."> embed snippets
  const iframeSrcMatch = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeSrcMatch?.[1]) {
    return iframeSrcMatch[1].trim();
  }

  return trimmed;
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname.startsWith('/embed/')) {
        return url;
      }
      const v = parsed.searchParams.get('v');
      if (v) {
        return `https://www.youtube.com/embed/${v}?autoplay=1&rel=0`;
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'live' || parts[0] === 'shorts') && parts[1]) {
        return `https://www.youtube.com/embed/${parts[1]}?autoplay=1&rel=0`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getVimeoEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'player.vimeo.com') return url;
    if (host === 'vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) {
        return `https://player.vimeo.com/video/${id}?autoplay=1`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getTwitchEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    if (host === 'player.twitch.tv') return url;
    if (host === 'twitch.tv') {
      const channel = parsed.pathname.split('/').filter(Boolean)[0];
      if (channel) {
        return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getFacebookEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.watch') {
      if (parsed.pathname.includes('/plugins/video.php')) return url;
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
    }
  } catch {
    return null;
  }
  return null;
}

function getDailymotionEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'dailymotion.com' || host === 'dai.ly') {
      const id =
        host === 'dai.ly'
          ? parsed.pathname.split('/').filter(Boolean)[0]
          : parsed.pathname.split('/video/')[1]?.split('_')[0];
      if (id) {
        return `https://www.dailymotion.com/embed/video/${id}?autoplay=1`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function buildRelayStreamUrl(
  url: string,
  kind: 'hls' | 'video' | 'audio'
): string {
  const clean = url.trim();
  if (!clean || clean.startsWith('blob:') || clean.startsWith('data:') || clean.startsWith('/api/stream/')) {
    return clean;
  }
  if (kind === 'hls') {
    return `/api/stream/hls?url=${encodeURIComponent(clean)}`;
  }
  return `/api/stream/relay?url=${encodeURIComponent(clean)}`;
}

export function shouldAutoRelayUrl(rawUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'https:' &&
    rawUrl.trim().toLowerCase().startsWith('http://')
  );
}

export function resolveStreamSource(
  rawUrl: string,
  preferredType: StreamFormat = 'auto',
  channelType: ChannelType = 'Television',
  forceRelay = false
): ResolvedStream | null {
  const url = normalizeStreamInput(rawUrl);
  if (!url) return null;

  const lower = url.toLowerCase();

  // Check well-known embed providers first when in auto or embed mode
  const yt = getYouTubeEmbedUrl(url);
  if (yt && (preferredType === 'auto' || preferredType === 'embed')) {
    return { kind: 'embed', playableUrl: yt, providerLabel: 'YouTube Embed' };
  }

  const vimeo = getVimeoEmbedUrl(url);
  if (vimeo && (preferredType === 'auto' || preferredType === 'embed')) {
    return { kind: 'embed', playableUrl: vimeo, providerLabel: 'Vimeo Embed' };
  }

  const twitch = getTwitchEmbedUrl(url);
  if (twitch && (preferredType === 'auto' || preferredType === 'embed')) {
    return { kind: 'embed', playableUrl: twitch, providerLabel: 'Twitch Embed' };
  }

  const fb = getFacebookEmbedUrl(url);
  if (fb && (preferredType === 'auto' || preferredType === 'embed')) {
    return { kind: 'embed', playableUrl: fb, providerLabel: 'Facebook Video' };
  }

  const dm = getDailymotionEmbedUrl(url);
  if (dm && (preferredType === 'auto' || preferredType === 'embed')) {
    return { kind: 'embed', playableUrl: dm, providerLabel: 'Dailymotion Embed' };
  }

  if (preferredType === 'embed') {
    return { kind: 'embed', playableUrl: url, providerLabel: 'Web Player Embed' };
  }

  const useRelay = forceRelay || shouldAutoRelayUrl(url);

  if (preferredType === 'hls' || /\.m3u8(\?|#|$)/i.test(lower) || lower.includes('m3u8')) {
    return {
      kind: 'hls',
      playableUrl: useRelay ? buildRelayStreamUrl(url, 'hls') : url,
      providerLabel: useRelay ? 'Station Streaming Server (HLS)' : 'HLS Live Stream',
    };
  }

  if (
    preferredType === 'audio' ||
    /\.(mp3|aac|ogg|opus|wav|flac|m4a)(\?|#|$)/i.test(lower) ||
    lower.startsWith('data:audio') ||
    /\/(stream|listen|radio|icecast|shoutcast)([/?#]|$)/i.test(lower) ||
    (channelType === 'Radios' &&
      preferredType === 'auto' &&
      !/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(lower) &&
      !lower.includes('/embed'))
  ) {
    return {
      kind: 'audio',
      playableUrl: useRelay ? buildRelayStreamUrl(url, 'audio') : url,
      providerLabel: useRelay
        ? 'Station Streaming Server (Audio)'
        : 'Audio / Radio Stream',
    };
  }

  if (
    preferredType === 'media' ||
    /\.(mp4|webm|mov|m4v|ogv|ts)(\?|#|$)/i.test(lower) ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:video')
  ) {
    return {
      kind: 'video',
      playableUrl: useRelay ? buildRelayStreamUrl(url, 'video') : url,
      providerLabel: useRelay
        ? 'Station Streaming Server (Video)'
        : 'Direct Video Stream',
    };
  }

  if (
    lower.includes('/embed') ||
    lower.includes('/player') ||
    /\.(html|htm|php)(\?|#|$)/i.test(lower)
  ) {
    return { kind: 'embed', playableUrl: url, providerLabel: 'Web Player Embed' };
  }

  // Default fallback for extensionless stream endpoints
  return {
    kind: 'video',
    playableUrl: useRelay ? buildRelayStreamUrl(url, 'video') : url,
    providerLabel: useRelay ? 'Station Streaming Server' : 'Media Stream',
  };
}
