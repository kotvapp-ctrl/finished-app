import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  HardDrive,
  Image as ImageIcon,
  Link2,
  Music,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  auth,
  FIREBASE_STORAGE_BUCKET,
  probeFirebaseStorageBucket,
} from '../../firebase';
import {
  deleteCloudFile,
  formatFileSize,
  registerExternalCloudFile,
  resolveCloudFilePlayableUrl,
  uploadMediaFileToCloud,
} from '../../services/cloudStorage';
import { CloudFileCategory, CloudFileRecord } from '../../types/broadcast';
import {
  looksLikeImageUrl,
  normalizeMediaAssetUrl,
} from '../../utils/mediaAssets';
import { AutoImagePreview } from '../AutoImagePreview';

interface AdminCloudStorageTabProps {
  cloudFiles: CloudFileRecord[];
  onAttachUrlToChannel?: (url: string, category: CloudFileCategory) => void;
  onAttachUrlToMovie?: (url: string, category: CloudFileCategory) => void;
  onAttachUrlToArchive?: (url: string, category: CloudFileCategory) => void;
  onNotice: (msg: string) => void;
}

export function AdminCloudStorageTab({
  cloudFiles,
  onAttachUrlToChannel,
  onAttachUrlToMovie,
  onAttachUrlToArchive,
  onNotice,
}: AdminCloudStorageTabProps) {
  const [bucketReady, setBucketReady] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [fileDescription, setFileDescription] = useState('');
  const [publicVisible, setPublicVisible] = useState(true);
  const [filter, setFilter] = useState<'all' | CloudFileCategory>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showExternalForm, setShowExternalForm] = useState(false);
  const [extName, setExtName] = useState('');
  const [extCategory, setExtCategory] = useState<CloudFileCategory>('video');
  const [extUrl, setExtUrl] = useState('');
  const [extDesc, setExtDesc] = useState('');
  const [savingExternal, setSavingExternal] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    void probeFirebaseStorageBucket().then(setBucketReady);
  }, []);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const uid = auth.currentUser?.uid;
    if (!uid) {
      onNotice('Sign in with your verified Firebase Admin account to upload files.');
      return;
    }

    setUploading(true);
    setUploadPct(5);
    try {
      const result = await uploadMediaFileToCloud({
        file,
        uid,
        description: fileDescription,
        publicVisible,
        onProgress: setUploadPct,
      });
      setFileDescription('');
      onNotice(result.note);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'File upload failed.');
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const handleAddExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      onNotice('Sign in with your verified Firebase Admin account first.');
      return;
    }
    setSavingExternal(true);
    try {
      const created = await registerExternalCloudFile({
        name: extName,
        url: extUrl,
        category: extCategory,
        description: extDesc,
        publicVisible,
        uid,
      });
      setExtName('');
      setExtUrl('');
      setExtDesc('');
      setShowExternalForm(false);
      onNotice(`Registered "${created.name}" in Cloud Storage Registry.`);
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Unable to register external file.'
      );
    } finally {
      setSavingExternal(false);
    }
  };

  const handleCopyUrl = async (file: CloudFileRecord) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopiedId(file.id);
      window.setTimeout(() => setCopiedId(null), 1800);
      onNotice(`Copied cloud URL for "${file.name}".`);
    } catch {
      onNotice('Unable to copy URL to clipboard.');
    }
  };

  const handleDownloadOrOpen = async (file: CloudFileRecord) => {
    setOpeningId(file.id);
    try {
      const playableUrl = await resolveCloudFilePlayableUrl(file.url);
      const a = document.createElement('a');
      a.href = playableUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Unable to open stored file.'
      );
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = async (file: CloudFileRecord) => {
    try {
      await deleteCloudFile(file);
      onNotice(`Deleted "${file.name}" from Cloud Storage.`);
    } catch (err) {
      onNotice(err instanceof Error ? err.message : 'Unable to delete file.');
    }
  };

  const filteredFiles = cloudFiles.filter((f) => {
    if (filter !== 'all' && f.category !== filter) return false;
    if (search.trim()) {
      const hay = `${f.name} ${f.description || ''} ${f.mimeType}`.toLowerCase();
      if (!hay.includes(search.trim().toLowerCase())) return false;
    }
    return true;
  });

  const categoryIcon = (cat: CloudFileCategory) => {
    switch (cat) {
      case 'video':
        return <Film className="w-4 h-4 text-[#ffd21f]" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-[#ffd21f]" />;
      case 'audio':
        return <Music className="w-4 h-4 text-[#ffd21f]" />;
      default:
        return <FileText className="w-4 h-4 text-[#ffd21f]" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#ffd21f]" />
              Cloud Storage (Videos, Images, Audio &amp; Documents)
            </h3>
            <p className="text-xs text-[#a5a3b2] mt-0.5">
              Bucket:{' '}
              <span className="font-mono-tabular text-[#e4e2ec]">
                {FIREBASE_STORAGE_BUCKET || 'Not configured'}
              </span>{' '}
              ·{' '}
              {bucketReady === null ? (
                <span>Checking bucket...</span>
              ) : bucketReady ? (
                <span className="text-[#ffd21f] font-semibold">
                  Firebase Storage bucket online
                </span>
              ) : (
                <span className="text-amber-300 font-semibold">
                  Firestore Cloud Vault active (≤ 3.5 MB files; enable Storage in Firebase Console for large videos)
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowExternalForm((prev) => !prev)}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-[#ffd21f]" />
            {showExternalForm ? 'Close URL form' : 'Register External URL'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
          <input
            type="text"
            value={fileDescription}
            onChange={(e) => setFileDescription(e.target.value)}
            placeholder="Optional file note (e.g. Programme schedule PDF, Movie trailer, Station banner)"
            maxLength={400}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
          />

          <label className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap transition-colors">
            <Upload className="w-4 h-4" />
            <span>{uploading ? `Uploading ${uploadPct}%...` : 'Upload File Online'}</span>
            <input
              type="file"
              accept="video/*,image/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json"
              disabled={uploading}
              onChange={(e) => void handleUploadFile(e)}
              className="sr-only"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-[#c9c7d2] cursor-pointer">
          <input
            type="checkbox"
            checked={publicVisible}
            onChange={(e) => setPublicVisible(e.target.checked)}
            className="w-4 h-4 accent-[#ffd21f]"
          />
          Make uploaded documents &amp; resources visible for viewer downloads under More → Station Documents
        </label>

        {uploading && (
          <div className="h-2 w-full rounded-full bg-[#1d1d26] overflow-hidden">
            <div
              className="h-full bg-[#ffd21f] transition-all duration-150"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
        )}
      </div>

      {showExternalForm && (
        <form
          onSubmit={(e) => void handleAddExternal(e)}
          className="p-4 rounded-xl bg-[#101016] border border-[#ffd21f]/30 space-y-3"
        >
          <p className="text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-[#ffd21f]" />
            Register External Online Video, Image, Audio or Document URL
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={extName}
              onChange={(e) => setExtName(e.target.value)}
              placeholder="File title (e.g. Q4 TV Schedule PDF)"
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
              required
            />
            <select
              value={extCategory}
              onChange={(e) => setExtCategory(e.target.value as CloudFileCategory)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
            >
              <option value="video">Video</option>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="document">Document (PDF / Doc)</option>
            </select>
          </div>
          <input
            type="url"
            value={extUrl}
            onChange={(e) => {
              const next = e.target.value;
              setExtUrl(next);
              if (looksLikeImageUrl(next)) {
                setExtCategory('image');
              }
            }}
            placeholder="https://... direct file or CDN URL"
            className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
            required
          />
          {extUrl.trim() && (extCategory === 'image' || looksLikeImageUrl(extUrl)) && (
            <div className="p-2.5 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex items-center gap-3">
              <AutoImagePreview
                src={extUrl}
                alt={extName.trim() || 'External image preview'}
                fallbackLabel="No preview"
                allowExpand
                className="w-16 h-12 rounded-lg border border-white/15 shrink-0"
              />
              <p className="text-[11px] text-[#c9c7d2]">
                Live image preview for pasted URL · Tap thumbnail to enlarge
              </p>
            </div>
          )}
          <input
            type="text"
            value={extDesc}
            onChange={(e) => setExtDesc(e.target.value)}
            placeholder="Short description (optional)"
            className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingExternal}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#ffd21f] text-[#101016] text-xs font-bold disabled:opacity-60"
            >
              {savingExternal ? 'Saving...' : 'Save to Cloud Registry'}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', label: `All (${cloudFiles.length})` },
              { id: 'video', label: 'Videos' },
              { id: 'image', label: 'Images' },
              { id: 'audio', label: 'Audio' },
              { id: 'document', label: 'Documents' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-[#ffd21f] text-[#101016]'
                  : 'bg-[#101016] text-[#c9c7d2] border border-white/[0.08]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-[#a5a3b2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stored files..."
            className="w-full min-h-[36px] pl-8 pr-3 py-1 rounded-xl bg-[#101016] border border-[#30303b] text-xs text-[#f5f4f8]"
          />
        </div>
      </div>

      {/* Stored Files List */}
      {filteredFiles.length > 0 ? (
        <div className="space-y-2.5">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {file.category === 'image' && file.url ? (
                    <AutoImagePreview
                      src={normalizeMediaAssetUrl(file.url)}
                      alt={file.name}
                      allowExpand
                      fallbackNode={categoryIcon('image')}
                      className="w-12 h-12 rounded-lg border border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#1d1d26] grid place-items-center shrink-0">
                      {categoryIcon(file.category)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-[#a5a3b2] truncate">
                      {file.category.toUpperCase()} ·{' '}
                      {file.sizeBytes > 0
                        ? formatFileSize(file.sizeBytes)
                        : 'External Link'}{' '}
                      ·{' '}
                      {file.storageBackend === 'firebase-storage'
                        ? 'Firebase Storage'
                        : file.storageBackend === 'firestore-vault'
                          ? 'Cloud Vault'
                          : 'External URL'}{' '}
                      · {file.createdAt}
                    </p>
                    {file.description && (
                      <p className="text-xs text-[#c9c7d2] mt-1 line-clamp-2">
                        {file.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDownloadOrOpen(file)}
                    disabled={openingId === file.id}
                    aria-label={`Download or open ${file.name}`}
                    className="min-h-[34px] min-w-[34px] grid place-items-center rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-[#f5f4f8]"
                  >
                    {file.storageBackend === 'external-url' ? (
                      <ExternalLink className="w-3.5 h-3.5 text-[#ffd21f]" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-[#ffd21f]" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyUrl(file)}
                    aria-label={`Copy URL for ${file.name}`}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1"
                  >
                    {copiedId === file.id ? (
                      <>
                        <Check className="w-3 h-3 text-[#ffd21f]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        URL
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(file)}
                    aria-label={`Delete ${file.name}`}
                    className="min-h-[34px] min-w-[34px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {(file.category === 'video' ||
                file.category === 'audio' ||
                file.category === 'image') && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.05]">
                  <span className="text-[11px] text-[#a5a3b2] mr-1">
                    Use in:
                  </span>
                  {onAttachUrlToChannel &&
                    (file.category === 'video' || file.category === 'audio') && (
                      <button
                        type="button"
                        onClick={() =>
                          onAttachUrlToChannel(file.url, file.category)
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-[11px] font-semibold text-[#ffd21f]"
                      >
                        Channel Stream
                      </button>
                    )}
                  {onAttachUrlToMovie && (
                    <button
                      type="button"
                      onClick={() =>
                        onAttachUrlToMovie(file.url, file.category)
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-[11px] font-semibold text-[#ffd21f]"
                    >
                      {file.category === 'image' ? 'Movie Poster' : 'Movie Video'}
                    </button>
                  )}
                  {onAttachUrlToArchive &&
                    (file.category === 'video' || file.category === 'audio') && (
                      <button
                        type="button"
                        onClick={() =>
                          onAttachUrlToArchive(file.url, file.category)
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-[11px] font-semibold text-[#ffd21f]"
                      >
                        Archive / Podcast
                      </button>
                    )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 rounded-xl bg-[#101016] border border-white/[0.06] text-center space-y-1.5">
          <p className="text-sm font-semibold text-[#f5f4f8]">
            No stored cloud files yet
          </p>
          <p className="text-xs text-[#a5a3b2]">
            Upload videos, posters, audio shows, or PDF schedules above to store them permanently online.
          </p>
        </div>
      )}
    </div>
  );
}
