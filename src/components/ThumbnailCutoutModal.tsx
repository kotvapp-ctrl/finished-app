import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crop,
  Film,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Scissors,
  Upload,
  X,
} from 'lucide-react';
import { normalizeMediaAssetUrl } from '../utils/mediaAssets';
import { normalizeStreamInput } from '../utils/streamUrl';
import {
  cutoutCanvasDataUrl,
  getTargetDimensions,
  isDirectVideoUrl,
  type ThumbnailAspect,
} from '../utils/thumbnailExtractor';
import { resolveCloudFilePlayableUrl } from '../services/cloudStorage';

interface ThumbnailCutoutModalProps {
  open: boolean;
  title: string;
  defaultAspect: ThumbnailAspect;
  mediaUrl?: string;
  localVideoFileUrl?: string;
  imageUrl?: string;
  onClose: () => void;
  onApply: (dataUrl: string) => void;
}

export function ThumbnailCutoutModal({
  open,
  title,
  defaultAspect,
  mediaUrl = '',
  localVideoFileUrl = '',
  imageUrl = '',
  onClose,
  onApply,
}: ThumbnailCutoutModalProps) {
  const [aspect, setAspect] = useState<ThumbnailAspect>(defaultAspect);
  const [mode, setMode] = useState<'video' | 'image'>('video');

  // Video frame scrubber state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [resolvedVideoSrc, setResolvedVideoSrc] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(2);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [triedVideoRelay, setTriedVideoRelay] = useState(false);
  const [customLocalVideoUrl, setCustomLocalVideoUrl] = useState('');

  // Image crop state
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [customLocalImageUrl, setCustomLocalImageUrl] = useState('');

  // Shared cutout framing controls
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);

  // Clean up transient object URLs created inside modal
  useEffect(() => {
    return () => {
      if (customLocalVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(customLocalVideoUrl);
      }
    };
  }, [customLocalVideoUrl]);

  useEffect(() => {
    return () => {
      if (customLocalImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(customLocalImageUrl);
      }
    };
  }, [customLocalImageUrl]);

  // Reset modal state whenever opened
  useEffect(() => {
    if (!open) return;
    setAspect(defaultAspect);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setVideoError(null);
    setImageError(null);
    setVideoReady(false);
    setImageReady(false);
    setTriedVideoRelay(false);

    const normalizedMedia = normalizeStreamInput(mediaUrl);
    const hasVideoSource =
      Boolean(localVideoFileUrl) ||
      Boolean(customLocalVideoUrl) ||
      isDirectVideoUrl(normalizedMedia) ||
      normalizedMedia.startsWith('vault://');

    if (hasVideoSource) {
      setMode('video');
    } else if (imageUrl.trim()) {
      setMode('image');
    } else {
      setMode('video');
    }
  }, [open, defaultAspect, mediaUrl, localVideoFileUrl, customLocalVideoUrl, imageUrl]);

  // Resolve playable video source for canvas extraction
  useEffect(() => {
    if (!open || mode !== 'video') return;
    let cancelled = false;

    const resolveSrc = async () => {
      setVideoError(null);
      setVideoReady(false);

      const candidate =
        customLocalVideoUrl ||
        localVideoFileUrl ||
        normalizeStreamInput(mediaUrl);

      if (!candidate) {
        setResolvedVideoSrc('');
        return;
      }

      if (
        !candidate.startsWith('blob:') &&
        !candidate.startsWith('data:') &&
        !candidate.startsWith('vault://') &&
        !isDirectVideoUrl(candidate)
      ) {
        setResolvedVideoSrc('');
        setVideoError(
          'External embed players (YouTube/Vimeo/Social) cannot be scrubbed directly in canvas. Switch to "Image Cutout" to crop the auto-detected thumbnail, or choose a local video file below.'
        );
        return;
      }

      setVideoLoading(true);
      try {
        let finalUrl = candidate;
        if (finalUrl.startsWith('vault://')) {
          finalUrl = await resolveCloudFilePlayableUrl(finalUrl);
        }
        if (!cancelled) {
          setTriedVideoRelay(false);
          setResolvedVideoSrc(finalUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setVideoError(
            err instanceof Error
              ? err.message
              : 'Unable to load video source for frame cutout.'
          );
          setVideoLoading(false);
        }
      }
    };

    void resolveSrc();
    return () => {
      cancelled = true;
    };
  }, [open, mode, mediaUrl, localVideoFileUrl, customLocalVideoUrl]);

  // Load image element (with relay fallback for CORS) when in image mode
  useEffect(() => {
    if (!open || mode !== 'image') return;
    let cancelled = false;

    const rawCandidate = customLocalImageUrl || imageUrl;
    const normalized = normalizeMediaAssetUrl(rawCandidate);
    loadedImageRef.current = null;
    setImageReady(false);
    setImageError(null);

    if (!normalized) {
      setImageLoading(false);
      return;
    }

    const loadImg = async () => {
      setImageLoading(true);
      try {
        let src = normalized;
        if (src.startsWith('vault://')) {
          src = await resolveCloudFilePlayableUrl(src);
        }

        const attempt = (targetSrc: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            if (!targetSrc.startsWith('data:') && !targetSrc.startsWith('blob:')) {
              el.crossOrigin = 'anonymous';
            }
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Image load failed'));
            el.src = targetSrc;
          });

        let loaded: HTMLImageElement;
        try {
          loaded = await attempt(src);
        } catch {
          if (
            (src.startsWith('http://') || src.startsWith('https://')) &&
            !src.includes('/api/stream/relay')
          ) {
            loaded = await attempt(`/api/stream/relay?url=${encodeURIComponent(src)}`);
          } else {
            throw new Error('Unable to load image for cutout.');
          }
        }

        if (!cancelled) {
          loadedImageRef.current = loaded;
          setImageReady(true);
          setImageLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setImageError(
            err instanceof Error
              ? err.message
              : 'Could not load image for cutout. Upload an image directly below.'
          );
          setImageLoading(false);
        }
      }
    };

    void loadImg();
    return () => {
      cancelled = true;
    };
  }, [open, mode, imageUrl, customLocalImageUrl]);

  // Draw live cutout preview onto canvas whenever framing controls or frame change
  const renderCanvasPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const source =
      mode === 'video' ? videoRef.current : loadedImageRef.current;
    if (!source) return;

    const srcW =
      source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const srcH =
      source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!srcW || !srcH) return;

    const dims = getTargetDimensions(aspect);
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const targetAspect = dims.width / dims.height;
    const sourceAspect = srcW / srcH;

    let cropW: number;
    let cropH: number;
    if (sourceAspect > targetAspect) {
      cropH = srcH;
      cropW = cropH * targetAspect;
    } else {
      cropW = srcW;
      cropH = cropW / targetAspect;
    }

    cropW = cropW / zoom;
    cropH = cropH / zoom;

    const maxPanX = Math.max(0, (srcW - cropW) / 2);
    const maxPanY = Math.max(0, (srcH - cropH) / 2);
    const sx = Math.min(Math.max(0, (srcW - cropW) / 2 + offsetX * maxPanX), srcW - cropW);
    const sy = Math.min(Math.max(0, (srcH - cropH) / 2 + offsetY * maxPanY), srcH - cropH);

    ctx.fillStyle = '#101016';
    ctx.fillRect(0, 0, dims.width, dims.height);
    try {
      ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, dims.width, dims.height);
    } catch {
      // Wait for frame decode
    }
  }, [mode, aspect, zoom, offsetX, offsetY]);

  useEffect(() => {
    if (!open) return;
    if ((mode === 'video' && videoReady) || (mode === 'image' && imageReady)) {
      renderCanvasPreview();
    }
  }, [open, mode, videoReady, imageReady, renderCanvasPreview]);

  if (!open) return null;

  const handleVideoLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    setVideoDuration(dur);
    const initialSeek = dur > 0 ? Math.min(2, Math.max(0.2, dur * 0.15)) : 1;
    setSeekTime(initialSeek);
    try {
      v.currentTime = initialSeek;
    } catch {
      setVideoReady(true);
      setVideoLoading(false);
    }
  };

  const handleVideoSeeked = () => {
    setVideoReady(true);
    setVideoLoading(false);
    renderCanvasPreview();
  };

  const handleVideoError = () => {
    if (
      !triedVideoRelay &&
      (resolvedVideoSrc.startsWith('http://') ||
        resolvedVideoSrc.startsWith('https://')) &&
      !resolvedVideoSrc.includes('/api/stream/relay')
    ) {
      setTriedVideoRelay(true);
      setResolvedVideoSrc(
        `/api/stream/relay?url=${encodeURIComponent(resolvedVideoSrc)}`
      );
      return;
    }
    setVideoLoading(false);
    setVideoError(
      'Unable to decode remote video directly. Pick a local video file below or switch to Image Cutout.'
    );
  };

  const handleScrub = (nextSec: number) => {
    setSeekTime(nextSec);
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = nextSec;
      } catch {
        // Ignore seek constraint errors
      }
    }
  };

  const handleLocalVideoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomLocalVideoUrl((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return url;
    });
    setMode('video');
  };

  const handleLocalImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomLocalImageUrl((prev) => {
      if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return url;
    });
    setMode('image');
  };

  const handleApplyCutout = () => {
    const source =
      mode === 'video' ? videoRef.current : loadedImageRef.current;
    if (!source) return;
    setSaving(true);
    try {
      const dataUrl = cutoutCanvasDataUrl(source, {
        aspect,
        zoom,
        offsetX,
        offsetY,
        maxLength: 180_000,
      });
      onApply(dataUrl);
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Browser blocked canvas export on this remote source.';
      if (mode === 'video' && !triedVideoRelay && resolvedVideoSrc.startsWith('http')) {
        setTriedVideoRelay(true);
        setResolvedVideoSrc(
          `/api/stream/relay?url=${encodeURIComponent(resolvedVideoSrc)}`
        );
      } else if (mode === 'video') {
        setVideoError(msg);
      } else {
        setImageError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    (mode === 'video' && videoReady && !videoError) ||
    (mode === 'image' && imageReady && !imageError);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-2xl bg-[#1d1d26] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#ffd21f]/15 text-[#ffd21f] grid place-items-center shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#f5f4f8] truncate">
                {title}
              </h3>
              <p className="text-[11px] text-[#a5a3b2] truncate">
                Capture a video frame or cut out a framed thumbnail
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cutout tool"
            className="w-9 h-9 rounded-xl bg-[#262631] hover:bg-[#323240] text-[#c9c7d2] grid place-items-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Mode Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('video')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  mode === 'video'
                    ? 'bg-[#ffd21f] text-[#101016]'
                    : 'bg-[#101016] text-[#c9c7d2] border border-white/10 hover:bg-[#262631]'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                Video Frame Cutout
              </button>
              <button
                type="button"
                onClick={() => setMode('image')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  mode === 'image'
                    ? 'bg-[#ffd21f] text-[#101016]'
                    : 'bg-[#101016] text-[#c9c7d2] border border-white/10 hover:bg-[#262631]'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                Image Crop / Cutout
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'poster', label: '2:3 Poster' },
                  { id: 'landscape', label: '16:9 Wide' },
                  { id: 'square', label: '1:1 Square' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAspect(opt.id)}
                  className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    aspect === opt.id
                      ? 'bg-[#262631] text-[#ffd21f] border border-[#ffd21f]/50'
                      : 'bg-[#101016] text-[#a5a3b2] border border-white/[0.08]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hidden decoder video element */}
          {mode === 'video' && resolvedVideoSrc && (
            <video
              ref={videoRef}
              src={resolvedVideoSrc}
              muted
              playsInline
              preload="auto"
              crossOrigin={
                resolvedVideoSrc.startsWith('blob:') ||
                resolvedVideoSrc.startsWith('data:')
                  ? undefined
                  : 'anonymous'
              }
              onLoadedMetadata={handleVideoLoadedMetadata}
              onSeeked={handleVideoSeeked}
              onError={handleVideoError}
              className="hidden"
            />
          )}

          {/* Live Cutout Canvas Preview */}
          <div className="rounded-xl bg-[#101016] border border-white/[0.08] p-4 flex flex-col items-center justify-center gap-3 min-h-[220px]">
            {mode === 'video' && videoLoading && (
              <div className="flex items-center gap-2 text-xs text-[#ffd21f]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading video frame for cutout...
              </div>
            )}

            {mode === 'image' && imageLoading && (
              <div className="flex items-center gap-2 text-xs text-[#ffd21f]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading image for cutout...
              </div>
            )}

            {((mode === 'video' && videoError) ||
              (mode === 'image' && imageError)) && (
              <div className="text-center space-y-2 max-w-md">
                <p className="text-xs text-amber-300 leading-relaxed">
                  {mode === 'video' ? videoError : imageError}
                </p>
              </div>
            )}

            {mode === 'video' && !resolvedVideoSrc && !videoError && (
              <div className="text-center space-y-2 py-4">
                <Camera className="w-8 h-8 text-[#a5a3b2] mx-auto" />
                <p className="text-xs text-[#a5a3b2]">
                  Paste a direct MP4/WebM video URL in the form or pick a video file below to cut out a frame.
                </p>
              </div>
            )}

            {mode === 'image' &&
              !customLocalImageUrl &&
              !imageUrl.trim() &&
              !imageError && (
                <div className="text-center space-y-2 py-4">
                  <ImageIcon className="w-8 h-8 text-[#a5a3b2] mx-auto" />
                  <p className="text-xs text-[#a5a3b2]">
                    No active image yet. Paste a thumbnail URL, auto-detect from URL, or pick an image below.
                  </p>
                </div>
              )}

            <canvas
              ref={previewCanvasRef}
              className={`rounded-lg border border-white/15 shadow-lg max-h-[260px] w-auto object-contain ${
                canSave ? 'block' : 'hidden'
              }`}
            />

            {/* Quick Local Source Uploaders */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {mode === 'video' ? (
                <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                  Pick Video File to Cut Frame
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleLocalVideoPick}
                    className="sr-only"
                  />
                </label>
              ) : (
                <label className="min-h-[34px] px-3 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[#ffd21f]" />
                  Pick Image File to Crop
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLocalImagePick}
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Video Timeline Scrubber */}
          {mode === 'video' && videoReady && (
            <div className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#e4e2ec]">
                  Scrub Video Frame
                </span>
                <span className="font-mono-tabular text-[#ffd21f]">
                  {seekTime.toFixed(1)}s
                  {videoDuration > 0 ? ` / ${videoDuration.toFixed(1)}s` : ''}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={Math.max(5, videoDuration || 30)}
                step={0.2}
                value={seekTime}
                onChange={(e) => handleScrub(Number(e.target.value))}
                className="w-full accent-[#ffd21f]"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '1s', t: 1 },
                  { label: '3s', t: 3 },
                  {
                    label: '25%',
                    t: Math.max(0.5, (videoDuration || 20) * 0.25),
                  },
                  {
                    label: '50%',
                    t: Math.max(1, (videoDuration || 20) * 0.5),
                  },
                  {
                    label: '75%',
                    t: Math.max(1.5, (videoDuration || 20) * 0.75),
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      handleScrub(
                        Math.min(
                          preset.t,
                          Math.max(0.2, (videoDuration || 30) - 0.1)
                        )
                      )
                    }
                    className="min-h-[30px] px-2.5 py-0.5 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-[11px] font-semibold text-[#c9c7d2]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Framing & Cutout Controls */}
          {canSave && (
            <div className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#e4e2ec]">
                  Cutout Framing (Zoom &amp; Pan)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setOffsetX(0);
                    setOffsetY(0);
                  }}
                  className="text-[11px] text-[#ffd21f] hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset framing
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex justify-between text-[11px] text-[#a5a3b2] mb-1">
                    <span>Zoom</span>
                    <span className="font-mono-tabular">{zoom.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={2.8}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full accent-[#ffd21f]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[#a5a3b2] mb-1">
                    <span>Horizontal Pan</span>
                    <span className="font-mono-tabular">
                      {Math.round(offsetX * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={offsetX}
                    onChange={(e) => setOffsetX(Number(e.target.value))}
                    className="w-full accent-[#ffd21f]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[#a5a3b2] mb-1">
                    <span>Vertical Pan</span>
                    <span className="font-mono-tabular">
                      {Math.round(offsetY * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={offsetY}
                    onChange={(e) => setOffsetY(Number(e.target.value))}
                    className="w-full accent-[#ffd21f]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.08] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleApplyCutout}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] disabled:opacity-45 text-[#101016] text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Saving Cutout...' : 'Apply Cutout Thumbnail'}
          </button>
        </div>
      </div>
    </div>
  );
}
