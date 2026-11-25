import { useEffect, useState } from 'react';
import {
  Clock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  fetchAdminAllowlistForAdmin,
  fetchUserDirectoryForAdmin,
  fetchUserLoginsForAdmin,
  grantAdminAccessInFirestore,
  revokeAdminAccessInFirestore,
} from '../../services/firestoreSync';
import {
  AdminRecordEntry,
  UserDirectoryEntry,
  UserLoginEvent,
} from '../../types/broadcast';

interface AdminUsersTabProps {
  onNotice: (msg: string) => void;
}

export function AdminUsersTab({ onNotice }: AdminUsersTabProps) {
  const [users, setUsers] = useState<UserDirectoryEntry[]>([]);
  const [logins, setLogins] = useState<UserLoginEvent[]>([]);
  const [admins, setAdmins] = useState<AdminRecordEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);

  const loadDirectory = async () => {
    setLoading(true);
    try {
      const [userRows, loginRows, adminRows] = await Promise.all([
        fetchUserDirectoryForAdmin().catch(() => []),
        fetchUserLoginsForAdmin().catch(() => []),
        fetchAdminAllowlistForAdmin().catch(() => []),
      ]);
      setUsers(userRows);
      setLogins(loginRows);
      setAdmins(adminRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectory();
  }, []);

  const handleGrantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminUid.trim() || !newAdminEmail.trim()) {
      onNotice('Enter both the Firebase User UID and verified email address.');
      return;
    }
    setAddingAdmin(true);
    try {
      await grantAdminAccessInFirestore(newAdminUid.trim(), newAdminEmail.trim());
      setNewAdminUid('');
      setNewAdminEmail('');
      onNotice('Granted station admin access.');
      await loadDirectory();
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Unable to add admin record.'
      );
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRevokeAdmin = async (uid: string) => {
    try {
      await revokeAdminAccessInFirestore(uid);
      setAdmins((prev) => prev.filter((a) => a.uid !== uid));
      onNotice('Removed secondary admin record.');
    } catch (err) {
      onNotice(
        err instanceof Error ? err.message : 'Unable to revoke admin access.'
      );
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true;
    return `${u.displayName} ${u.uid} ${u.plan}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  const filteredLogins = logins.filter((ev) => {
    if (!search.trim()) return true;
    return `${ev.displayName} ${ev.uid} ${ev.eventType} ${ev.provider}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#ffd21f]" />
              Registered Viewer Accounts ({users.length})
            </h3>
            <p className="text-xs text-[#a5a3b2] mt-0.5">
              Non-PII profile directory from Firestore /users (private emails remain isolated under /users/&#123;uid&#125;/private/info)
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadDirectory()}
            disabled={loading}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#a5a3b2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search viewer display name, UID, or tier..."
            className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
          />
        </div>

        {filteredUsers.length > 0 ? (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {filteredUsers.map((u) => (
              <div
                key={u.uid}
                className="p-3 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                    {u.displayName}{' '}
                    <span className="text-[#ffd21f] font-mono-tabular">
                      · {u.plan}
                    </span>
                  </p>
                  <p className="text-[11px] text-[#a5a3b2] font-mono-tabular truncate">
                    UID: {u.uid}
                  </p>
                </div>
                <div className="text-[11px] text-[#c9c7d2] font-mono-tabular">
                  {u.favoritesCount} fav · {u.remindersCount} rem ·{' '}
                  {u.followedCount} fol
                  {u.updatedAtLabel ? ` · ${u.updatedAtLabel}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#a5a3b2] py-2">
            {loading
              ? 'Loading registered accounts...'
              : 'No Firebase-connected viewer profiles recorded yet.'}
          </p>
        )}
      </div>

      {/* Recent User Logins & Sign-Ups */}
      <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#ffd21f]" />
            Recent Logins &amp; Sign-Ups ({logins.length})
          </h3>
          <p className="text-xs text-[#a5a3b2] mt-0.5">
            Every sign-in and account registration synced to Firestore (/userLogins), including offline logins flushed when connectivity returns.
          </p>
        </div>

        {filteredLogins.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {filteredLogins.map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#f5f4f8] truncate">
                      {ev.displayName}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        ev.eventType === 'signup'
                          ? 'bg-[#ffd21f]/20 text-[#ffd21f]'
                          : 'bg-white/10 text-[#e4e2ec]'
                      }`}
                    >
                      {ev.eventType === 'signup' ? 'Sign Up' : 'Login'}
                    </span>
                    <span className="text-[10px] text-[#a5a3b2] uppercase">
                      {ev.provider}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#a5a3b2] font-mono-tabular truncate mt-0.5">
                    UID: {ev.uid}
                  </p>
                </div>
                <div className="text-[11px] text-[#c9c7d2] font-mono-tabular flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-[#a5a3b2]" />
                  <span>{ev.createdAt}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#a5a3b2] py-2">
            {loading
              ? 'Loading login activity...'
              : 'No login or sign-up events recorded yet.'}
          </p>
        )}
      </div>

      {/* Station Administrator Allowlist */}
      <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.08] space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[#f5f4f8] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#ffd21f]" />
            Administrator Role Allowlist
          </h3>
          <p className="text-xs text-[#a5a3b2] mt-0.5">
            Station administrators have full catalog control. Add secondary admin UIDs below if needed.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleGrantAdmin(e)}
          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2"
        >
          <input
            type="text"
            value={newAdminUid}
            onChange={(e) => setNewAdminUid(e.target.value)}
            placeholder="User UID (from directory above)"
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
          />
          <input
            type="email"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            placeholder="Verified account email"
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
          />
          <button
            type="submit"
            disabled={addingAdmin}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#ffd21f] text-[#101016] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" />
            Grant Admin
          </button>
        </form>

        {admins.length > 0 && (
          <div className="space-y-1.5">
            {admins.map((adm) => (
              <div
                key={adm.uid}
                className="p-2.5 rounded-xl bg-[#1d1d26] border border-white/[0.06] flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#f5f4f8] truncate">
                    Secondary Admin
                  </p>
                  <p className="text-[11px] text-[#a5a3b2] font-mono-tabular truncate">
                    UID: {adm.uid}
                    {adm.grantedAtLabel ? ` · Granted ${adm.grantedAtLabel}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevokeAdmin(adm.uid)}
                  aria-label={`Revoke admin ${adm.uid}`}
                  className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
