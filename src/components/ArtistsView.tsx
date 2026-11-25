import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Disc3,
  MapPin,
  Mic2,
  Music2,
  Play,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { ARTIST_GENRES, STUDIO_IMAGE } from '../data/channels';
import {
  ArtistGenre,
  ArtistProfile,
  Channel,
  StreamFormat,
} from '../types/broadcast';
import { AutoImagePreview } from './AutoImagePreview';

interface ArtistsViewProps {
  artists: ArtistProfile[];
  channels: Channel[];
  isAdmin?: boolean;
  onPlayArtist?: (
    channel: Channel,
    contextTitle?: string,
    overrideStreamUrl?: string,
    overrideStreamType?: StreamFormat
  ) => void;
  onOpenControlPanel?: (section: 'artists', itemId?: string) => void;
}

const GENRE_ACCENTS: Record<ArtistGenre, string> = {
  Afrobeat: 'bg-[#ffd21f]/15 text-[#ffd21f] border-[#ffd21f]/35',
  Gospel: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  'Kadongo Kamu': 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  'Hip Hop & Rap': 'bg-violet-500/15 text-violet-300 border-violet-500/35',
  Traditional: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  'RnB & Soul': 'bg-pink-500/15 text-pink-300 border-pink-500/35',
  Dancehall: 'bg-orange-500/15 text-orange-300 border-orange-500/35',
};

