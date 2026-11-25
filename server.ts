import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import express, { type Request, type Response } from 'express';
import * as webpush from 'web-push';

const ADMIN_EMAIL = '97.1skyfm@gmail.com';
const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ROOT_DIR = process.cwd();
const FCM_REGISTRY_FILE = '/tmp/kotv-fcm-registry.json';
const WEBPUSH_REGISTRY_FILE = '/tmp/kotv-webpush-registry.json';
const VAPID_KEYS_FILE = '/tmp/kotv-vapid.json';

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
}

interface ServiceAccountCreds {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface RegisteredDevice {
  token: string;
  topics: string[];
  platform: string;
  uid?: string;
  updatedAtMs: number;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(ROOT_DIR, 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

function loadServiceAccount(): ServiceAccountCreds | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccountCreds>;
    if (
      typeof parsed.project_id === 'string' &&
      typeof parsed.client_email === 'string' &&
      typeof parsed.private_key === 'string'
    ) {
      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: parsed.private_key.replace(/\\n/g, '\n'),
        token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
      };
    }
  } catch {
    return null;
  }
  return null;
}

const firebaseConfig = loadFirebaseConfig();
const startedAtMs = Date.now();
const deviceRegistry = new Map<string, RegisteredDevice>();

function loadDeviceRegistry() {
  try {
    if (!fs.existsSync(FCM_REGISTRY_FILE)) return;
    const raw = fs.readFileSync(FCM_REGISTRY_FILE, 'utf-8');
    const items = JSON.parse(raw) as RegisteredDevice[];
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item && typeof item.token === 'string' && item.token.length >= 10) {
        deviceRegistry.set(item.token, item);
      }
    }
  } catch {
    // Ignore transient temp file read errors
  }
}

function persistDeviceRegistry() {
  try {
    fs.writeFileSync(
      FCM_REGISTRY_FILE,
      JSON.stringify(Array.from(deviceRegistry.values())),
      'utf-8'
    );
  } catch {
    // Ignore ephemeral filesystem errors
  }
}

interface RegisteredWebPushDevice {
  endpoint: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  topics: string[];
  platform: string;
  uid?: string;
  updatedAtMs: number;
}

const webPushRegistry = new Map<string, RegisteredWebPushDevice>();

function initVapidKeys(): { publicKey: string; privateKey: string } {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    webpush.setVapidDetails(`mailto:${ADMIN_EMAIL}`, envPub, envPriv);
    return { publicKey: envPub, privateKey: envPriv };
  }

  try {
    if (fs.existsSync(VAPID_KEYS_FILE)) {
      const saved = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, 'utf-8')) as {
        publicKey?: string;
        privateKey?: string;
      };
      if (saved.publicKey && saved.privateKey) {
        webpush.setVapidDetails(
          `mailto:${ADMIN_EMAIL}`,
          saved.publicKey,
          saved.privateKey
        );
        return { publicKey: saved.publicKey, privateKey: saved.privateKey };
      }
    }
  } catch {
    // Regenerate VAPID keys below if unreadable
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(generated), 'utf-8');
  } catch {
    // Ephemeral runtime fallback
  }
  webpush.setVapidDetails(
    `mailto:${ADMIN_EMAIL}`,
    generated.publicKey,
    generated.privateKey
  );
  return generated;
}

const vapidKeys = initVapidKeys();

function loadWebPushRegistry() {
  try {
    if (!fs.existsSync(WEBPUSH_REGISTRY_FILE)) return;
    const raw = fs.readFileSync(WEBPUSH_REGISTRY_FILE, 'utf-8');
    const items = JSON.parse(raw) as RegisteredWebPushDevice[];
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (
        item &&
        typeof item.endpoint === 'string' &&
        item.subscription?.keys?.p256dh &&
        item.subscription?.keys?.auth
      ) {
        webPushRegistry.set(item.endpoint, item);
      }
    }
  } catch {
    // Ignore ephemeral read errors
  }
}

