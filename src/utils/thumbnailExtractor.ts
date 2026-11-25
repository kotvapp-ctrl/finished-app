import { resolveCloudFilePlayableUrl } from '../services/cloudStorage';
import {
  looksLikeImageUrl,
  normalizeMediaAssetUrl,
} from './mediaAssets';
import { normalizeStreamInput } from './streamUrl';

export type ThumbnailAspect = 'poster' | 'landscape' | 'square';

export type ThumbnailDetectMethod =
  | 'youtube'
  | 'vimeo'
  | 'dailymotion'
  | 'drive'
  | 'image'
  | 'video-frame'
  | 'webpage'
  | 'none';

export interface ThumbnailDetectResult {
  thumbnailUrl?: string;
  method: ThumbnailDetectMethod;
  note?: string;
}

export function extractYouTubeId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || null;
      }
      const v = parsed.searchParams.get('v');
      if (v) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'live' || parts[0] === 'shorts') && parts[1]) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractVimeoId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return id;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractDailymotionId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'dailymotion.com' || host === 'dai.ly') {
      const id =
        host === 'dai.ly'
          ? parsed.pathname.split('/').filter(Boolean)[0]
          : parsed.pathname.split('/video/')[1]?.split('_')[0];
      return id || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractGoogleDriveId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const idMatch =
        parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
      return idMatch?.[1] || parsed.searchParams.get('id');
    }
  } catch {
    return null;
  }
  return null;
}

export function isDirectVideoUrl(rawUrl: string): boolean {
  const lower = rawUrl.trim().toLowerCase();
  if (!lower) return false;
  if (lower.startsWith('blob:') || lower.startsWith('data:video')) return true;
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(lower)) return true;
  if (lower.includes('/api/stream/relay')) return true;
  return false;
}

export function getTargetDimensions(aspect: ThumbnailAspect): {
  width: number;
  height: number;
} {
  if (aspect === 'poster') return { width: 480, height: 720 };
  if (aspect === 'square') return { width: 540, height: 540 };
  return { width: 640, height: 360 };
}

/**
 * Cuts out a framed JPEG thumbnail from a video frame or image element,
 * applying aspect-ratio crop, zoom (1..3), and normalized pan offsets (-1..1),
 * compressed safely under 180 KB so it persists cleanly in Firestore.
 */
export function cutoutCanvasDataUrl(
  source: HTMLVideoElement | HTMLImageElement,
  options: {
    aspect: ThumbnailAspect;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
    maxLength?: number;
  }
): string {
  const maxLength = options.maxLength ?? 180_000;
  const zoom = Math.min(3, Math.max(1, options.zoom ?? 1));
  const offsetX = Math.min(1, Math.max(-1, options.offsetX ?? 0));
  const offsetY = Math.min(1, Math.max(-1, options.offsetY ?? 0));

  const srcWidth =
    source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const srcHeight =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source.naturalHeight;

  if (!srcWidth || !srcHeight) {
    throw new Error('Media dimensions are not ready yet.');
  }

  const baseTarget = getTargetDimensions(options.aspect);
  const scales = [1, 0.78, 0.62];
  const qualities = [0.86, 0.74, 0.6, 0.46, 0.34];

  for (const dimScale of scales) {
    const targetWidth = Math.max(120, Math.round(baseTarget.width * dimScale));
    const targetHeight = Math.max(120, Math.round(baseTarget.height * dimScale));
    const targetAspect = targetWidth / targetHeight;
    const sourceAspect = srcWidth / srcHeight;

    // Base cover crop rectangle before zoom
    let cropW: number;
    let cropH: number;
    if (sourceAspect > targetAspect) {
      cropH = srcHeight;
      cropW = cropH * targetAspect;
    } else {
      cropW = srcWidth;
      cropH = cropW / targetAspect;
    }

    cropW = cropW / zoom;
    cropH = cropH / zoom;

    const maxPanX = Math.max(0, (srcWidth - cropW) / 2);
    const maxPanY = Math.max(0, (srcHeight - cropH) / 2);
    const sx = Math.min(
      Math.max(0, (srcWidth - cropW) / 2 + offsetX * maxPanX),
      srcWidth - cropW
    );
    const sy = Math.min(
      Math.max(0, (srcHeight - cropH) / 2 + offsetY * maxPanY),
      srcHeight - cropH
    );

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');

    ctx.fillStyle = '#101016';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(
      source,
      sx,
      sy,
      cropW,
      cropH,
      0,
      0,
      targetWidth,
      targetHeight
    );

    for (const q of qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      if (dataUrl.length <= maxLength) {
        return dataUrl;
      }
    }
  }

  throw new Error('Could not compress cutout thumbnail within cloud limit.');
}