export function ArtistsView({
  artists,
  channels,
  isAdmin = false,
  onPlayArtist,
  onOpenControlPanel,
}: ArtistsViewProps) {
  const [selectedGenre, setSelectedGenre] = useState<'All' | ArtistGenre>(
    'All'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeArtist, setActiveArtist] = useState<ArtistProfile | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sortedArtists = useMemo(
    () =>
      [...artists].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)),
    [artists]
  );

  const filteredArtists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedArtists.filter((artist) => {
      if (selectedGenre !== 'All' && artist.stageGenre !== selectedGenre) {
        return false;
      }
      if (q) {
        const hay =
          `${artist.name} ${artist.stageGenre} ${artist.origin} ${artist.latestRelease} ${artist.bio}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedArtists, selectedGenre, searchQuery]);

  const showSpotlight =
    selectedGenre === 'All' &&
    searchQuery.trim() === '' &&
    filteredArtists.length > 0;

  const spotlightArtist = useMemo(() => {
    if (!showSpotlight) return null;
    return filteredArtists.find((a) => a.featured) || filteredArtists[0] || null;
  }, [showSpotlight, filteredArtists]);

  const gridArtists = useMemo(() => {
    if (!spotlightArtist) return filteredArtists;
    return filteredArtists.filter((a) => a.id !== spotlightArtist.id);
  }, [filteredArtists, spotlightArtist]);

  useEffect(() => {
    if (!activeArtist) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveArtist(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArtist]);

  const resolveArtistChannel = (artist: ArtistProfile): Channel | undefined => {
    if (artist.channelId) {
      const matched = channels.find((c) => c.id === artist.channelId);
      if (matched) return matched;
    }
    return channels[0];
  };

  const handlePlaySession = (artist: ArtistProfile) => {
    const targetCh = resolveArtistChannel(artist);
    if (!targetCh || !onPlayArtist) return;
    const context = artist.latestRelease
      ? `${artist.name} — ${artist.latestRelease}`
      : artist.name;
    onPlayArtist(
      targetCh,
      context,
      artist.mediaUrl?.trim() ? artist.mediaUrl.trim() : undefined,
      artist.streamType
    );
  };

  const handleShareArtist = async (artist: ArtistProfile) => {
    const shareText = `${artist.name} (${artist.stageGenre} · ${artist.origin})\nLatest Release: ${artist.latestRelease}\n— Featured on Kakumiro Online TV`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${artist.name} · Kakumiro Online TV Artists`,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareText).catch(() => undefined);
    }
    setCopiedId(artist.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#ffd21f]/15 border border-[#ffd21f]/35 text-[11px] font-bold uppercase tracking-wider text-[#ffd21f]">
              <Mic2 className="w-3.5 h-3.5" />
              <span>Music &amp; Talent Spotlight</span>
            </span>
            <span className="text-xs text-[#a5a3b2] font-mono-tabular">
              {sortedArtists.length}{' '}
              {sortedArtists.length === 1 ? 'artist' : 'artists'}
            </span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#f5f4f8] mt-2">
            Artists
          </h2>
          <p className="text-sm text-[#a5a3b2] mt-0.5">
            Featured musicians, choirs, live studio performers, and regional talent on Kakumiro Online TV
          </p>
        </div>

        {isAdmin && onOpenControlPanel && (
          <button
            type="button"
            onClick={() => onOpenControlPanel('artists')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Manage Artists</span>
          </button>
        )}
      </div>

      {/* Genre Filter & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
          role="tablist"
          aria-label="Artist genres"
        >
          {(['All', ...ARTIST_GENRES] as const).map((genre) => {
            const active = selectedGenre === genre;
            return (
              <button
                key={genre}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedGenre(genre)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                    : 'bg-[#1d1d26] text-[#e4e2ec] border-white/10 hover:bg-[#262631]'
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#a5a3b2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search artists, origin, song..."
            aria-label="Search artists"
            className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[#1d1d26] border border-white/10 focus:border-[#ffd21f] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
          />
        </div>
      </div>

      {/* Spotlight Featured Artist */}
      {spotlightArtist && (
        <article className="bg-[#1d1d26] border border-white/[0.08] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-5 relative min-h-[220px] lg:min-h-[270px] bg-[#121218]">
            <AutoImagePreview
              src={spotlightArtist.photoUrl || STUDIO_IMAGE}
              alt={spotlightArtist.name}
              className="w-full h-full bg-transparent"
              imgClassName="w-full h-full object-cover"
              fallbackNode={
                <div className="w-full h-full grid place-items-center text-[#ffd21f]">
                  <Mic2 className="w-10 h-10" />
                </div>
              }
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d26]/85 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#1d1d26]/45 pointer-events-none" />
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 border border-[#ffd21f]/40 text-[11px] font-bold text-[#ffd21f]">
              <Sparkles className="w-3 h-3" />
              Featured Artist
            </span>
          </div>

          <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wider ${
                    GENRE_ACCENTS[spotlightArtist.stageGenre]
                  }`}
                >
                  {spotlightArtist.stageGenre}
                </span>
                <span className="text-[#a5a3b2] flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#ffd21f]" />
                  {spotlightArtist.origin}
                </span>
              </div>

              <h3 className="font-display text-xl sm:text-2xl font-bold text-[#f5f4f8] leading-snug">
                {spotlightArtist.name}
              </h3>

              <p className="text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5">
                <Disc3 className="w-3.5 h-3.5 shrink-0" />
                <span>Latest Release: {spotlightArtist.latestRelease}</span>
              </p>

              <p className="text-sm text-[#c9c7d2] leading-relaxed">
                {spotlightArtist.bio}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2">
                {onPlayArtist && (spotlightArtist.mediaUrl || channels[0]) && (
                  <button
                    type="button"
                    onClick={() => handlePlaySession(spotlightArtist)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {spotlightArtist.mediaUrl
                        ? 'Play Featured Release'
                        : `Tune ${resolveArtistChannel(spotlightArtist)?.name || 'Live'}`}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveArtist(spotlightArtist)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] transition-colors"
                >
                  Artist Profile
                </button>
              </div>

              {isAdmin && onOpenControlPanel && (
                <button
                  type="button"
                  onClick={() => onOpenControlPanel('artists', spotlightArtist.id)}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#101016] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        </article>
      )}

      {/* Artists Grid */}
      {gridArtists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gridArtists.map((artist) => {
            const linkedChannel = resolveArtistChannel(artist);
            return (
              <article
                key={artist.id}
                className="bg-[#1d1d26] border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div className="relative aspect-[16/10] bg-[#121218]">
                  <AutoImagePreview
                    src={artist.photoUrl || STUDIO_IMAGE}
                    alt={artist.name}
                    className="w-full h-full bg-transparent"
                    imgClassName="w-full h-full object-cover"
                    fallbackNode={
                      <div className="w-full h-full grid place-items-center text-[#ffd21f]">
                        <Mic2 className="w-8 h-8" />
                      </div>
                    }
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d26] via-transparent to-transparent pointer-events-none" />
                  {isAdmin && onOpenControlPanel && (
                    <button
                      type="button"
                      onClick={() => onOpenControlPanel('artists', artist.id)}
                      className="absolute top-2.5 right-2.5 min-h-[32px] px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 border border-white/15 text-[11px] font-semibold text-[#ffd21f] flex items-center gap-1"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider ${
                          GENRE_ACCENTS[artist.stageGenre]
                        }`}
                      >
                        {artist.stageGenre}
                      </span>
                      <span className="text-[#a5a3b2] flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-[#ffd21f] shrink-0" />
                        <span className="truncate">{artist.origin}</span>
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-[#f5f4f8] leading-snug">
                      {artist.name}
                    </h3>

                    <p className="text-xs font-medium text-[#ffd21f] flex items-center gap-1.5 truncate">
                      <Music2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{artist.latestRelease}</span>
                    </p>

                    <p className="text-xs text-[#c9c7d2] leading-relaxed line-clamp-3">
                      {artist.bio}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    {onPlayArtist && (artist.mediaUrl || linkedChannel) && (
                      <button
                        type="button"
                        onClick={() => handlePlaySession(artist)}
                        className="min-h-[40px] flex-1 px-3 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 text-[#ffd21f] fill-current" />
                        <span>
                          {artist.mediaUrl ? 'Play release' : 'Watch / Listen'}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveArtist(artist)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#101016] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#e4e2ec] transition-colors shrink-0"
                    >
                      Bio
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : !spotlightArtist ? (
        <div className="p-8 rounded-2xl bg-[#1d1d26] border border-white/[0.06] text-center space-y-2">
          <Mic2 className="w-8 h-8 text-[#ffd21f] mx-auto" />
          <p className="text-sm font-semibold text-[#f5f4f8]">
            No artists match this genre or search
          </p>
          <p className="text-xs text-[#a5a3b2]">
            Clear your search or choose another genre filter above.
          </p>
        </div>
      ) : null}

      {/* Artist Profile Detail Modal */}
      {activeArtist && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="artist-profile-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveArtist(null);
          }}
        >
          <div className="w-full max-w-2xl max-h-[92vh] bg-[#16161f] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="px-4 sm:px-6 h-14 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 bg-[#101016]">
              <button
                type="button"
                onClick={() => setActiveArtist(null)}
                className="min-h-[40px] px-2 -ml-2 rounded-xl text-xs font-semibold text-[#c9c7d2] hover:text-[#f5f4f8] hover:bg-white/[0.06] inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>All Artists</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleShareArtist(activeArtist)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] inline-flex items-center gap-1.5"
                >
                  {copiedId === activeArtist.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#ffd21f]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-[#ffd21f]" />
                      <span>Share</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveArtist(null)}
                  aria-label="Close artist profile"
                  className="min-h-[38px] min-w-[38px] grid place-items-center rounded-xl text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-5 sm:p-7 space-y-5">
              <div className="rounded-2xl overflow-hidden border border-white/10 aspect-[16/9] bg-[#101016]">
                <AutoImagePreview
                  src={activeArtist.photoUrl || STUDIO_IMAGE}
                  alt={activeArtist.name}
                  allowExpand
                  className="w-full h-full bg-transparent"
                  imgClassName="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wider ${
                      GENRE_ACCENTS[activeArtist.stageGenre]
                    }`}
                  >
                    {activeArtist.stageGenre}
                  </span>
                  <span className="text-[#a5a3b2] flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#ffd21f]" />
                    {activeArtist.origin}
                  </span>
                </div>

                <h2
                  id="artist-profile-title"
                  className="font-display text-2xl sm:text-3xl font-extrabold text-[#f5f4f8] leading-tight"
                >
                  {activeArtist.name}
                </h2>

                <p className="text-sm font-semibold text-[#ffd21f] flex items-center gap-1.5">
                  <Disc3 className="w-4 h-4 shrink-0" />
                  <span>Latest Release: {activeArtist.latestRelease}</span>
                </p>
              </div>

              <div className="space-y-3 text-sm sm:text-base text-[#d9d7e3] leading-relaxed border-t border-white/[0.08] pt-4">
                {activeArtist.bio
                  .split(/\n+/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))}
              </div>

              {onPlayArtist && (activeArtist.mediaUrl || channels[0]) && (
                <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#f5f4f8]">
                      {activeArtist.mediaUrl
                        ? 'Stream Featured Music Video / Track'
                        : `Featured on ${resolveArtistChannel(activeArtist)?.name || 'Kakumiro Online TV'}`}
                    </p>
                    <p className="text-[11px] text-[#a5a3b2]">
                      {activeArtist.latestRelease}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = activeArtist;
                      setActiveArtist(null);
                      handlePlaySession(target);
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold inline-flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {activeArtist.mediaUrl ? 'Play Now' : 'Watch Live Station'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