function persistWebPushRegistry() {
  try {
    fs.writeFileSync(
      WEBPUSH_REGISTRY_FILE,
      JSON.stringify(Array.from(webPushRegistry.values())),
      'utf-8'
    );
  } catch {
    // Ignore ephemeral write errors
  }
}

loadDeviceRegistry();
loadWebPushRegistry();

function isPrivateIp(host: string): boolean {
  const clean = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    clean === 'localhost' ||
    clean === '0.0.0.0' ||
    clean === '::1' ||
    clean.endsWith('.local') ||
    clean.endsWith('.internal')
  ) {
    return true;
  }
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }
  if (net.isIPv6(clean)) {
    if (clean === '::1' || clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) {
      return true;
    }
  }
  return false;
}

function validateExternalStreamUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (isPrivateIp(parsed.hostname)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function rewriteHlsPlaylist(manifestText: string, baseUrl: string): string {
  const lines = manifestText.split(/\r?\n/);
  const rewritten: string[] = [];

  const toProxyPath = (targetRaw: string): string => {
    try {
      const resolved = new URL(targetRaw, baseUrl).toString();
      const lower = resolved.toLowerCase();
      if (/\.m3u8(\?|#|$)/i.test(lower) || lower.includes('m3u8')) {
        return `/api/stream/hls?url=${encodeURIComponent(resolved)}`;
      }
      return `/api/stream/segment?url=${encodeURIComponent(resolved)}`;
    } catch {
      return targetRaw;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      rewritten.push(line);
      continue;
    }

    if (trimmed.startsWith('#')) {
      const updatedTag = line.replace(
        /URI=(["'])([^"']+)\1/gi,
        (_match, quote: string, uriVal: string) =>
          `URI=${quote}${toProxyPath(uriVal)}${quote}`
      );
      rewritten.push(updatedTag);
      continue;
    }

    rewritten.push(toProxyPath(trimmed));
  }

  return rewritten.join('\n');
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let cachedGoogleToken: { token: string; expiresAtMs: number } | null = null;

async function getFcmAccessToken(sa: ServiceAccountCreds): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedGoogleToken && cachedGoogleToken.expiresAtMs > Date.now() + 60_000) {
    return cachedGoogleToken.token;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const unsignedJwt = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  const signature = base64UrlEncode(signer.sign(sa.private_key));
  const assertion = `${unsignedJwt}.${signature}`;

  const tokenRes = await fetch(
    sa.token_uri || 'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    }
  );

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAuth token exchange failed: ${errText}`);
  }

  const data = (await tokenRes.json()) as {
    access_token: string;
    expires_in?: number;
  };
  cachedGoogleToken = {
    token: data.access_token,
    expiresAtMs: Date.now() + ((data.expires_in || 3600) - 120) * 1000,
  };
  return data.access_token;
}

async function verifyAdminBearerToken(
  req: Request
): Promise<{ uid: string; email: string } | null> {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  try {
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(
        firebaseConfig.apiKey
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: match[1].trim() }),
      }
    );
    if (!lookupRes.ok) return null;
    const data = (await lookupRes.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
      }>;
    };
    const user = data.users?.[0];
    if (
      !user ||
      !user.localId ||
      !user.emailVerified ||
      (user.email || '').toLowerCase() !== ADMIN_EMAIL
    ) {
      return null;
    }
    return { uid: user.localId, email: user.email! };
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // CORS headers for Independent Streaming Server endpoints
  app.use('/api/stream', (req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Content-Type');
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges, Content-Type'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 1. 24/7 Cloud Backend Health & Authoritative Clock
  app.get('/api/health', (_req: Request, res: Response) => {
    const sa = loadServiceAccount();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'kakumiro-online-tv-cloud',
      uptimeSec: Math.floor((Date.now() - startedAtMs) / 1000),
      serverTimeMs: Date.now(),
      serverTimeIso: new Date().toISOString(),
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      fcmServerReady: Boolean(sa),
      registeredDevices: deviceRegistry.size,
      streamingServerReady: true,
    });
  });

  app.get('/api/time', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const nowMs = Date.now();
    res.json({
      unixMs: nowMs,
      iso: new Date(nowMs).toISOString(),
    });
  });

  // 2. Independent Live TV Streaming Server Endpoints
  app.get('/api/stream/probe', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const parsed = validateExternalStreamUrl(rawUrl);
    if (!parsed) {
      res.status(400).json({ ok: false, error: 'Invalid or disallowed stream URL.' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const t0 = Date.now();

    try {
      let upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'KakumiroOnlineTV-StreamServer/1.0',
          Range: 'bytes=0-1023',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (upstream.status === 416) {
        upstream = await fetch(parsed.toString(), {
          method: 'HEAD',
          headers: { 'User-Agent': 'KakumiroOnlineTV-StreamServer/1.0' },
          signal: controller.signal,
          redirect: 'follow',
        });
      }

      const contentType = upstream.headers.get('content-type') || '';
      const lowerCt = contentType.toLowerCase();
      const lowerUrl = upstream.url.toLowerCase();
      let detectedKind: 'hls' | 'audio' | 'video' | 'html' = 'video';
      if (lowerCt.includes('mpegurl') || /\.m3u8(\?|#|$)/i.test(lowerUrl)) {
        detectedKind = 'hls';
      } else if (lowerCt.startsWith('audio/') || /\.(mp3|aac|ogg|opus)(\?|#|$)/i.test(lowerUrl)) {
        detectedKind = 'audio';
      } else if (lowerCt.includes('text/html')) {
        detectedKind = 'html';
      }

      if (upstream.body) {
        await upstream.body.cancel().catch(() => undefined);
      }

      res.json({
        ok: upstream.ok,
        status: upstream.status,
        contentType: contentType || 'application/octet-stream',
        latencyMs: Date.now() - t0,
        detectedKind,
        finalUrl: upstream.url,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        status: 502,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : 'Stream probe failed',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get('/api/stream/hls', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const parsed = validateExternalStreamUrl(rawUrl);
    if (!parsed) {
      res.status(400).send('Invalid or disallowed HLS stream URL.');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    req.on('close', () => controller.abort());

    try {
      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'KakumiroOnlineTV-StreamServer/1.0',
          Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!upstream.ok) {
        res.status(upstream.status).send(`Upstream HLS returned ${upstream.status}`);
        return;
      }

      const manifestText = await upstream.text();
      const effectiveBase = upstream.url || parsed.toString();
      const rewritten = rewriteHlsPlaylist(manifestText, effectiveBase);

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(rewritten);
    } catch (err) {
      if (!res.headersSent) {
        res
          .status(502)
          .send(err instanceof Error ? err.message : 'HLS relay error');
      }
    } finally {
      clearTimeout(timer);
    }
  });

  const handleBinaryRelay = async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const parsed = validateExternalStreamUrl(rawUrl);
    if (!parsed) {
      res.status(400).send('Invalid or disallowed stream URL.');
      return;
    }

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const forwardHeaders: Record<string, string> = {
      'User-Agent': 'KakumiroOnlineTV-StreamServer/1.0',
    };
    if (typeof req.headers.range === 'string') {
      forwardHeaders.Range = req.headers.range;
    }

    try {
      const isHeadRequest = req.method.toUpperCase() === 'HEAD';
      const upstream = await fetch(parsed.toString(), {
        method: isHeadRequest ? 'HEAD' : 'GET',
        headers: forwardHeaders,
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!upstream.ok && upstream.status !== 206) {
        if (upstream.body) {
          await upstream.body.cancel().catch(() => undefined);
        }
        if (isHeadRequest) {
          res.status(upstream.status).end();
        } else {
          res.status(upstream.status).send(`Upstream stream returned ${upstream.status}`);
        }
        return;
      }

      const contentType =
        upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'no-cache');

      res.status(upstream.status);

      if (isHeadRequest || !upstream.body) {
        if (upstream.body) {
          await upstream.body.cancel().catch(() => undefined);
        }
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>
      );
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(502).send('Stream relay connection error');
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  };

  app.get('/api/stream/segment', handleBinaryRelay);
  app.head('/api/stream/segment', handleBinaryRelay);
  app.get('/api/stream/relay', handleBinaryRelay);
  app.head('/api/stream/relay', handleBinaryRelay);

  app.get('/api/media/thumbnail', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const parsed = validateExternalStreamUrl(rawUrl);
    if (!parsed) {
      res.status(400).json({ ok: false, error: 'Invalid or disallowed URL.' });
      return;
    }

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    // Fast path: YouTube
    if (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      let ytId: string | null = null;
      if (host === 'youtu.be') {
        ytId = parsed.pathname.split('/').filter(Boolean)[0] || null;
      } else if (parsed.pathname.startsWith('/embed/')) {
        ytId = parsed.pathname.split('/')[2] || null;
      } else if (parsed.searchParams.get('v')) {
        ytId = parsed.searchParams.get('v');
      } else {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if ((parts[0] === 'live' || parts[0] === 'shorts') && parts[1]) {
          ytId = parts[1];
        }
      }
      if (ytId && /^[a-zA-Z0-9_-]{6,20}$/.test(ytId)) {
        res.json({
          ok: true,
          kind: 'video',
          provider: 'YouTube',
          thumbnailUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          supportsFrameCutout: false,
        });
        return;
      }
    }

    // Fast path: Dailymotion
    if (host === 'dailymotion.com' || host === 'dai.ly') {
      const dmId =
        host === 'dai.ly'
          ? parsed.pathname.split('/').filter(Boolean)[0]
          : parsed.pathname.split('/video/')[1]?.split('_')[0];
      if (dmId) {
        res.json({
          ok: true,
          kind: 'video',
          provider: 'Dailymotion',
          thumbnailUrl: `https://www.dailymotion.com/thumbnail/video/${encodeURIComponent(dmId)}`,
          supportsFrameCutout: false,
        });
        return;
      }
    }

    // Fast path: Google Drive
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const idMatch =
        parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
        parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const driveId = idMatch?.[1] || parsed.searchParams.get('id');
      if (driveId) {
        res.json({
          ok: true,
          kind: 'image',
          provider: 'Google Drive',
          thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`,
          supportsFrameCutout: false,
        });
        return;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    req.on('close', () => controller.abort());

    try {
      // Vimeo oEmbed lookup
      if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const vimeoId = parsed.pathname.split('/').filter(Boolean).pop();
        if (vimeoId && /^\d+$/.test(vimeoId)) {
          const oembedRes = await fetch(
            `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(
              `https://vimeo.com/${vimeoId}`
            )}`,
            { signal: controller.signal }
          );
          if (oembedRes.ok) {
            const oembed = (await oembedRes.json()) as {
              thumbnail_url?: string;
              title?: string;
            };
            if (oembed.thumbnail_url) {
              res.json({
                ok: true,
                kind: 'video',
                provider: 'Vimeo',
                thumbnailUrl: oembed.thumbnail_url,
                title: oembed.title,
                supportsFrameCutout: false,
              });
              return;
            }
          }
        }
      }

      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'KakumiroOnlineTV-ThumbnailExtractor/1.0',
          Accept: 'text/html,application/xhtml+xml,image/*,video/*,*/*;q=0.8',
          Range: 'bytes=0-262143',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const finalUrl = upstream.url || parsed.toString();

      if (contentType.startsWith('image/')) {
        if (upstream.body) await upstream.body.cancel().catch(() => undefined);
        res.json({
          ok: true,
          kind: 'image',
          provider: host,
          thumbnailUrl: finalUrl,
          supportsFrameCutout: false,
        });
        return;
      }

      if (
        contentType.startsWith('video/') ||
        /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(finalUrl)
      ) {
        if (upstream.body) await upstream.body.cancel().catch(() => undefined);
        res.json({
          ok: true,
          kind: 'video',
          provider: host,
          videoUrl: finalUrl,
          supportsFrameCutout: true,
        });
        return;
      }

      if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
        if (upstream.body) await upstream.body.cancel().catch(() => undefined);
        res.json({
          ok: false,
          reason: `Unsupported content type (${contentType || 'unknown'}).`,
        });
        return;
      }

      const html = (await upstream.text()).slice(0, 260000);
      const extractMeta = (attrPattern: RegExp): string | null => {
        const tags = html.match(/<meta\s+[^>]*>/gi) || [];
        for (const tag of tags) {
          if (attrPattern.test(tag)) {
            const contentMatch = tag.match(/content\s*=\s*["']([^"']+)["']/i);
            if (contentMatch?.[1]) {
              return contentMatch[1].trim();
            }
          }
        }
        return null;
      };

      const rawThumb =
        extractMeta(/(?:property|name)\s*=\s*["']og:image(?::secure_url)?["']/i) ||
        extractMeta(/(?:property|name)\s*=\s*["']twitter:image(?::src)?["']/i) ||
        extractMeta(/itemprop\s*=\s*["']thumbnailUrl["']/i) ||
        html.match(/<video[^>]+poster\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ||
        html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/i)?.[1]?.trim() ||
        null;

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

      if (rawThumb) {
        let resolvedThumb = rawThumb.replace(/&amp;/g, '&');
        try {
          resolvedThumb = new URL(resolvedThumb, finalUrl).toString();
        } catch {
          // Keep raw if URL constructor fails
        }
        res.json({
          ok: true,
          kind: 'webpage',
          provider: host,
          thumbnailUrl: resolvedThumb,
          title: titleMatch,
          supportsFrameCutout: false,
        });
        return;
      }

      res.json({
        ok: false,
        reason: 'No OpenGraph or video poster thumbnail found on this page.',
      });
    } catch (err) {
      res.status(200).json({
        ok: false,
        reason: err instanceof Error ? err.message : 'Unable to inspect URL metadata.',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // 3. Android & Web Push (VAPID) + Firebase Cloud Messaging (FCM) Dispatch
  app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      publicKey: vapidKeys.publicKey,
    });
  });

  app.post('/api/push/subscribe', (req: Request, res: Response) => {
    const body = req.body as {
      subscription?: {
        endpoint?: unknown;
        expirationTime?: number | null;
        keys?: { p256dh?: unknown; auth?: unknown };
      };
      topics?: unknown;
      platform?: unknown;
      uid?: unknown;
    };

    const sub = body.subscription;
    const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : '';
    const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh.trim() : '';
    const authKey = typeof sub?.keys?.auth === 'string' ? sub.keys.auth.trim() : '';

    if (!endpoint.startsWith('https://') || !p256dh || !authKey) {
      res.status(400).json({ ok: false, error: 'Valid Web Push subscription object is required.' });
      return;
    }

    const allowedTopics = new Set(['news', 'sports', 'tvGuide', 'live']);
    const topics = Array.isArray(body.topics)
      ? body.topics.filter(
          (t): t is string => typeof t === 'string' && allowedTopics.has(t)
        )
      : ['news', 'sports', 'tvGuide', 'live'];

    const platform =
      typeof body.platform === 'string' && body.platform.trim()
        ? body.platform.trim().slice(0, 40)
        : 'android-web';
    const uid =
      typeof body.uid === 'string' && body.uid.trim()
        ? body.uid.trim().slice(0, 128)
        : undefined;

    webPushRegistry.set(endpoint, {
      endpoint,
      subscription: {
        endpoint,
        expirationTime: sub?.expirationTime ?? null,
        keys: { p256dh, auth: authKey },
      },
      topics: topics.length > 0 ? topics : ['news', 'sports', 'tvGuide', 'live'],
      platform,
      uid,
      updatedAtMs: Date.now(),
    });
    persistWebPushRegistry();

    res.json({
      ok: true,
      webPushDevices: webPushRegistry.size,
      registeredDevices: deviceRegistry.size,
    });
  });

  app.post('/api/push/unsubscribe', (req: Request, res: Response) => {
    const body = req.body as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
    if (endpoint) {
      webPushRegistry.delete(endpoint);
      persistWebPushRegistry();
    }
    res.json({ ok: true, webPushDevices: webPushRegistry.size });
  });

  app.post('/api/push/test', async (req: Request, res: Response) => {
    const body = req.body as {
      subscription?: {
        endpoint?: unknown;
        expirationTime?: number | null;
        keys?: { p256dh?: unknown; auth?: unknown };
      };
      title?: unknown;
      body?: unknown;
      channelId?: unknown;
    };
    const sub = body.subscription;
    const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : '';
    const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh.trim() : '';
    const authKey = typeof sub?.keys?.auth === 'string' ? sub.keys.auth.trim() : '';

    if (!endpoint.startsWith('https://') || !p256dh || !authKey) {
      res.status(400).json({ ok: false, error: 'Active Web Push subscription is required.' });
      return;
    }

    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : 'Kakumiro Online TV';
    const message =
      typeof body.body === 'string' && body.body.trim()
        ? body.body.trim().slice(0, 280)
        : 'Android System Notifications are active on your device.';
    const channelId =
      typeof body.channelId === 'string' ? body.channelId.trim().slice(0, 64) : '';

    try {
      await webpush.sendNotification(
        {
          endpoint,
          expirationTime: sub?.expirationTime ?? null,
          keys: { p256dh, auth: authKey },
        },
        JSON.stringify({
          title,
          body: message,
          category: 'live',
          channelId,
          alertId: `test-${Date.now()}`,
          url: channelId ? `/?channel=${encodeURIComponent(channelId)}` : '/',
        })
      );
      res.json({ ok: true, delivered: true });
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        webPushRegistry.delete(endpoint);
        persistWebPushRegistry();
      }
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Web Push delivery failed.',
      });
    }
  });

  app.get('/api/fcm/status', (_req: Request, res: Response) => {
    const sa = loadServiceAccount();
    res.json({
      fcmServerReady: Boolean(sa),
      webPushReady: true,
      vapidConfigured: true,
      registeredDevices: deviceRegistry.size + webPushRegistry.size,
      fcmDevices: deviceRegistry.size,
      webPushDevices: webPushRegistry.size,
    });
  });

  app.post('/api/fcm/register', (req: Request, res: Response) => {
    const body = req.body as {
      token?: unknown;
      topics?: unknown;
      platform?: unknown;
      uid?: unknown;
    };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (token.length < 10 || token.length > 512) {
      res.status(400).json({ ok: false, error: 'Valid FCM token is required.' });
      return;
    }

    const allowedTopics = new Set(['news', 'sports', 'tvGuide', 'live']);
    const topics = Array.isArray(body.topics)
      ? body.topics.filter(
          (t): t is string => typeof t === 'string' && allowedTopics.has(t)
        )
      : ['news', 'sports', 'tvGuide', 'live'];

    const platform =
      typeof body.platform === 'string' && body.platform.trim()
        ? body.platform.trim().slice(0, 40)
        : 'web';
    const uid =
      typeof body.uid === 'string' && body.uid.trim()
        ? body.uid.trim().slice(0, 128)
        : undefined;

    deviceRegistry.set(token, {
      token,
      topics: topics.length > 0 ? topics : ['news', 'sports', 'tvGuide', 'live'],
      platform,
      uid,
      updatedAtMs: Date.now(),
    });
    persistDeviceRegistry();

    res.json({
      ok: true,
      registeredDevices: deviceRegistry.size + webPushRegistry.size,
      fcmServerReady: Boolean(loadServiceAccount()),
      webPushReady: true,
    });
  });

  app.post('/api/fcm/unregister', (req: Request, res: Response) => {
    const body = req.body as { token?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (token) {
      deviceRegistry.delete(token);
      persistDeviceRegistry();
    }
    res.json({
      ok: true,
      registeredDevices: deviceRegistry.size + webPushRegistry.size,
    });
  });

  app.post('/api/fcm/broadcast', async (req: Request, res: Response) => {
    const verifiedAdmin = await verifyAdminBearerToken(req);
    if (!verifiedAdmin) {
      res.status(403).json({
        ok: false,
        error: 'Admin verification failed. Sign in with the authorized administrator account.',
      });
      return;
    }

    const body = req.body as {
      alertId?: unknown;
      category?: unknown;
      title?: unknown;
      body?: unknown;
      channelId?: unknown;
      tokens?: unknown;
      webPushSubscriptions?: unknown;
    };

    const category =
      typeof body.category === 'string' &&
      ['news', 'sports', 'tvGuide', 'live'].includes(body.category)
        ? body.category
        : 'live';
    const title =
      typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const alertBody =
      typeof body.body === 'string' ? body.body.trim().slice(0, 280) : '';
    const channelId =
      typeof body.channelId === 'string' ? body.channelId.trim().slice(0, 64) : '';
    const alertId =
      typeof body.alertId === 'string'
        ? body.alertId.trim().slice(0, 64)
        : `alert-${Date.now()}`;

    if (!title || !alertBody) {
      res.status(400).json({ ok: false, error: 'Title and message body are required.' });
      return;
    }

    const tokenSet = new Set<string>();
    if (Array.isArray(body.tokens)) {
      for (const t of body.tokens) {
        if (typeof t === 'string' && t.trim().length >= 10) {
          tokenSet.add(t.trim());
        }
      }
    }
    for (const dev of deviceRegistry.values()) {
      if (dev.topics.includes(category)) {
        tokenSet.add(dev.token);
      }
    }

    // Gather matching Web Push (Android Chrome / PWA) targets
    const webPushMap = new Map<
      string,
      RegisteredWebPushDevice['subscription']
    >();
    for (const dev of webPushRegistry.values()) {
      if (dev.topics.includes(category)) {
        webPushMap.set(dev.endpoint, dev.subscription);
      }
    }
    if (Array.isArray(body.webPushSubscriptions)) {
      for (const item of body.webPushSubscriptions) {
        const entry = item as {
          subscriptionJson?: unknown;
          topics?: unknown;
        };
        if (typeof entry?.subscriptionJson !== 'string') continue;
        const topics = Array.isArray(entry.topics)
          ? entry.topics.map(String)
          : ['news', 'sports', 'tvGuide', 'live'];
        if (!topics.includes(category)) continue;
        try {
          const parsed = JSON.parse(entry.subscriptionJson) as {
            endpoint?: string;
            expirationTime?: number | null;
            keys?: { p256dh?: string; auth?: string };
          };
          if (
            parsed?.endpoint?.startsWith('https://') &&
            parsed.keys?.p256dh &&
            parsed.keys?.auth
          ) {
            webPushMap.set(parsed.endpoint, {
              endpoint: parsed.endpoint,
              expirationTime: parsed.expirationTime ?? null,
              keys: {
                p256dh: parsed.keys.p256dh,
                auth: parsed.keys.auth,
              },
            });
          }
        } catch {
          // Ignore malformed persisted subscription JSON
        }
      }
    }

    const linkUrl = channelId
      ? `/?channel=${encodeURIComponent(channelId)}`
      : '/';

    // 1. Dispatch standard Web Push (works on Android Chrome & PWAs even without service account JSON)
    let webPushDelivered = 0;
    let webPushFailed = 0;
    const webPushTargets = Array.from(webPushMap.values());
    const webPushPayload = JSON.stringify({
      title,
      body: alertBody,
      category,
      channelId,
      alertId,
      url: linkUrl,
    });

    await Promise.all(
      webPushTargets.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, webPushPayload);
          webPushDelivered += 1;
        } catch (err) {
          webPushFailed += 1;
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            webPushRegistry.delete(sub.endpoint);
          }
        }
      })
    );
    if (webPushFailed > 0) {
      persistWebPushRegistry();
    }

    // 2. Dispatch FCM HTTP v1 (when FIREBASE_SERVICE_ACCOUNT_JSON is provided)
    const targetTokens = Array.from(tokenSet);
    const sa = loadServiceAccount();
    let fcmDelivered = 0;
    let fcmFailed = 0;
    const invalidTokens: string[] = [];

    if (sa && targetTokens.length > 0) {
      try {
        const accessToken = await getFcmAccessToken(sa);
        const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
          sa.project_id
        )}/messages:send`;

        await Promise.all(
          targetTokens.map(async (token) => {
            try {
              const sendRes = await fetch(endpoint, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  message: {
                    token,
                    notification: {
                      title,
                      body: alertBody,
                    },
                    data: {
                      alertId,
                      category,
                      channelId,
                      title,
                      body: alertBody,
                    },
                    android: {
                      priority: 'HIGH',
                      notification: {
                        channel_id: `kotv_${category}`,
                        title,
                        body: alertBody,
                      },
                    },
                    webpush: {
                      notification: {
                        title,
                        body: alertBody,
                        icon: '/pwa-icon-192.png',
                        badge: '/pwa-icon-192.png',
                      },
                      fcm_options: {
                        link: linkUrl,
                      },
                    },
                  },
                }),
              });

              if (sendRes.ok) {
                fcmDelivered += 1;
              } else {
                fcmFailed += 1;
                const errText = await sendRes.text();
                if (
                  errText.includes('UNREGISTERED') ||
                  errText.includes('INVALID_ARGUMENT')
                ) {
                  invalidTokens.push(token);
                  deviceRegistry.delete(token);
                }
              }
            } catch {
              fcmFailed += 1;
            }
          })
        );

        if (invalidTokens.length > 0) {
          persistDeviceRegistry();
        }
      } catch {
        // Keep Web Push delivery summary intact even if FCM token exchange errors
      }
    }

    const totalTargeted = webPushTargets.length + targetTokens.length;
    const totalDelivered = webPushDelivered + fcmDelivered;

    res.json({
      ok: true,
      fcmServerReady: Boolean(sa),
      webPushReady: true,
      targetedCount: totalTargeted,
      deliveredCount: totalDelivered,
      webPushDelivered,
      fcmDelivered,
      failedCount: webPushFailed + fcmFailed,
      invalidTokens,
      note:
        totalDelivered > 0
          ? `Delivered Android/Web OS notifications to ${totalDelivered} subscribed device(s).`
          : 'Live alert synced to Firestore real-time viewers (no closed-app push subscribers yet).',
    });
  });

  const httpServer = http.createServer(app);

  // 4. Mount Vite dev middlewares or serve built static files
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true' || Boolean(process.env.K_SERVICE);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        hmr: hmrDisabled ? false : { server: httpServer },
        ws: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (hmrDisabled) {
      const noHmrViteClientShim = `
const sheetsMap = new Map();
const linkSheetsMap = new Map();
const hotDataMap = new Map();
const cspNonce =
  typeof document !== 'undefined'
    ? document.querySelector('meta[property=csp-nonce]')?.nonce
    : undefined;

if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    const id = el.getAttribute('data-vite-dev-id');
    if (id) sheetsMap.set(id, el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    const id = el.getAttribute('data-vite-dev-id');
    if (id) linkSheetsMap.set(id, el);
  });
}

let lastInsertedStyle;

export function updateStyle(id, content) {
  if (typeof document === 'undefined' || linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (cspNonce) style.setAttribute('nonce', cspNonce);
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => {
        lastInsertedStyle = undefined;
      }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}

export function removeStyle(id) {
  if (typeof document === 'undefined') return;
  if (linkSheetsMap.has(id)) {
    document
      .querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]')
      .forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}

export function createHotContext(ownerPath) {
  if (!hotDataMap.has(ownerPath)) hotDataMap.set(ownerPath, {});
  const noop = () => {};
  return {
    get data() {
      return hotDataMap.get(ownerPath);
    },
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}

export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}

const BaseHTMLElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};
export class ErrorOverlay extends BaseHTMLElement {
  close() {
    this.parentNode?.removeChild(this);
  }
}
`;
      app.get('/@vite/client', (_req: Request, res: Response) => {
        res.setHeader('Cache-Control', 'no-store');
        res.type('application/javascript; charset=utf-8').send(noHmrViteClientShim);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Kakumiro Online TV Cloud Server listening on http://0.0.0.0:${PORT} (${
        IS_PRODUCTION ? 'production' : 'development'
      })`
    );
  });
}

void startServer();
