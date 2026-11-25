import { useState } from 'react';
import {
  ArchiveRestore,
  CloudUpload,
  DatabaseBackup,
  Download,
  FileUp,
  Trash2,
} from 'lucide-react';
import { auth } from '../../firebase';
import {
  CatalogBackupPayload,
  createCloudBackup,
  deleteCloudBackup,
  exportBackupJsonDownload,
  parseBackupJsonText,
  restoreCatalogFromBackupPayload,
} from '../../services/backupService';
import { formatFileSize } from '../../services/cloudStorage';
import {
  AppConfig,
  ArchiveItem,
  BackupSnapshot,
  BroadcastAlert,
  Channel,
  GuideProgramme,
  HeroSlide,
  HomeConfig,
  MovieItem,
  PromoConfig,
} from '../../types/broadcast';

interface AdminBackupsTabProps {
  backups: BackupSnapshot[];
  channels: Channel[];
  guideSchedule: GuideProgramme[];
  heroSlides: HeroSlide[];
  movies: MovieItem[];
  archiveItems: ArchiveItem[];
  promo: PromoConfig;
  appConfig: AppConfig;
  homeConfig: HomeConfig;
  broadcastAlerts: BroadcastAlert[];
  onApplyRestoredCatalog: (payload: CatalogBackupPayload) => void;
  onNotice: (msg: string) => void;
}

