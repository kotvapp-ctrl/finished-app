import { Eye, Heart } from 'lucide-react';
import { Channel } from '../types/broadcast';
import { ChannelLogo } from './ChannelLogo';

interface ChannelCardProps {
  channel: Channel;
  isFavorite: boolean;
  isActive?: boolean;
  viewerCount?: number;
  defaultStationIconUrl?: string;
  defaultRadioIconUrl?: string;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
}

export function ChannelCard({
  channel,
  isFavorite,
  isActive = false,
  viewerCount = 0,
  defaultStationIconUrl,
  defaultRadioIconUrl,
  onSelect,
  onToggleFavorite,
}: ChannelCardProps) {
  const hasLiveStreamUrl = Boolean(channel.streamUrl?.trim());
  const isLive = hasLiveStreamUrl || isActive;
  const showViewerCount =
    channel.type === 'Television' && hasLiveStreamUrl && viewerCount > 0;

  return (
    <article className="group bg-[#1d1d26] hover:bg-[#23232e] rounded-2xl overflow-hidden border border-white/[0.06] transition-colors duration-150 flex flex-col justify-between">
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => onSelect(channel)}
          className="flex-1 min-w-0 flex items-center gap-4 text-left focus-visible:outline-2 focus-visible:outline-[#1685ff] focus-visible:outline-offset-2 rounded-xl"
        >
          <ChannelLogo
            brand={channel.brand}
            name={channel.name}
            size="md"
            iconUrl={channel.iconUrl}
            type={channel.type}
            defaultStationIconUrl={defaultStationIconUrl}
            defaultRadioIconUrl={defaultRadioIconUrl}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-[17px] sm:text-lg font-semibold text-[#f5f4f8] truncate leading-snug">
                {channel.name}
              </h3>
              {isLive && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#d4162a] text-white text-[10px] font-extrabold tracking-[0.08em] uppercase leading-none whitespace-nowrap shrink-0">
                  LIVE
                </span>
              )}
              {showViewerCount && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.08] text-[#e4e2ec] text-[11px] font-semibold font-mono-tabular leading-none whitespace-nowrap shrink-0"
                  aria-label={`${viewerCount} watching live`}
                >
                  <Eye className="w-3 h-3 text-[#ffd21f]" />
                  {viewerCount.toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-sm text-[#a5a3b2] truncate mt-1">
              <span>{channel.program || channel.subtitle || 'Tap to watch'}</span>
              {channel.subtitle && channel.program !== channel.subtitle && (
                <>
                  <span aria-hidden="true" className="mx-1.5 text-[#5a5869]">
                    ·
                  </span>
                  <span>{channel.subtitle}</span>
                </>
              )}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(channel.id)}
          aria-label={
            isFavorite
              ? `Remove ${channel.name} from favorites`
              : `Add ${channel.name} to favorites`
          }
          aria-pressed={isFavorite}
          className={`min-h-[44px] min-w-[44px] shrink-0 grid place-items-center rounded-xl transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#1685ff] ${
            isFavorite
              ? 'text-[#ffd21f] bg-[#ffd21f]/10 hover:bg-[#ffd21f]/15'
              : 'text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06]'
          }`}
        >
          <Heart className="w-5 h-5" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div
        className="h-1.5 w-full bg-[#3a3319]"
        role="progressbar"
        aria-valuenow={channel.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${channel.program} progress`}
      >
        <div
          className="h-full bg-[#ffd21f] transition-transform duration-200 origin-left"
          style={{ width: `${Math.min(100, Math.max(0, channel.progress))}%` }}
        />
      </div>
    </article>
  );
}