async function captureVideoFrameOnce(
  videoSrc: string,
  options: {
    seekSeconds: number;
    aspect: ThumbnailAspect;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
  }
): Promise<{
  dataUrl: string;
  durationSec: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (!videoSrc.startsWith('blob:') && !videoSrc.startsWith('data:')) {
      video.crossOrigin = 'anonymous';
    }

    let settled = false;
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // Ignore cleanup errors
      }
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(err);
    };

    const timer = window.setTimeout(() => {
      fail(new Error('Video thumbnail capture timed out.'));
    }, 12000);

    video.onerror = () => {
      fail(new Error('Unable to decode video frame from this URL.'));
    };

    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) ? video.duration : 0;
      const targetTime =
        dur > 0
          ? Math.min(
              Math.max(0.1, options.seekSeconds),
              Math.max(0.1, dur - 0.15)
            )
          : Math.max(0.1, options.seekSeconds);
      try {
        video.currentTime = targetTime;
      } catch {
        // Seek not supported; wait briefly for first frame
        window.setTimeout(() => {
          try {
            const dataUrl = cutoutCanvasDataUrl(video, {
              aspect: options.aspect,
              zoom: options.zoom,
              offsetX: options.offsetX,
              offsetY: options.offsetY,
            });
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            const result = {
              dataUrl,
              durationSec: dur,
              width: video.videoWidth,
              height: video.videoHeight,
            };
            cleanup();
            resolve(result);
          } catch (err) {
            fail(
              err instanceof Error
                ? err
                : new Error('Unable to extract video frame.')
            );
          }
        }, 250);
      }
    };

    video.onseeked = () => {
      try {
        const dataUrl = cutoutCanvasDataUrl(video, {
          aspect: options.aspect,
          zoom: options.zoom,
          offsetX: options.offsetX,
          offsetY: options.offsetY,
        });
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const result = {
          dataUrl,
          durationSec: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth,
          height: video.videoHeight,
        };
        cleanup();
        resolve(result);
      } catch (err) {
        fail(
          err instanceof Error
            ? err
            : new Error('Unable to capture cutout frame (CORS blocked).')
        );
      }
    };

    video.src = videoSrc;
  });
}

export async function extractFrameFromVideoSource(
  rawVideoUrl: string,
  options?: {
    seekSeconds?: number;
    aspect?: ThumbnailAspect;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
    allowRelayFallback?: boolean;
  }
): Promise<{
  dataUrl: string;
  durationSec: number;
  width: number;
  height: number;
}> {
  const aspect = options?.aspect ?? 'landscape';
  const seekSeconds = options?.seekSeconds ?? 2;
  const allowRelay = options?.allowRelayFallback ?? true;

  let resolvedSrc = rawVideoUrl.trim();
  if (resolvedSrc.startsWith('vault://')) {
    resolvedSrc = await resolveCloudFilePlayableUrl(resolvedSrc);
  }

  try {
    return await captureVideoFrameOnce(resolvedSrc, {
      seekSeconds,
      aspect,
      zoom: options?.zoom,
      offsetX: options?.offsetX,
      offsetY: options?.offsetY,
    });
  } catch (directErr) {
    if (
      allowRelay &&
      (resolvedSrc.startsWith('http://') || resolvedSrc.startsWith('https://')) &&
      !resolvedSrc.includes('/api/stream/relay')
    ) {
      const relayedSrc = `/api/stream/relay?url=${encodeURIComponent(
        resolvedSrc
      )}`;
      return await captureVideoFrameOnce(relayedSrc, {
        seekSeconds,
        aspect,
        zoom: options?.zoom,
        offsetX: options?.offsetX,
        offsetY: options?.offsetY,
      });
    }
    throw directErr;
  }
}

export async function extractFrameFromVideoFile(
  file: File,
  options?: {
    seekSeconds?: number;
    aspect?: ThumbnailAspect;
  }
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const res = await captureVideoFrameOnce(objectUrl, {
      seekSeconds: options?.seekSeconds ?? 2,
      aspect: options?.aspect ?? 'landscape',
    });
    return res.dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for cutout.'));
    img.src = src;
  });
}

