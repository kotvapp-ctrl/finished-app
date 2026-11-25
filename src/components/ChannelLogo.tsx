import { LAUNCHER_ICON } from '../data/channels';
import { BrandTheme, ChannelType } from '../types/broadcast';
import { normalizeMediaAssetUrl } from '../utils/mediaAssets';
import { AutoImagePreview } from './AutoImagePreview';

interface ChannelLogoProps {
  brand: BrandTheme;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  iconUrl?: string;
  type?: ChannelType;
  defaultStationIconUrl?: string;
  defaultRadioIconUrl?: string;
}

const BRAND_STYLES: Record<BrandTheme, string> = {
  default: 'bg-[#101016] text-[#ffd21f] border-[#ffd21f]/50',
  nbs: 'bg-[#df172c] text-white border-white/90',
  citizen: 'bg-white text-[#648e22] border-white',
  sanyuka: 'bg-[#f8f4e7] text-[#0b827e] border-white',
  sport: 'bg-[#04a9b8] text-white border-white/90',
  radio: 'bg-[#e9d7f5] text-[#6e287e] border-white/90',
};

export function ChannelLogo({
  brand,
  name,
  size = 'md',
  iconUrl,
  type,
  defaultStationIconUrl,
  defaultRadioIconUrl,
}: ChannelLogoProps) {
  const sizeClass =
    size === 'sm'
      ? 'w-11 h-11 text-[10px] rounded-lg'
      : size === 'lg'
        ? 'w-16 h-16 text-xs rounded-xl'
        : 'w-14 h-14 text-[11px] rounded-xl';

  const getLabel = () => {
    if (brand === 'nbs') return 'nbs';
    if (brand === 'citizen') {
      return name.toUpperCase().includes('UBC') ? 'UBC' : 'CITIZEN';
    }
    if (brand === 'sanyuka') return 'SANYUKA';
    if (brand === 'sport') return 'nbs SPORT';
    if (brand === 'radio') return 'KIIS';
    return 'KOTV';
  };

  const defaultBadgeFallback =
    brand === 'default' ? (
      <div
        className={`w-full h-full ${BRAND_STYLES.default} border overflow-hidden grid place-items-center select-none`}
      >
        <img
          src={LAUNCHER_ICON}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    ) : (
      <div
        className={`w-full h-full ${BRAND_STYLES[brand]} border-2 grid place-items-center font-extrabold leading-tight tracking-tight text-center px-1 select-none font-display`}
        aria-hidden="true"
      >
        {brand === 'sport' ? (
          <span className="leading-none">
            nbs
            <br />
            SPORT
          </span>
        ) : (
          getLabel()
        )}
      </div>
    );

  const customIcon =
    normalizeMediaAssetUrl(iconUrl) ||
    (type === 'Radios' ? normalizeMediaAssetUrl(defaultRadioIconUrl) : '') ||
    (brand === 'default' ? normalizeMediaAssetUrl(defaultStationIconUrl) : '');

  if (customIcon) {
    return (
      <div
        className={`${sizeClass} bg-[#101016] border border-white/15 shrink-0 overflow-hidden select-none`}
      >
        <AutoImagePreview
          src={customIcon}
          alt={name}
          className="w-full h-full bg-transparent"
          imgClassName="w-full h-full object-cover"
          fallbackNode={defaultBadgeFallback}
        />
      </div>
    );
  }

  if (brand === 'default') {
    return (
      <div
        className={`${sizeClass} ${BRAND_STYLES.default} shrink-0 border overflow-hidden grid place-items-center select-none`}
      >
        <img
          src={LAUNCHER_ICON}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} ${BRAND_STYLES[brand]} shrink-0 border-2 grid place-items-center font-extrabold leading-tight tracking-tight text-center px-1 select-none font-display`}
      aria-hidden="true"
    >
      {brand === 'sport' ? (
        <span className="leading-none">
          nbs
          <br />
          SPORT
        </span>
      ) : (
        getLabel()
      )}
    </div>
  );
}
