import { HERO_IMAGE, PROMO_IMAGE, STUDIO_IMAGE } from '../data/channels';

const LEGACY_ASSET_MAP: Record<string, string> = {
  '/src/assets/images/hero_luke_remete_1794662485430.jpg': HERO_IMAGE,
  '/src/assets/images/promo_anniversary_stage_1794662486521.jpg': PROMO_IMAGE,
  '/src/assets/images/broadcast_studio_live_1794662488339.jpg': STUDIO_IMAGE,
};

export function normalizeMediaAssetUrl(url?: string): string {
  let trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (LEGACY_ASSET_MAP[trimmed]) {
    return LEGACY_ASSET_MAP[trimmed];
  }
  for (const [legacyPath, publicPath] of Object.entries(LEGACY_ASSET_MAP)) {
    if (trimmed.endsWith(legacyPath)) {
      return publicPath;
    }
  }

  // Keep local assets, data URLs, blob URLs, Cloud Vault URIs, and relay paths intact
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('vault://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }

  // Prepend https:// for bare domain URLs pasted without a protocol
  if (
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) &&
    /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/|$)/.test(trimmed)
  ) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    // Google Drive share links -> direct high-res thumbnail URL
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const fileIdMatch =
        parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const idFromQuery = parsed.searchParams.get('id');
      const driveId = fileIdMatch?.[1] || idFromQuery;
      if (driveId) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
          driveId
        )}&sz=w1200`;
      }
    }

    // Dropbox share links -> raw direct file URL
    if (host === 'www.dropbox.com' || host === 'dropbox.com') {
      parsed.searchParams.delete('dl');
      parsed.searchParams.set('raw', '1');
      return parsed.toString();
    }

    // GitHub blob URLs -> raw.githubusercontent.com
    if (host === 'github.com') {
      const blobMatch = parsed.pathname.match(
        /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/
      );
      if (blobMatch) {
        return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
      }
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function getRelayImageFallbackUrl(url?: string): string | null {
  const normalized = normalizeMediaAssetUrl(url);
  if (!normalized) return null;
  if (
    (normalized.startsWith('https://') || normalized.startsWith('http://')) &&
    !normalized.includes('/api/stream/relay')
  ) {
    return `/api/stream/relay?url=${encodeURIComponent(normalized)}`;
  }
  return null;
}

export function looksLikeImageUrl(url?: string): boolean {
  const clean = (url || '').trim().toLowerCase();
  if (!clean) return false;
  if (clean.startsWith('data:image/')) return true;
  if (
    /\.(jpg|jpeg|png|webp|gif|svg|avif|bmp)(\?|#|$)/i.test(clean) ||
    clean.includes('drive.google.com/thumbnail') ||
    clean.includes('googleusercontent.com')
  ) {
    return true;
  }
  return false;
}

export async function compressImageFileToDataUrl(
  file: File,
  maxDataUrlLength = 180_000
): Promise<string> {
  const readAsDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read image file.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(blob);
    });

  if (file.size <= 120_000) {
    const raw = await readAsDataUrl(file);
    if (raw.length <= maxDataUrlLength) {
      return raw;
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to decode image file.'));
      el.src = objectUrl;
    });

    const maxDimensions = [960, 720, 560, 420];
    const qualities = [0.82, 0.7, 0.56, 0.42, 0.3];

    for (const maxDim of maxDimensions) {
      const scale = Math.min(
        1,
        maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
      );
      const width = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
      const height = Math.max(
        1,
        Math.round((img.naturalHeight || maxDim) * scale)
      );

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;

      ctx.drawImage(img, 0, 0, width, height);

      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= maxDataUrlLength) {
          return dataUrl;
        }
      }
    }

    throw new Error(
      'Image could not be compressed below 180 KB for cloud sync. Please choose a smaller photo or paste an image URL.'
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildAppShareUrl(): string {
  if (typeof window === 'undefined') return '';
  if (window.location.protocol.startsWith('http')) {
    return `${window.location.origin}/`;
  }
  return window.location.href;
}

export function buildChannelShareUrl(channelId: string): string {
  if (typeof window === 'undefined') return '';
  if (window.location.protocol.startsWith('http')) {
    return `${window.location.origin}/?channel=${encodeURIComponent(channelId)}`;
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('channel', channelId);
    return url.toString();
  } catch {
    return window.location.href;
  }
}