export async function cutoutImageFromUrl(
  rawUrl: string,
  options: {
    aspect: ThumbnailAspect;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
  }
): Promise<string> {
  let normalized = normalizeMediaAssetUrl(rawUrl);
  if (!normalized) {
    throw new Error('No image URL available for cutout.');
  }
  if (normalized.startsWith('vault://')) {
    normalized = await resolveCloudFilePlayableUrl(normalized);
  }

  try {
    const img = await loadImageElement(normalized);
    return cutoutCanvasDataUrl(img, options);
  } catch {
    if (
      (normalized.startsWith('http://') || normalized.startsWith('https://')) &&
      !normalized.includes('/api/stream/relay')
    ) {
      const relayed = `/api/stream/relay?url=${encodeURIComponent(normalized)}`;
      const img = await loadImageElement(relayed);
      return cutoutCanvasDataUrl(img, options);
    }
    throw new Error('Unable to crop this image due to source restrictions.');
  }
}

export async function autoDetectThumbnailFromUrl(
  rawInput: string,
  aspect: ThumbnailAspect = 'landscape'
): Promise<ThumbnailDetectResult> {
  const normalizedStream = normalizeStreamInput(rawInput);
  if (!normalizedStream) {
    return { method: 'none' };
  }

  const normalizedAsset = normalizeMediaAssetUrl(normalizedStream);

  // 1. Direct image link
  if (looksLikeImageUrl(normalizedAsset)) {
    return {
      thumbnailUrl: normalizedAsset,
      method: 'image',
      note: 'Image thumbnail auto-detected from URL.',
    };
  }

  // 2. YouTube
  const ytId = extractYouTubeId(normalizedStream);
  if (ytId) {
    return {
      thumbnailUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      method: 'youtube',
      note: 'YouTube video thumbnail auto-detected.',
    };
  }

  // 3. Dailymotion
  const dmId = extractDailymotionId(normalizedStream);
  if (dmId) {
    return {
      thumbnailUrl: `https://www.dailymotion.com/thumbnail/video/${encodeURIComponent(
        dmId
      )}`,
      method: 'dailymotion',
      note: 'Dailymotion thumbnail auto-detected.',
    };
  }

  // 4. Google Drive share link
  const driveId = extractGoogleDriveId(normalizedStream);
  if (driveId) {
    return {
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        driveId
      )}&sz=w1200`,
      method: 'drive',
      note: 'Google Drive thumbnail auto-detected.',
    };
  }

  // 5. Direct video file / blob / Cloud Vault video -> capture frame cutout
  if (
    isDirectVideoUrl(normalizedStream) ||
    normalizedStream.startsWith('vault://')
  ) {
    try {
      const captured = await extractFrameFromVideoSource(normalizedStream, {
        seekSeconds: 2,
        aspect,
        allowRelayFallback: true,
      });
      return {
        thumbnailUrl: captured.dataUrl,
        method: 'video-frame',
        note: 'Auto-cutout frame captured directly from video URL.',
      };
    } catch {
      return {
        method: 'none',
        note: 'Video URL linked. Use Cutout / Frame to scrub or upload a thumbnail.',
      };
    }
  }

  // 6. Backend extractor for Vimeo oEmbed, webpages (og:image / twitter:image), or extensionless video URLs
  if (
    normalizedStream.startsWith('http://') ||
    normalizedStream.startsWith('https://')
  ) {
    try {
      const res = await fetch(
        `/api/media/thumbnail?url=${encodeURIComponent(normalizedStream)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          thumbnailUrl?: string;
          provider?: string;
          kind?: string;
          supportsFrameCutout?: boolean;
          videoUrl?: string;
          reason?: string;
        };

        if (data.ok && data.thumbnailUrl) {
          return {
            thumbnailUrl: data.thumbnailUrl,
            method: data.provider === 'Vimeo' ? 'vimeo' : 'webpage',
            note: `${data.provider || 'Web'} thumbnail auto-detected from URL.`,
          };
        }

        if (data.ok && data.supportsFrameCutout) {
          try {
            const captured = await extractFrameFromVideoSource(
              data.videoUrl || normalizedStream,
              {
                seekSeconds: 2,
                aspect,
                allowRelayFallback: true,
              }
            );
            return {
              thumbnailUrl: captured.dataUrl,
              method: 'video-frame',
              note: 'Auto-cutout frame captured from video stream.',
            };
          } catch {
            // Ignore frame capture fallback errors
          }
        }

        return {
          method: 'none',
          note: data.reason,
        };
      }
    } catch {
      // Ignore transient lookup errors
    }
  }

  return { method: 'none' };
}