export function AdminBackupsTab({
  backups,
  channels,
  guideSchedule,
  heroSlides,
  movies,
  archiveItems,
  promo,
  appConfig,
  homeConfig,
  broadcastAlerts,
  onApplyRestoredCatalog,
  onNotice,
}: AdminBackupsTabProps) {
  const [backupLabel, setBackupLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] =
    useState<CatalogBackupPayload | null>(null);
  const [importing, setImporting] = useState(false);

  const currentCatalog = {
    channels,
    guideSchedule,
    heroSlides,
    movies,
    archiveItems,
    promo,
    appConfig,
    homeConfig,
    broadcastAlerts,
  };

  const handleCreateCloudBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      onNotice('Sign in with your verified Firebase Admin account to save a cloud backup.');
      return;
    }
    setCreating(true);
    try {
      const snap = await createCloudBackup({
        label:
          backupLabel.trim() ||
          `Station Backup (${new Date().toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
          })})`,
        user,
        catalog: currentCatalog,
      });
      setBackupLabel('');
      onNotice(
        `Cloud backup "${snap.label}" saved (${snap.counts.channels} channels, ${snap.counts.movies} movies).`
      );
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Unable to create cloud backup.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadBackupJson = (backup: BackupSnapshot) => {
    const blob = new Blob([backup.snapshotJson], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${backup.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleRestoreCloudBackup = async (backup: BackupSnapshot) => {
    setRestoringId(backup.id);
    try {
      const parsed = parseBackupJsonText(backup.snapshotJson);
      await restoreCatalogFromBackupPayload(parsed, {
        promo,
        appConfig,
        homeConfig,
      });
      onApplyRestoredCatalog(parsed);
      setConfirmRestoreId(null);
      onNotice(`Restored database from cloud backup "${backup.label}".`);
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Failed to restore cloud backup.'
      );
    } finally {
      setRestoringId(null);
    }
  };

  const handleSelectJsonFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackupJsonText(text);
      setPendingImport(parsed);
      onNotice(
        `Loaded "${file.name}" (${parsed.channels.length} channels, ${parsed.movies.length} movies). Confirm below to restore.`
      );
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Unable to read backup JSON file.'
      );
    }
  };

  const handleConfirmFileRestore = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      await restoreCatalogFromBackupPayload(pendingImport, {
        promo,
        appConfig,
        homeConfig,
      });
      onApplyRestoredCatalog(pendingImport);
      setPendingImport(null);
      onNotice('Database restored from imported JSON backup file.');
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Failed to restore imported backup.'
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3.5">
        <div>
          <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
            <DatabaseBackup className="w-4 h-4 text-[#ffd21f]" />
            Backup &amp; Restore System
          </h3>
          <p className="text-xs text-[#a5a3b2] mt-0.5">
            Save permanent snapshots of all channels, TV guide schedules, movies, hero slides, archives, and app settings
          </p>
        </div>

        <form
          onSubmit={(e) => void handleCreateCloudBackup(e)}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            value={backupLabel}
            onChange={(e) => setBackupLabel(e.target.value)}
            placeholder="Backup label (e.g. Pre-weekend schedule update)"
            maxLength={140}
            className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
          />
          <button
            type="submit"
            disabled={creating}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60 transition-colors"
          >
            <CloudUpload className="w-4 h-4" />
            {creating ? 'Saving Backup...' : 'Create Cloud Backup'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              exportBackupJsonDownload(currentCatalog);
              onNotice('Exported full catalog backup JSON file.');
            }}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#ffd21f]" />
            Export JSON File
          </button>

          <label className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 cursor-pointer">
            <FileUp className="w-3.5 h-3.5 text-[#ffd21f]" />
            Import &amp; Restore JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleSelectJsonFile(e)}
              className="sr-only"
            />
          </label>
        </div>

        {pendingImport && (
          <div className="p-3 rounded-xl bg-[#1d1d26] border border-[#ffd21f]/40 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-semibold text-[#ffd21f]">
                Ready to restore imported backup
              </p>
              <p className="text-[#c9c7d2] mt-0.5">
                {pendingImport.channels.length} channels ·{' '}
                {pendingImport.guideSchedule.length} guide slots ·{' '}
                {pendingImport.movies.length} movies ·{' '}
                {pendingImport.archiveItems.length} archive items
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-[#262631] text-xs font-semibold text-[#c9c7d2]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmFileRestore()}
                disabled={importing}
                className="min-h-[36px] px-3.5 py-1 rounded-lg bg-[#ffd21f] text-[#101016] text-xs font-bold disabled:opacity-60"
              >
                {importing ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cloud Backup History */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-[#c9c7d2]">
          Saved Cloud Backups ({backups.length})
        </p>
        {backups.length > 0 ? (
          backups.map((bkp) => (
            <div
              key={bkp.id}
              className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                  {bkp.label}
                </p>
                <p className="text-xs text-[#a5a3b2] truncate">
                  {bkp.createdAt} · {formatFileSize(bkp.sizeBytes)} ·{' '}
                  {bkp.counts.channels} ch · {bkp.counts.movies} movies ·{' '}
                  {bkp.counts.archiveItems} recordings
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadBackupJson(bkp)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5 text-[#ffd21f]" />
                  JSON
                </button>

                {confirmRestoreId === bkp.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmRestoreId(null)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] text-xs font-semibold text-[#c9c7d2]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRestoreCloudBackup(bkp)}
                      disabled={restoringId === bkp.id}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[#ffd21f] text-[#101016] text-xs font-bold disabled:opacity-60"
                    >
                      {restoringId === bkp.id ? 'Restoring...' : 'Confirm'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRestoreId(bkp.id)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#ffd21f] flex items-center gap-1"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    Restore
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    void deleteCloudBackup(bkp.id)
                      .then(() => onNotice(`Deleted backup "${bkp.label}".`))
                      .catch((err) =>
                        onNotice(
                          err instanceof Error
                            ? err.message
                            : 'Failed to delete backup.'
                        )
                      );
                  }}
                  aria-label={`Delete backup ${bkp.label}`}
                  className="min-h-[34px] min-w-[34px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 rounded-xl bg-[#101016] border border-white/[0.06] text-center space-y-1.5">
            <p className="text-sm font-semibold text-[#f5f4f8]">
              No cloud backups created yet
            </p>
            <p className="text-xs text-[#a5a3b2]">
              Click &quot;Create Cloud Backup&quot; above to keep a permanent snapshot in Firebase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
