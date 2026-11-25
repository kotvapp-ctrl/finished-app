import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  Check,
  Clapperboard,
  CloudUpload,
  Film,
  Library,
  Loader2,
  Play,
  Radio,
  Save,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Tv,
  Upload,
  Wand2,
} from 'lucide-react';
import { auth } from '../../firebase';
import {
  ArchiveItem,
  Channel,
  GuideProgramme,
  HomeConfig,
  MovieItem,
} from '../../types/broadcast';
import { uploadMediaFileToCloud } from '../../services/cloudStorage';
import { compressImageFileToDataUrl } from '../../utils/mediaAssets';
import { autoDetectThumbnailFromUrl } from '../../utils/thumbnailExtractor';
import { AutoImagePreview } from '../AutoImagePreview';
import { ChannelLogo } from '../ChannelLogo';
import { ThumbnailCutoutModal } from '../ThumbnailCutoutModal';

type MediaLibraryFilter =
  | 'all'
  | 'streams'
  | 'programmes'
  | 'movies'
  | 'recordings';

type AutoArtSlotKey =
  | 'tvArchiveAutoArtUrl'
  | 'podcastAutoArtUrl'
  | 'watchCatchupAutoArtUrl'
  | 'movieAutoArtUrl'
  | 'stationIconUrl'
  | 'radioIconUrl'
  | 'updatesIconUrl'
  | 'newsIconUrl';

type CutoutTarget =
  | { kind: 'movie'; movie: MovieItem }
  | { kind: 'archive'; item: ArchiveItem }
  | {
      kind: 'autoArt';
      key: AutoArtSlotKey;
      label: string;
      aspect: 'landscape' | 'poster';
    };

interface AdminMediaLibraryTabProps {
  channels: Channel[];
  guideSchedule: GuideProgramme[];
  movies: MovieItem[];
  archiveItems: ArchiveItem[];
  homeConfig: HomeConfig;
  firebaseConnected?: boolean;
  onPreviewChannel?: (channel: Channel) => void;
  onPreviewMovie?: (movie: MovieItem) => void;
  onPreviewArchiveItem?: (item: ArchiveItem) => void;
  onJumpToChannel: (channelId: string) => void;
  onJumpToGuide: (channelId: string) => void;
  onJumpToMovie: (movie: MovieItem) => void;
  onJumpToArchive: (item: ArchiveItem) => void;
  onUpdateMovie: (movie: MovieItem) => void;
  onUpdateArchiveItem: (item: ArchiveItem) => void;
  onUpdateHomeConfig: (config: HomeConfig) => void;
  onSyncToCloud?: () => Promise<void>;
  onDeleteChannel: (channelId: string) => void;
  onDeleteMovie: (movieId: string) => void;
  onDeleteArchiveItem: (itemId: string) => void;
  onNotice: (msg: string) => void;
}

const AUTO_ART_SLOTS: {
  key: AutoArtSlotKey;
  label: string;
  helper: string;
  aspect: 'landscape' | 'poster';
}[] = [
  {
    key: 'tvArchiveAutoArtUrl',
    label: 'TV Archive Auto Art',
    helper: 'Fallback artwork for TV Archive cards missing a thumbnail',
    aspect: 'landscape',
  },
  {
    key: 'podcastAutoArtUrl',
    label: 'Podcasts Auto Art',
    helper: 'Default cover artwork for Podcasts & Audio cards',
    aspect: 'landscape',
  },
  {
    key: 'watchCatchupAutoArtUrl',
    label: 'Watch Catch-up Rail Auto Art',
    helper: 'Fallback artwork for cards inside Watch player catch-up rail',
    aspect: 'landscape',
  },
  {
    key: 'movieAutoArtUrl',
    label: 'Movies & Series Auto Art',
    helper: 'Fallback poster photo for Movies & Series missing poster art',
    aspect: 'poster',
  },
];

const GLOBAL_ICON_SLOTS: {
  key: AutoArtSlotKey;
  label: string;
  helper: string;
  aspect: 'landscape' | 'poster';
}[] = [
  {
    key: 'stationIconUrl',
    label: 'Station & App Icon (KOTV)',
    helper: 'App icon on More screen & default KOTV channel icon',
    aspect: 'landscape',
  },
  {
    key: 'radioIconUrl',
    label: 'Radios Default Icon',
    helper: 'Fallback icon for Radio stations without a custom channel icon',
    aspect: 'landscape',
  },
  {
    key: 'updatesIconUrl',
    label: 'Updates & Live Alerts Icon',
    helper: 'Icon shown on Live Alerts menu, banners & recent station updates',
    aspect: 'landscape',
  },
  {
    key: 'newsIconUrl',
    label: 'Breaking News Icon',
    helper: 'Custom icon shown for the Breaking News entry on More screen',
    aspect: 'landscape',
  },
];

