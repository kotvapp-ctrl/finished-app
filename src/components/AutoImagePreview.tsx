import { ReactNode, useEffect, useState } from 'react';
import { Expand, Loader2, X } from 'lucide-react';
import { resolveCloudFilePlayableUrl } from '../services/cloudStorage';
import {
  getRelayImageFallbackUrl,
  normalizeMediaAssetUrl,
} from '../utils/mediaAssets';

export type ImagePreviewStatus = 'empty' | 'loading' | 'loaded' | 'error';

interface AutoImagePreviewProps {
  src?: string;
  alt: string;
  fallbackLabel?: string;
  fallbackNode?: ReactNode;
  className?: string;
  imgClassName?: string;
  overlay?: ReactNode;
  allowExpand?: boolean;
  onStatusChange?: (status: ImagePreviewStatus) => void;
}

export function AutoImagePreview({
  src,
  alt,
  fallbackLabel = 'Auto art',
  fallbackNode,
  className = '',
  imgClassName = 'w-full h-full object-cover',
  overlay,
  allowExpand = false,
  onStatusChange,
}: AutoImagePreviewProps) {
  const rawTrimmed = (src || '').trim();
  const normalized = normalizeMediaAssetUrl(rawTrimmed);

  const [debouncedUrl, setDebouncedUrl] = useState(normalized);
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [triedRelay, setTriedRelay] = useState(false);
  const [status, setStatus] = useState<ImagePreviewStatus>(
    normalized ? 'loading' : 'empty'
  );
  const [expanded, setExpanded] = useState(false);

  // Light debounce for typed remote URLs; immediate for data/blob/local/vault URLs
  useEffect(() => {
    if (!normalized) {
      setDebouncedUrl('');
      return;
    }
    const isRemote =
      normalized.startsWith('http://') || normalized.startsWith('https://');
    if (!isRemote) {
      setDebouncedUrl(normalized);
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedUrl(normalized);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [normalized]);

  // Reset image load state whenever the target URL changes
  useEffect(() => {
    let active = true;
    setTriedRelay(false);

    if (!debouncedUrl) {
      setResolvedUrl('');
      setStatus('empty');
      return;
    }

    if (debouncedUrl.startsWith('vault://')) {
      setStatus('loading');
      void resolveCloudFilePlayableUrl(debouncedUrl)
        .then((objectUrl) => {
          if (!active) return;
          if (objectUrl) {
            setResolvedUrl(objectUrl);
          } else {
            setStatus('error');
          }
        })
        .catch(() => {
          if (!active) return;
          setStatus('error');
        });
      return () => {
        active = false;
      };
    }

    // Require at least a domain or path before attempting remote load
    if (
      (debouncedUrl.startsWith('http://') ||
        debouncedUrl.startsWith('https://')) &&
      !/^https?:\/\/[^/\s]+\.[^/\s]+/.test(debouncedUrl)
    ) {
      setResolvedUrl('');
      setStatus('error');
      return;
    }

    setResolvedUrl(debouncedUrl);
    setStatus('loading');

    return () => {
      active = false;
    };
  }, [debouncedUrl]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const handleImgLoad = () => {
    setStatus('loaded');
  };

  const handleImgError = () => {
    if (!triedRelay) {
      const relayUrl = getRelayImageFallbackUrl(debouncedUrl);
      if (relayUrl && relayUrl !== resolvedUrl) {
        setTriedRelay(true);
        setResolvedUrl(relayUrl);
        setStatus('loading');
        return;
      }
    }
    setStatus('error');
  };

  const showImg = Boolean(resolvedUrl) && status !== 'error';

  return (
    <>
      <div
        className={`relative overflow-hidden bg-[#101016] ${className} ${
          allowExpand && status === 'loaded' ? 'cursor-zoom-in group' : ''
        }`}
        onClick={
          allowExpand && status === 'loaded'
            ? () => setExpanded(true)
            : undefined
        }
        role={allowExpand && status === 'loaded' ? 'button' : undefined}
        tabIndex={allowExpand && status === 'loaded' ? 0 : undefined}
        aria-label={
          allowExpand && status === 'loaded'
            ? `Enlarge preview for ${alt}`
            : undefined
        }
        onKeyDown={
          allowExpand && status === 'loaded'
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded(true);
                }
              }
            : undefined
        }
      >
        {showImg && (
          <img
            key={resolvedUrl}
            src={resolvedUrl}
            alt={alt}
            referrerPolicy="no-referrer"
            onLoad={handleImgLoad}
            onError={handleImgError}
            className={`${imgClassName} transition-opacity duration-200 ${
              status === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {(!showImg || status === 'loading') && (
          <div className="absolute inset-0 grid place-items-center">
            {status === 'loading' ? (
              <Loader2 className="w-4 h-4 text-[#ffd21f] animate-spin" />
            ) : fallbackNode ? (
              fallbackNode
            ) : (
              <span className="text-[10px] text-[#8d8b9b] text-center px-1 leading-tight">
                {fallbackLabel}
              </span>
            )}
          </div>
        )}

        {allowExpand && status === 'loaded' && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 right-1 w-5 h-5 rounded-md bg-black/70 text-[#ffd21f] grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          >
            <Expand className="w-3 h-3" />
          </span>
        )}

        {overlay}
      </div>

      {expanded && resolvedUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <div
            className="relative max-w-2xl w-full max-h-[85vh] rounded-2xl overflow-hidden bg-[#181822] border border-white/15 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                {alt}
              </p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close image preview"
                className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg bg-[#262631] hover:bg-[#323240] text-[#f5f4f8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-[#101016] overflow-auto">
              <img
                src={resolvedUrl}
                alt={alt}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