export function AdminMediaLibraryTab({
  channels,
  guideSchedule,
  movies,
  archiveItems,
  homeConfig,
  firebaseConnected = false,
  onPreviewChannel,
  onPreviewMovie,
  onPreviewArchiveItem,
  onJumpToChannel,
  onJumpToGuide,
  onJumpToMovie,
  onJumpToArchive,
  onUpdateMovie,
  onUpdateArchiveItem,
  onUpdateHomeConfig,
  onSyncToCloud,
  onDeleteChannel,
  onDeleteMovie,
  onDeleteArchiveItem,
  onNotice,
}: AdminMediaLibraryTabProps) {
  const [filter, setFilter] = useState<MediaLibraryFilter>('all');
  const [query, setQuery] = useState('');

  const [railDraft, setRailDraft] = useState<{
    showWatchCatchupRail: boolean;
    watchCatchupTitle: string;
    tvArchiveAutoArtUrl: string;
    podcastAutoArtUrl: string;
    watchCatchupAutoArtUrl: string;
    movieAutoArtUrl: string;
    stationIconUrl: string;
    radioIconUrl: string;
    updatesIconUrl: string;
    newsIconUrl: string;
  }>({
    showWatchCatchupRail: homeConfig.showWatchCatchupRail !== false,
    watchCatchupTitle: homeConfig.watchCatchupTitle || 'More like this',
    tvArchiveAutoArtUrl: homeConfig.tvArchiveAutoArtUrl || '',
    podcastAutoArtUrl: homeConfig.podcastAutoArtUrl || '',
    watchCatchupAutoArtUrl: homeConfig.watchCatchupAutoArtUrl || '',
    movieAutoArtUrl: homeConfig.movieAutoArtUrl || '',
    stationIconUrl: homeConfig.stationIconUrl || '',
    radioIconUrl: homeConfig.radioIconUrl || '',
    updatesIconUrl: homeConfig.updatesIconUrl || '',
    newsIconUrl: homeConfig.newsIconUrl || '',
  });

  useEffect(() => {
    setRailDraft({
      showWatchCatchupRail: homeConfig.showWatchCatchupRail !== false,
      watchCatchupTitle: homeConfig.watchCatchupTitle || 'More like this',
      tvArchiveAutoArtUrl: homeConfig.tvArchiveAutoArtUrl || '',
      podcastAutoArtUrl: homeConfig.podcastAutoArtUrl || '',
      watchCatchupAutoArtUrl: homeConfig.watchCatchupAutoArtUrl || '',
      movieAutoArtUrl: homeConfig.movieAutoArtUrl || '',
      stationIconUrl: homeConfig.stationIconUrl || '',
      radioIconUrl: homeConfig.radioIconUrl || '',
      updatesIconUrl: homeConfig.updatesIconUrl || '',
      newsIconUrl: homeConfig.newsIconUrl || '',
    });
  }, [
    homeConfig.showWatchCatchupRail,
    homeConfig.watchCatchupTitle,
    homeConfig.tvArchiveAutoArtUrl,
    homeConfig.podcastAutoArtUrl,
    homeConfig.watchCatchupAutoArtUrl,
    homeConfig.movieAutoArtUrl,
    homeConfig.stationIconUrl,
    homeConfig.radioIconUrl,
    homeConfig.updatesIconUrl,
    homeConfig.newsIconUrl,
  ]);

  const [syncingCloud, setSyncingCloud] = useState(false);
  const [batchDetecting, setBatchDetecting] = useState(false);
  const [batchProgressNote, setBatchProgressNote] = useState('');
  const [detectingItemId, setDetectingItemId] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [savingAutoArt, setSavingAutoArt] = useState(false);
  const [cutoutTarget, setCutoutTarget] = useState<CutoutTarget | null>(null);

  const uploadTargetRef = useRef<
    | { kind: 'movie'; movie: MovieItem }
    | { kind: 'archive'; item: ArchiveItem }
    | { kind: 'autoArt'; key: AutoArtSlotKey; label: string }
    | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const q = query.trim().toLowerCase();

  const liveStreamChannels = useMemo(
    () =>
      channels.filter((ch) => {
        if (!q) return true;
        return `${ch.name} ${ch.program} ${ch.subtitle} ${ch.type}`
          .toLowerCase()
          .includes(q);
      }),
    [channels, q]
  );

  const programmeRows = useMemo(
    () =>
      channels
        .map((ch) => {
          const slot = guideSchedule.find((g) => g.channelId === ch.id);
          return {
            channel: ch,
            currentTitle: slot?.currentTitle || ch.program || ch.name,
            currentTime: slot?.currentTime || 'Live now',
            nextTitle: slot?.nextTitle || 'Up Next',
            nextTime: slot?.nextTime || 'Next',
          };
        })
        .filter((row) => {
          if (!q) return true;
          return `${row.channel.name} ${row.currentTitle} ${row.nextTitle}`
            .toLowerCase()
            .includes(q);
        }),
    [channels, guideSchedule, q]
  );

  const filteredMovies = useMemo(
    () =>
      movies.filter((m) => {
        if (!q) return true;
        return `${m.title} ${m.genre} ${m.format} ${m.channelName} ${m.year}`
          .toLowerCase()
          .includes(q);
      }),
    [movies, q]
  );

  const filteredRecordings = useMemo(
    () =>
      archiveItems.filter((a) => {
        if (!q) return true;
        return `${a.title} ${a.category} ${a.channelName} ${a.description}`
          .toLowerCase()
          .includes(q);
      }),
    [archiveItems, q]
  );

  const liveLinksCount = channels.filter((c) => Boolean(c.streamUrl?.trim())).length;
  const missingThumbsCount =
    movies.filter((m) => !m.posterPath?.trim() && Boolean(m.streamUrl?.trim()))
      .length +
    archiveItems.filter(
      (a) => !a.thumbnailPath?.trim() && Boolean(a.mediaUrl?.trim())
    ).length;

  const uploadOrCompressImage = async (
    file: File,
    folder: string,
    maxDataUrlLength = 120_000
  ): Promise<string> => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      try {
        const { record } = await uploadMediaFileToCloud({
          file,
          uid,
          description: `Control Panel thumbnail upload (${folder})`,
          publicVisible: true,
        });
        if (record.url && !record.url.startsWith('vault://')) {
          return record.url;
        }
      } catch {
        // Fallback to compact JPEG data URL synced directly in Firestore
      }
    }
    return compressImageFileToDataUrl(file, maxDataUrlLength);
  };

  const triggerImageUpload = (
    target:
      | { kind: 'movie'; movie: MovieItem }
      | { kind: 'archive'; item: ArchiveItem }
      | { kind: 'autoArt'; key: AutoArtSlotKey; label: string }
  ) => {
    uploadTargetRef.current = target;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTargetRef.current;
    if (!file || !target) return;

    const opKey =
      target.kind === 'movie'
        ? `mov:${target.movie.id}`
        : target.kind === 'archive'
          ? `arc:${target.item.id}`
          : target.key;

    setUploadingKey(opKey);
    try {
      const imageUrl = await uploadOrCompressImage(
        file,
        target.kind,
        target.kind === 'autoArt' ? 120_000 : 150_000
      );

      if (target.kind === 'movie') {
        onUpdateMovie({ ...target.movie, posterPath: imageUrl });
        onNotice(`Poster updated online for "${target.movie.title}".`);
      } else if (target.kind === 'archive') {
        onUpdateArchiveItem({ ...target.item, thumbnailPath: imageUrl });
        onNotice(`Thumbnail updated online for "${target.item.title}".`);
      } else {
        const nextConfig: HomeConfig = {
          ...homeConfig,
          ...railDraft,
          [target.key]: imageUrl,
        };
        setRailDraft((prev) => ({ ...prev, [target.key]: imageUrl }));
        onUpdateHomeConfig(nextConfig);
        onNotice(`${target.label} uploaded and saved online.`);
      }
    } catch (err) {
      onNotice(
        err instanceof Error
          ? err.message
          : 'Failed to process image upload. Try a smaller photo or paste an image URL.'
      );
    } finally {
      setUploadingKey(null);
      uploadTargetRef.current = null;
    }
  };

  const handleAutoDetectMovie = async (mov: MovieItem) => {
    if (!mov.streamUrl?.trim()) {
      onNotice(`"${mov.title}" has no video URL yet. Use Cutout or Upload to set its poster.`);
      return;
    }
    setDetectingItemId(`mov:${mov.id}`);
    try {
      const res = await autoDetectThumbnailFromUrl(mov.streamUrl, 'poster');
      if (!res.thumbnailUrl) {
        onNotice(res.note || `Could not auto-detect poster from "${mov.title}". Try Cutout.`);
        return;
      }
      onUpdateMovie({ ...mov, posterPath: res.thumbnailUrl });
      onNotice(`Auto-detected and saved online poster for "${mov.title}".`);
    } finally {
      setDetectingItemId(null);
    }
  };

  const handleAutoDetectArchive = async (item: ArchiveItem) => {
    if (!item.mediaUrl?.trim()) {
      onNotice(`"${item.title}" has no media URL yet. Use Cutout or Upload to set a thumbnail.`);
      return;
    }
    setDetectingItemId(`arc:${item.id}`);
    try {
      const res = await autoDetectThumbnailFromUrl(item.mediaUrl, 'landscape');
      if (!res.thumbnailUrl) {
        onNotice(res.note || `Could not auto-detect thumbnail from "${item.title}". Try Cutout.`);
        return;
      }
      onUpdateArchiveItem({ ...item, thumbnailPath: res.thumbnailUrl });
      onNotice(`Auto-detected and saved online thumbnail for "${item.title}".`);
    } finally {
      setDetectingItemId(null);
    }
  };

  const handleBatchAutoDetect = async () => {
    const movieCandidates = movies.filter(
      (m) => !m.posterPath?.trim() && Boolean(m.streamUrl?.trim())
    );
    const archiveCandidates = archiveItems.filter(
      (a) => !a.thumbnailPath?.trim() && Boolean(a.mediaUrl?.trim())
    );
    const total = movieCandidates.length + archiveCandidates.length;
    if (total === 0) {
      onNotice('All linked movies, TV archive, and podcast items already have thumbnails.');
      return;
    }

    setBatchDetecting(true);
    let updatedCount = 0;
    let processed = 0;

    try {
      for (const mov of movieCandidates) {
        processed += 1;
        setBatchProgressNote(`Scanning ${processed}/${total}: ${mov.title}`);
        const res = await autoDetectThumbnailFromUrl(mov.streamUrl || '', 'poster');
        if (res.thumbnailUrl) {
          onUpdateMovie({ ...mov, posterPath: res.thumbnailUrl });
          updatedCount += 1;
        }
      }

      for (const item of archiveCandidates) {
        processed += 1;
        setBatchProgressNote(`Scanning ${processed}/${total}: ${item.title}`);
        const res = await autoDetectThumbnailFromUrl(item.mediaUrl || '', 'landscape');
        if (res.thumbnailUrl) {
          onUpdateArchiveItem({ ...item, thumbnailPath: res.thumbnailUrl });
          updatedCount += 1;
        }
      }

      onNotice(
        updatedCount > 0
          ? `Batch Auto-Detect saved ${updatedCount} thumbnail${updatedCount === 1 ? '' : 's'} online.`
          : 'No extractable thumbnails found automatically — use Cutout or Auto Art photos below.'
      );
    } finally {
      setBatchDetecting(false);
      setBatchProgressNote('');
    }
  };

  const handleSaveAutoArtOnline = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAutoArt(true);
    try {
      onUpdateHomeConfig({
        ...homeConfig,
        showWatchCatchupRail: railDraft.showWatchCatchupRail,
        watchCatchupTitle: railDraft.watchCatchupTitle.trim() || 'More like this',
        tvArchiveAutoArtUrl: railDraft.tvArchiveAutoArtUrl.trim(),
        podcastAutoArtUrl: railDraft.podcastAutoArtUrl.trim(),
        watchCatchupAutoArtUrl: railDraft.watchCatchupAutoArtUrl.trim(),
        movieAutoArtUrl: railDraft.movieAutoArtUrl.trim(),
        stationIconUrl: railDraft.stationIconUrl.trim(),
        radioIconUrl: railDraft.radioIconUrl.trim(),
        updatesIconUrl: railDraft.updatesIconUrl.trim(),
        newsIconUrl: railDraft.newsIconUrl.trim(),
      });
      onNotice('Watch Catch-up Rail, Auto-Art photos, and Station/Radio/Updates icons saved online.');
    } finally {
      setSavingAutoArt(false);
    }
  };

  const handleSyncCatalog = async () => {
    if (!onSyncToCloud) return;
    setSyncingCloud(true);
    try {
      await onSyncToCloud();
    } finally {
      setSyncingCloud(false);
    }
  };

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Online Control & Batch Thumbnail Bar */}
      <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
                <Library className="w-4 h-4 text-[#ffd21f]" />
                Online Broadcast Media Library
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                  firebaseConnected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-[#c9c7d2]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    firebaseConnected ? 'bg-emerald-400' : 'bg-[#ffd21f]'
                  }`}
                />
                {firebaseConnected ? 'Online · Live in Control Panel' : 'Offline Local Mode'}
              </span>
            </div>
            <p className="text-xs text-[#a5a3b2] mt-1">
              Control Watch Catch-up Rail, TV Archive, Podcasts, and Movie thumbnails or Auto-Art photos online across all viewers
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBatchAutoDetect}
              disabled={batchDetecting || missingThumbsCount === 0}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#ffd21f]/15 hover:bg-[#ffd21f]/25 border border-[#ffd21f]/35 text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5 disabled:opacity-50"
            >
              {batchDetecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              <span>
                {batchDetecting
                  ? 'Scanning...'
                  : `Auto-Detect Missing (${missingThumbsCount})`}
              </span>
            </button>

            {onSyncToCloud && (
              <button
                type="button"
                onClick={handleSyncCatalog}
                disabled={syncingCloud}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 disabled:opacity-60"
              >
                {syncingCloud ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ffd21f]" />
                ) : (
                  <CloudUpload className="w-3.5 h-3.5 text-[#ffd21f]" />
                )}
                <span>{syncingCloud ? 'Syncing...' : 'Sync Catalog Online'}</span>
              </button>
            )}
          </div>
        </div>

        {batchProgressNote && (
          <p className="text-xs text-[#ffd21f] font-medium">{batchProgressNote}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: 'All Media' },
                { id: 'streams', label: `Live Streams (${channels.length})` },
                { id: 'programmes', label: `TV Programmes (${guideSchedule.length})` },
                { id: 'movies', label: `Movies & Series (${movies.length})` },
                {
                  id: 'recordings',
                  label: `TV Archive & Podcasts (${archiveItems.length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'bg-[#ffd21f] text-[#101016]'
                    : 'bg-[#1d1d26] text-[#c9c7d2] border border-white/[0.08] hover:bg-[#262631]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="hidden md:inline text-[11px] text-[#a5a3b2] font-mono-tabular whitespace-nowrap">
              {liveLinksCount} live · {movies.length} movies · {archiveItems.length} archive
            </span>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#a5a3b2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search media library..."
                className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Watch Catch-up Rail & Global Online Auto-Art Photos Controller */}
      <form
        onSubmit={handleSaveAutoArtOnline}
        className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#ffd21f]" />
              Watch Catch-up Rail &amp; Auto-Art Photos (Online)
            </h4>
            <p className="text-xs text-[#a5a3b2] mt-0.5">
              Update Watch Catch-up Rail visibility/title and set online Auto-Art fallback photos for TV Archive, Podcasts, Catch-up Rail, and Movies
            </p>
          </div>
          <button
            type="submit"
            disabled={savingAutoArt}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
          >
            {savingAutoArt ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save Auto-Art &amp; Rail Online</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06]">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-[#f5f4f8]">
                Show Watch Catch-up Rail
              </p>
              <p className="text-[11px] text-[#a5a3b2]">
                Display related catch-up cards underneath the Watch player
              </p>
            </div>
            <input
              type="checkbox"
              checked={railDraft.showWatchCatchupRail}
              onChange={(e) =>
                setRailDraft((prev) => ({
                  ...prev,
                  showWatchCatchupRail: e.target.checked,
                }))
              }
              className="w-4 h-4 accent-[#ffd21f] rounded shrink-0"
            />
          </label>

          <div>
            <label
              htmlFor="watch-catchup-title-input"
              className="block text-[11px] font-semibold text-[#c9c7d2] mb-1"
            >
              Watch Catch-up Rail Heading
            </label>
            <input
              id="watch-catchup-title-input"
              type="text"
              maxLength={80}
              value={railDraft.watchCatchupTitle}
              onChange={(e) =>
                setRailDraft((prev) => ({
                  ...prev,
                  watchCatchupTitle: e.target.value,
                }))
              }
              placeholder="More like this"
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AUTO_ART_SLOTS.map((slot) => {
            const currentVal = railDraft[slot.key];
            const isUploading = uploadingKey === slot.key;
            return (
              <div
                key={slot.key}
                className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5"
              >
                <div className="flex items-start gap-3">
                  <AutoImagePreview
                    src={currentVal}
                    alt={slot.label}
                    fallbackLabel="Auto art"
                    allowExpand
                    className={`rounded-lg border border-white/10 shrink-0 ${
                      slot.aspect === 'poster' ? 'w-12 h-16' : 'w-20 h-12'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5">
                      <span>{slot.label}</span>
                      {currentVal.trim() && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </p>
                    <p className="text-[11px] text-[#a5a3b2] mt-0.5 leading-snug">
                      {slot.helper}
                    </p>
                  </div>
                </div>

                <input
                  type="url"
                  maxLength={140000}
                  value={currentVal}
                  onChange={(e) =>
                    setRailDraft((prev) => ({
                      ...prev,
                      [slot.key]: e.target.value,
                    }))
                  }
                  placeholder="Paste Auto-Art image URL (https://...) or Upload/Cutout"
                  className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() =>
                      triggerImageUpload({
                        kind: 'autoArt',
                        key: slot.key,
                        label: slot.label,
                      })
                    }
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#101016] hover:bg-[#262631] border border-white/10 text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[#ffd21f]" />
                    ) : (
                      <Upload className="w-3 h-3 text-[#ffd21f]" />
                    )}
                    <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCutoutTarget({
                        kind: 'autoArt',
                        key: slot.key,
                        label: slot.label,
                        aspect: slot.aspect,
                      })
                    }
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#101016] hover:bg-[#262631] border border-white/10 text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1"
                  >
                    <Scissors className="w-3 h-3 text-[#ffd21f]" />
                    <span>Cutout</span>
                  </button>

                  {currentVal.trim() && (
                    <button
                      type="button"
                      onClick={() =>
                        setRailDraft((prev) => ({ ...prev, [slot.key]: '' }))
                      }
                      className="min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pt-2 border-t border-white/[0.06] space-y-3">
          <div>
            <h5 className="text-xs font-semibold text-[#ffd21f] uppercase tracking-wider">
              Updates, Radios &amp; Station Icons (Online)
            </h5>
            <p className="text-[11px] text-[#a5a3b2] mt-0.5">
              Customize icons for Updates/Live Alerts, Radios default, Breaking News, and the main Kakumiro Online TV station badge
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {GLOBAL_ICON_SLOTS.map((slot) => {
              const currentVal = railDraft[slot.key];
              const isUploading = uploadingKey === slot.key;
              return (
                <div
                  key={slot.key}
                  className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] space-y-2.5"
                >
                  <div className="flex items-start gap-3">
                    <AutoImagePreview
                      src={currentVal}
                      alt={slot.label}
                      fallbackLabel="Default"
                      allowExpand
                      className="w-12 h-12 rounded-xl border border-white/10 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5">
                        <span>{slot.label}</span>
                        {currentVal.trim() && (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                      </p>
                      <p className="text-[11px] text-[#a5a3b2] mt-0.5 leading-snug">
                        {slot.helper}
                      </p>
                    </div>
                  </div>

                  <input
                    type="url"
                    maxLength={140000}
                    value={currentVal}
                    onChange={(e) =>
                      setRailDraft((prev) => ({
                        ...prev,
                        [slot.key]: e.target.value,
                      }))
                    }
                    placeholder="Paste icon image URL (https://...) or Upload/Cutout"
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() =>
                        triggerImageUpload({
                          kind: 'autoArt',
                          key: slot.key,
                          label: slot.label,
                        })
                      }
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#101016] hover:bg-[#262631] border border-white/10 text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-[#ffd21f]" />
                      ) : (
                        <Upload className="w-3 h-3 text-[#ffd21f]" />
                      )}
                      <span>{isUploading ? 'Uploading...' : 'Upload Icon'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setCutoutTarget({
                          kind: 'autoArt',
                          key: slot.key,
                          label: slot.label,
                          aspect: slot.aspect,
                        })
                      }
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#101016] hover:bg-[#262631] border border-white/10 text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1"
                    >
                      <Scissors className="w-3 h-3 text-[#ffd21f]" />
                      <span>Cutout</span>
                    </button>

                    {currentVal.trim() && (
                      <button
                        type="button"
                        onClick={() =>
                          setRailDraft((prev) => ({ ...prev, [slot.key]: '' }))
                        }
                        className="min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                      >
                        Reset Default
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </form>

      {/* Live-Stream Links */}
      {(filter === 'all' || filter === 'streams') && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#c9c7d2] flex items-center gap-1.5">
            <Tv className="w-3.5 h-3.5 text-[#ffd21f]" />
            Live TV &amp; Radio Stream Links ({liveStreamChannels.length})
          </p>
          {liveStreamChannels.map((ch) => (
            <div
              key={`lib-ch-${ch.id}`}
              className="p-3 rounded-xl bg-[#101016] border border-white/[0.06] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ChannelLogo
                  brand={ch.brand}
                  name={ch.name}
                  size="sm"
                  iconUrl={ch.iconUrl}
                  type={ch.type}
                  defaultStationIconUrl={railDraft.stationIconUrl}
                  defaultRadioIconUrl={railDraft.radioIconUrl}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#f5f4f8] truncate flex items-center gap-2">
                    {ch.type === 'Radios' ? (
                      <Radio className="w-3.5 h-3.5 text-[#ffd21f] shrink-0" />
                    ) : (
                      <Tv className="w-3.5 h-3.5 text-[#ffd21f] shrink-0" />
                    )}
                    <span className="truncate">{ch.name}</span>
                  </p>
                  <p className="text-xs text-[#a5a3b2] truncate">
                    {ch.type} · {ch.program} ·{' '}
                    {ch.streamUrl?.trim() ? 'Stream linked' : 'No stream URL set'}
                    {ch.iconUrl?.trim() ? ' · Custom icon' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onPreviewChannel && (
                  <button
                    type="button"
                    onClick={() => onPreviewChannel(ch)}
                    aria-label={`Play ${ch.name}`}
                    className="min-h-[34px] min-w-[34px] grid place-items-center rounded-lg text-[#ffd21f] hover:bg-[#ffd21f]/10"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onJumpToChannel(ch.id)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Edit
                </button>
                {channels.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteChannel(ch.id);
                      onNotice(`Removed channel "${ch.name}".`);
                    }}
                    aria-label={`Delete ${ch.name}`}
                    className="min-h-[34px] min-w-[34px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TV Programmes */}
      {(filter === 'all' || filter === 'programmes') && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#c9c7d2] flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5 text-[#ffd21f]" />
            TV Guide Programmes ({programmeRows.length})
          </p>
          {programmeRows.map((row) => (
            <div
              key={`lib-prog-${row.channel.id}`}
              className="p-3 rounded-xl bg-[#101016] border border-white/[0.06] flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                  {row.currentTitle}
                </p>
                <p className="text-xs text-[#a5a3b2] truncate">
                  {row.channel.name} · {row.currentTime} → Next: {row.nextTitle} (
                  {row.nextTime})
                </p>
              </div>
              <button
                type="button"
                onClick={() => onJumpToGuide(row.channel.id)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] shrink-0"
              >
                Edit Slot
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Movies & Series */}
      {(filter === 'all' || filter === 'movies') && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#c9c7d2] flex items-center gap-1.5">
            <Clapperboard className="w-3.5 h-3.5 text-[#ffd21f]" />
            Movies &amp; Series ({filteredMovies.length})
          </p>
          {filteredMovies.map((mov) => {
            const isDetecting = detectingItemId === `mov:${mov.id}`;
            const isUploading = uploadingKey === `mov:${mov.id}`;
            const effectivePoster = mov.posterPath || railDraft.movieAutoArtUrl;
            return (
              <div
                key={`lib-mov-${mov.id}`}
                className="p-3 rounded-xl bg-[#101016] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <AutoImagePreview
                    src={effectivePoster}
                    alt={mov.title}
                    fallbackLabel="Auto art"
                    allowExpand
                    className="w-10 h-14 rounded-lg border border-white/10 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                      {mov.title}
                    </p>
                    <p className="text-xs text-[#a5a3b2] truncate">
                      {mov.format === 'series' ? 'Series' : 'Movie'} · {mov.genre} ·{' '}
                      {mov.year} · {mov.duration}
                      {mov.posterPath?.trim()
                        ? ' · Custom poster'
                        : railDraft.movieAutoArtUrl.trim()
                          ? ' · Global Auto Art'
                          : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleAutoDetectMovie(mov)}
                    disabled={isDetecting || batchDetecting}
                    title="Auto-detect poster from video URL"
                    className="min-h-[32px] px-2 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-[11px] font-semibold text-[#ffd21f] flex items-center gap-1 disabled:opacity-50"
                  >
                    {isDetecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    <span>Auto-detect</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoutTarget({ kind: 'movie', movie: mov })}
                    className="min-h-[32px] px-2 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1"
                  >
                    <Scissors className="w-3 h-3 text-[#ffd21f]" />
                    <span>Cutout</span>
                  </button>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => triggerImageUpload({ kind: 'movie', movie: mov })}
                    className="min-h-[32px] px-2 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[#ffd21f]" />
                    ) : (
                      <Upload className="w-3 h-3 text-[#ffd21f]" />
                    )}
                    <span>Upload</span>
                  </button>
                  {onPreviewMovie && (
                    <button
                      type="button"
                      onClick={() => onPreviewMovie(mov)}
                      aria-label={`Play ${mov.title}`}
                      className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg text-[#ffd21f] hover:bg-[#ffd21f]/10"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onJumpToMovie(mov)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteMovie(mov.id);
                      onNotice(`Removed "${mov.title}".`);
                    }}
                    aria-label={`Delete ${mov.title}`}
                    className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recorded Videos & Podcasts */}
      {(filter === 'all' || filter === 'recordings') && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#c9c7d2] flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-[#ffd21f]" />
            TV Archive &amp; Podcasts ({filteredRecordings.length})
          </p>
          {filteredRecordings.map((item) => {
            const isDetecting = detectingItemId === `arc:${item.id}`;
            const isUploading = uploadingKey === `arc:${item.id}`;
            const fallbackAutoArt =
              item.category === 'podcast'
                ? railDraft.podcastAutoArtUrl
                : railDraft.tvArchiveAutoArtUrl;
            const effectiveThumb = item.thumbnailPath || fallbackAutoArt;
            return (
              <div
                key={`lib-arc-${item.id}`}
                className="p-3 rounded-xl bg-[#101016] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <AutoImagePreview
                    src={effectiveThumb}
                    alt={item.title}
                    fallbackLabel="No art"
                    allowExpand
                    className="w-16 h-10 rounded-lg border border-white/10 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-[#a5a3b2] truncate">
                      {item.category === 'archive' ? 'TV Archive' : 'Podcast Audio'} ·{' '}
                      {item.channelName} · {item.duration}
                      {item.thumbnailPath?.trim()
                        ? ' · Custom thumb'
                        : fallbackAutoArt.trim()
                          ? ' · Global Auto Art'
                          : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleAutoDetectArchive(item)}
                    disabled={isDetecting || batchDetecting}
                    title="Auto-detect thumbnail from media URL"
                    className="min-h-[32px] px-2 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-[11px] font-semibold text-[#ffd21f] flex items-center gap-1 disabled:opacity-50"
                  >
                    {isDetecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    <span>Auto-detect</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoutTarget({ kind: 'archive', item })}
                    className="min-h-[32px] px-2 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1"
                  >
                    <Scissors className="w-3 h-3 text-[#ffd21f]" />
                    <span>Cutout</span>
                  </button>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => triggerImageUpload({ kind: 'archive', item })}
                    className="min-h-[32px] px-2 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/[0.08] text-[11px] font-semibold text-[#f5f4f8] flex items-center gap-1 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-[#ffd21f]" />
                    ) : (
                      <Upload className="w-3 h-3 text-[#ffd21f]" />
                    )}
                    <span>Upload</span>
                  </button>
                  {onPreviewArchiveItem && (
                    <button
                      type="button"
                      onClick={() => onPreviewArchiveItem(item)}
                      aria-label={`Play ${item.title}`}
                      className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg text-[#ffd21f] hover:bg-[#ffd21f]/10"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onJumpToArchive(item)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteArchiveItem(item.id);
                      onNotice(`Removed "${item.title}".`);
                    }}
                    aria-label={`Delete ${item.title}`}
                    className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Cutout Modal inside Admin Media Library */}
      {cutoutTarget && (
        <ThumbnailCutoutModal
          open
          title={
            cutoutTarget.kind === 'movie'
              ? `Cutout Poster: ${cutoutTarget.movie.title}`
              : cutoutTarget.kind === 'archive'
                ? `Cutout Thumbnail: ${cutoutTarget.item.title}`
                : `Cutout ${cutoutTarget.label}`
          }
          defaultAspect={
            cutoutTarget.kind === 'movie'
              ? 'poster'
              : cutoutTarget.kind === 'archive'
                ? 'landscape'
                : cutoutTarget.aspect
          }
          mediaUrl={
            cutoutTarget.kind === 'movie'
              ? cutoutTarget.movie.streamUrl
              : cutoutTarget.kind === 'archive'
                ? cutoutTarget.item.mediaUrl
                : undefined
          }
          imageUrl={
            cutoutTarget.kind === 'movie'
              ? cutoutTarget.movie.posterPath
              : cutoutTarget.kind === 'archive'
                ? cutoutTarget.item.thumbnailPath
                : railDraft[cutoutTarget.key]
          }
          onClose={() => setCutoutTarget(null)}
          onApply={(dataUrl) => {
            if (cutoutTarget.kind === 'movie') {
              onUpdateMovie({ ...cutoutTarget.movie, posterPath: dataUrl });
              onNotice(`Cutout poster saved online for "${cutoutTarget.movie.title}".`);
            } else if (cutoutTarget.kind === 'archive') {
              onUpdateArchiveItem({ ...cutoutTarget.item, thumbnailPath: dataUrl });
              onNotice(`Cutout thumbnail saved online for "${cutoutTarget.item.title}".`);
            } else {
              const nextConfig: HomeConfig = {
                ...homeConfig,
                ...railDraft,
                [cutoutTarget.key]: dataUrl,
              };
              setRailDraft((prev) => ({
                ...prev,
                [cutoutTarget.key]: dataUrl,
              }));
              onUpdateHomeConfig(nextConfig);
              onNotice(`${cutoutTarget.label} cutout saved online.`);
            }
            setCutoutTarget(null);
          }}
        />
      )}
    </div>
  );
}
