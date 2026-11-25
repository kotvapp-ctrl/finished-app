import { useEffect, useState } from 'react';
import {
  Check,
  CloudUpload,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  Pencil,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  checkAdminAllowlist,
  refreshCurrentAuthUser,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmailPassword,
  signOutFirebase,
  signUpWithEmailPassword,
  updateFirebaseDisplayName,
} from '../firebase';
import { type CatalogBackupPayload } from '../services/backupService';
import {
  AppConfig,
  ArchiveItem,
  ArtistProfile,
  BackupSnapshot,
  BroadcastAlert,
  BroadcastAlertCategory,
  Channel,
  CloudFileRecord,
  GuideProgramme,
  HeroSlide,
  HomeConfig,
  MovieItem,
  NewsArticle,
  PromoConfig,
  UserProfile,
} from '../types/broadcast';
import { AdminPanel, type AdminSection } from './AdminPanel';

export type AccountPortalMode = 'user' | 'admin';

interface AccountModalProps {
  isOpen: boolean;
  initialView?: 'account' | 'subscription' | 'cloud' | 'admin';
  initialPortal?: AccountPortalMode;
  initialChannelId?: string;
  initialAdminSection?: AdminSection;
  initialArchiveItemId?: string;
  initialMovieId?: string;
  profile: UserProfile;
  firebaseConnected?: boolean;
  isEmailVerified?: boolean;
  pendingSyncCount?: number;
  isAdminAuthorized?: boolean;
  onSyncToCloud?: () => Promise<void>;
  onRecordAuthActivity?: (params: {
    uid: string;
    displayName: string;
    eventType: 'login' | 'signup';
    provider: 'google' | 'password';
  }) => void;
  onRefreshAuthVerification?: () => Promise<boolean>;
  channels: Channel[];
  guideSchedule: GuideProgramme[];
  heroSlides: HeroSlide[];
  promo: PromoConfig;
  movies: MovieItem[];
  archiveItems: ArchiveItem[];
  newsArticles?: NewsArticle[];
  artists?: ArtistProfile[];
  appConfig: AppConfig;
  homeConfig: HomeConfig;
  broadcastAlerts?: BroadcastAlert[];
  cloudFiles?: CloudFileRecord[];
  cloudBackups?: BackupSnapshot[];
  favoritesCount?: number;
  remindersCount?: number;
  followedCount?: number;
  continueWatchingCount?: number;
  isOnline?: boolean;
  onClose: () => void;
  onPreviewChannel?: (channel: Channel) => void;
  onPreviewMovie?: (movie: MovieItem) => void;
  onUpdateProfile: (profile: UserProfile) => void;
  onAddChannel: (channel: Channel) => void;
  onUpdateChannel: (channel: Channel) => void;
  onDeleteChannel: (channelId: string) => void;
  onUpdateGuideProgramme: (entry: GuideProgramme) => void;
  onAddHeroSlide: (slide: HeroSlide) => void;
  onUpdateHeroSlide: (slide: HeroSlide) => void;
  onDeleteHeroSlide: (slideId: string) => void;
  onUpdatePromo: (promo: PromoConfig) => void;
  onAddMovie: (movie: MovieItem) => void;
  onUpdateMovie: (movie: MovieItem) => void;
  onDeleteMovie: (movieId: string) => void;
  onAddArchiveItem: (item: ArchiveItem) => void;
  onUpdateArchiveItem: (item: ArchiveItem) => void;
  onDeleteArchiveItem: (itemId: string) => void;
  onPreviewArchiveItem?: (item: ArchiveItem) => void;
  onAddNewsArticle?: (article: NewsArticle) => void;
  onUpdateNewsArticle?: (article: NewsArticle) => void;
  onDeleteNewsArticle?: (articleId: string) => void;
  onAddArtist?: (artist: ArtistProfile) => void;
  onUpdateArtist?: (artist: ArtistProfile) => void;
  onDeleteArtist?: (artistId: string) => void;
  onPreviewArtist?: (artist: ArtistProfile) => void;
  onUpdateAppConfig: (config: AppConfig) => void;
  onUpdateHomeConfig: (config: HomeConfig) => void;
  onPublishBroadcastAlert?: (params: {
    category: BroadcastAlertCategory;
    title: string;
    body: string;
    channelId?: string;
    iconUrl?: string;
  }) => Promise<string>;
  onDeleteBroadcastAlert?: (alertId: string) => void;
  onApplyRestoredCatalog?: (payload: CatalogBackupPayload) => void;
  onResetDefaults: () => void;
}

export function AccountModal({
  isOpen,
  initialView = 'account',
  initialPortal,
  initialChannelId,
  initialAdminSection,
  initialArchiveItemId,
  initialMovieId,
  profile,
  firebaseConnected = false,
  isEmailVerified = true,
  pendingSyncCount = 0,
  isAdminAuthorized = false,
  onSyncToCloud,
  onRecordAuthActivity,
  onRefreshAuthVerification,
  channels,
  guideSchedule,
  heroSlides,
  promo,
  movies,
  archiveItems,
  newsArticles = [],
  artists = [],
  appConfig,
  homeConfig,
  broadcastAlerts = [],
  cloudFiles = [],
  cloudBackups = [],
  favoritesCount = 0,
  remindersCount = 0,
  followedCount = 0,
  continueWatchingCount = 0,
  isOnline = true,
  onClose,
  onPreviewChannel,
  onPreviewMovie,
  onUpdateProfile,
  onAddChannel,
  onUpdateChannel,
  onDeleteChannel,
  onUpdateGuideProgramme,
  onAddHeroSlide,
  onUpdateHeroSlide,
  onDeleteHeroSlide,
  onUpdatePromo,
  onAddMovie,
  onUpdateMovie,
  onDeleteMovie,
  onAddArchiveItem,
  onUpdateArchiveItem,
  onDeleteArchiveItem,
  onPreviewArchiveItem,
  onAddNewsArticle,
  onUpdateNewsArticle,
  onDeleteNewsArticle,
  onAddArtist,
  onUpdateArtist,
  onDeleteArtist,
  onPreviewArtist,
  onUpdateAppConfig,
  onUpdateHomeConfig,
  onPublishBroadcastAlert,
  onDeleteBroadcastAlert,
  onApplyRestoredCatalog,
  onResetDefaults,
}: AccountModalProps) {
  const [portal, setPortal] = useState<AccountPortalMode>(
    initialPortal || (initialView === 'admin' ? 'admin' : 'user')
  );
  const [userSubTab, setUserSubTab] = useState<'profile' | 'subscription'>(
    initialView === 'subscription' ? 'subscription' : 'profile'
  );
  const [userAuthMode, setUserAuthMode] = useState<'login' | 'signup'>('login');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [needsVerificationBanner, setNeedsVerificationBanner] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.displayName);
  const [savingName, setSavingName] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [authHelpCode, setAuthHelpCode] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const resolvedPortal: AccountPortalMode =
      initialPortal || (initialView === 'admin' ? 'admin' : 'user');
    setPortal(resolvedPortal);
    setUserSubTab(
      initialView === 'subscription' ? 'subscription' : 'profile'
    );
    setUserEmail(profile.identifier || '');
    setUserPassword('');
    setShowUserPassword(false);
    setAdminEmail('');
    setAdminPassword('');
    setShowAdminPassword(false);
    setNeedsVerificationBanner(false);
    setDisplayName(profile.displayName);
    setNameDraft(profile.displayName);
    setEditingName(false);
    setFeedback(null);
    setAuthHelpCode(null);
    setCopiedDomain(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialView, initialPortal]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAdmin = isAdminAuthorized;
  const currentHostname =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyHostname = async () => {
    if (!currentHostname) return;
    try {
      await navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      window.setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const mapAuthErrorMessage = (error: unknown): string => {
    const message =
      error instanceof Error ? error.message : 'Authentication failed.';
    if (message.includes('auth/unauthorized-domain')) {
      setAuthHelpCode('unauthorized-domain');
      return 'Add this app domain to Firebase Authentication → Settings → Authorized domains.';
    }
    if (message.includes('auth/operation-not-allowed')) {
      setAuthHelpCode('operation-not-allowed');
      return 'Enable Email/Password sign-in provider in Firebase Console → Authentication → Sign-in method.';
    }
    if (
      message.includes('auth/invalid-credential') ||
      message.includes('auth/wrong-password') ||
      message.includes('auth/user-not-found')
    ) {
      return portal === 'admin'
        ? 'Invalid administrator email or password.'
        : 'Invalid email or password. Check your details or use Forgot password.';
    }
    if (message.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Switch to Sign In.';
    }
    if (message.includes('auth/weak-password')) {
      return 'Choose a stronger password (at least 6 characters).';
    }
    if (message.includes('auth/invalid-email')) {
      return 'Enter a valid email address.';
    }
    if (message.includes('auth/too-many-requests')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (message.includes('auth/network-request-failed')) {
      return 'Unable to reach Firebase while offline. Reconnect to authenticate.';
    }
    return message;
  };

  const handleUserEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = userEmail.trim();
    if (!cleanEmail || !userPassword) {
      setFeedback('Enter both your email address and password.');
      return;
    }
    if (userAuthMode === 'signup' && userPassword.length < 6) {
      setFeedback('Password must be at least 6 characters.');
      return;
    }
    setAuthLoading(true);
    setFeedback(null);
    setAuthHelpCode(null);
    try {
      const trimmedName =
        displayName.trim() && displayName.trim() !== 'Guest'
          ? displayName.trim().slice(0, 60)
          : cleanEmail.split('@')[0] || 'Viewer';
      const cred =
        userAuthMode === 'signup'
          ? await signUpWithEmailPassword(cleanEmail, userPassword, trimmedName)
          : await signInWithEmailPassword(cleanEmail, userPassword);
      const fbUser = cred.user;
      const resolvedName = fbUser.displayName || trimmedName;
      const adminAuthorized = fbUser.emailVerified
        ? await checkAdminAllowlist(fbUser)
        : false;

      onUpdateProfile({
        ...profile,
        identifier: fbUser.email || cleanEmail,
        displayName: resolvedName,
        role: adminAuthorized ? 'admin' : 'viewer',
        signedIn: true,
      });
      onRecordAuthActivity?.({
        uid: fbUser.uid,
        displayName: resolvedName,
        eventType: userAuthMode,
        provider: 'password',
      });
      setUserPassword('');
      if (!fbUser.emailVerified) {
        setNeedsVerificationBanner(true);
        setFeedback(
          userAuthMode === 'signup'
            ? 'Account created! Verify your email via the link sent to your inbox to activate cloud sync and backups.'
            : 'Signed in. Verify your email address to activate cloud sync and backups.'
        );
      } else {
        setNeedsVerificationBanner(false);
        setFeedback(
          userAuthMode === 'signup'
            ? 'Account registered and synced to Firebase.'
            : 'Signed in and synced to Firebase.'
        );
      }
    } catch (error) {
      setFeedback(mapAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = adminEmail.trim();
    if (!cleanEmail || !adminPassword) {
      setFeedback('Enter your administrator email and password.');
      return;
    }
    setAuthLoading(true);
    setFeedback(null);
    setAuthHelpCode(null);
    try {
      const cred = await signInWithEmailPassword(cleanEmail, adminPassword);
      const fbUser = cred.user;
      if (!fbUser.emailVerified) {
        await resendVerificationEmail().catch(() => undefined);
        setNeedsVerificationBanner(true);
        setAdminPassword('');
        setFeedback(
          'Email verification required. Check your inbox for the verification link, then tap Check Verification.'
        );
        return;
      }

      const adminAuthorized = await checkAdminAllowlist(fbUser);
      if (!adminAuthorized) {
        await signOutFirebase().catch(() => undefined);
        setAdminPassword('');
        setFeedback(
          'Access denied. This account does not have administrator privileges.'
        );
        return;
      }

      const resolvedName =
        fbUser.displayName || 'Station Administrator';
      onUpdateProfile({
        ...profile,
        identifier: fbUser.email || cleanEmail,
        displayName: resolvedName,
        role: 'admin',
        signedIn: true,
      });
      onRecordAuthActivity?.({
        uid: fbUser.uid,
        displayName: resolvedName,
        eventType: 'login',
        provider: 'password',
      });
      setAdminEmail('');
      setAdminPassword('');
      setNeedsVerificationBanner(false);
      setFeedback('Signed in as station administrator.');
    } catch (error) {
      setFeedback(mapAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (emailTarget: string) => {
    const clean = emailTarget.trim();
    if (!clean) {
      setFeedback('Enter your email address above first, then tap Forgot password.');
      return;
    }
    setAuthLoading(true);
    setFeedback(null);
    try {
      await sendPasswordReset(clean);
      setFeedback('Password reset link sent. Check your email inbox.');
    } catch (error) {
      setFeedback(mapAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setVerificationLoading(true);
    setFeedback(null);
    try {
      await resendVerificationEmail();
      setFeedback('Verification link sent. Open your email inbox and click the link.');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Unable to send verification email.'
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setVerificationLoading(true);
    setFeedback(null);
    try {
      const verified = onRefreshAuthVerification
        ? await onRefreshAuthVerification()
        : Boolean((await refreshCurrentAuthUser())?.emailVerified);
      if (verified) {
        setNeedsVerificationBanner(false);
        setFeedback('Email verified! Firebase sync and backups are now active.');
      } else {
        setFeedback('Email is not verified yet. Open the link in your inbox and try again.');
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Unable to refresh verification status.'
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleManualCloudSync = async () => {
    if (!onSyncToCloud) return;
    setSyncLoading(true);
    setFeedback(null);
    try {
      await onSyncToCloud();
      setFeedback('Cloud catalog & preferences synced to Firebase.');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Cloud sync failed.';
      setFeedback(
        msg.includes('Missing or insufficient permissions')
          ? 'Firestore permission denied — verify you are signed in with an authorized account.'
          : msg
      );
    } finally {
      setSyncLoading(false);
    }
  };

  const handleExitAdminMode = () => {
    onUpdateProfile({
      ...profile,
      role: 'viewer',
    });
    setPortal('user');
    setFeedback('Switched to viewer view.');
  };

  const handleSignOut = async () => {
    try {
      await signOutFirebase();
    } catch {
      // Ignore if not signed in to Firebase
    }
    onUpdateProfile({
      identifier: '',
      displayName: 'Guest',
      plan: 'Free',
      role: 'viewer',
      signedIn: false,
    });
    setUserEmail('');
    setUserPassword('');
    setAdminEmail('');
    setAdminPassword('');
    setNeedsVerificationBanner(false);
    setDisplayName('Guest');
    setUserSubTab('profile');
    setFeedback('Signed out.');
  };

  const handleSelectPlan = (plan: UserProfile['plan']) => {
    onUpdateProfile({
      ...profile,
      plan,
    });
    setFeedback(`${plan} tier selected.`);
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameDraft.trim().slice(0, 60);
    if (!cleaned) {
      setFeedback('Display name cannot be empty.');
      return;
    }
    setSavingName(true);
    try {
      if (firebaseConnected) {
        await updateFirebaseDisplayName(cleaned).catch(() => undefined);
      }
      onUpdateProfile({
        ...profile,
        displayName: cleaned,
      });
      setDisplayName(cleaned);
      setEditingName(false);
      setFeedback('Profile display name updated.');
    } finally {
      setSavingName(false);
    }
  };

  const domainHelperBox = authHelpCode === 'unauthorized-domain' &&
    currentHostname && (
      <div className="p-3 rounded-xl bg-[#101016] border border-[#ffd21f]/30 space-y-2 text-xs">
        <p className="text-[#e4e2ec] leading-relaxed">
          Add this hostname under{' '}
          <span className="font-semibold text-[#ffd21f]">
            Firebase Console → Authentication → Settings → Authorized domains
          </span>
          :
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#1c1c25] text-[#f5f4f8] font-mono-tabular truncate">
            {currentHostname}
          </code>
          <button
            type="button"
            onClick={handleCopyHostname}
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#262631] hover:bg-[#323240] text-[#f5f4f8] font-semibold flex items-center gap-1 shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
            {copiedDomain ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    );

  const modalExpanded = portal === 'admin' && isAdmin;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${
          modalExpanded ? 'sm:max-w-3xl' : 'sm:max-w-md'
        } bg-[#1c1c25] border border-white/10 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto transition-all duration-150`}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="account-modal-title" className="text-xl font-bold text-[#f5f4f8]">
            {portal === 'admin' ? 'Admin Only' : 'User Account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Strict 2-Portal Switcher: User Sign In vs Admin Only */}
        <div
          className="grid grid-cols-2 gap-1.5 mt-4 p-1 rounded-xl bg-[#101016] border border-white/[0.06]"
          role="tablist"
          aria-label="Account portal switcher"
        >
          <button
            type="button"
            role="tab"
            aria-selected={portal === 'user'}
            onClick={() => {
              setPortal('user');
              setFeedback(null);
            }}
            className={`min-h-[42px] px-3 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-2 transition-colors ${
              portal === 'user'
                ? 'bg-[#262631] text-[#f5f4f8]'
                : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
            }`}
          >
            <UserIcon className="w-4 h-4 shrink-0" />
            <span>User Sign In</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={portal === 'admin'}
            onClick={() => {
              setPortal('admin');
              setFeedback(null);
            }}
            className={`min-h-[42px] px-3 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-2 transition-colors ${
              portal === 'admin'
                ? 'bg-[#ffd21f] text-[#101016] font-bold'
                : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Admin Only</span>
          </button>
        </div>

        {/* USER PORTAL (User Sign In, Profile & Subscription) */}
        {portal === 'user' &&
          (profile.signedIn ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#101016] border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setUserSubTab('profile');
                    setFeedback(null);
                  }}
                  className={`min-h-[38px] px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    userSubTab === 'profile'
                      ? 'bg-[#262631] text-[#f5f4f8]'
                      : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
                  }`}
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserSubTab('subscription');
                    setFeedback(null);
                  }}
                  className={`min-h-[38px] px-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    userSubTab === 'subscription'
                      ? 'bg-[#262631] text-[#f5f4f8]'
                      : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
                  }`}
                >
                  Subscription
                </button>
              </div>

              {userSubTab === 'profile' ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#101016] border border-white/[0.06] space-y-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-full bg-[#ffd21f] text-[#101016] grid place-items-center font-bold text-lg shrink-0">
                        {profile.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-[#f5f4f8] truncate">
                          {profile.displayName}
                        </p>
                        <p className="text-xs text-[#a5a3b2] truncate">
                          {profile.identifier} · {profile.plan} tier
                        </p>
                      </div>
                      {!editingName && (
                        <button
                          type="button"
                          onClick={() => {
                            setNameDraft(profile.displayName);
                            setEditingName(true);
                          }}
                          aria-label="Edit display name"
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#1d1d26] hover:bg-[#262631] text-xs font-semibold text-[#f5f4f8] flex items-center gap-1 shrink-0"
                        >
                          <Pencil className="w-3 h-3 text-[#ffd21f]" />
                          Edit
                        </button>
                      )}
                    </div>

                    {editingName && (
                      <form
                        onSubmit={(e) => void handleSaveDisplayName(e)}
                        className="flex items-center gap-2 pt-2 border-t border-white/[0.06]"
                      >
                        <input
                          type="text"
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          maxLength={60}
                          placeholder="Display name"
                          className="flex-1 min-h-[38px] px-3 py-1 rounded-lg bg-[#1d1d26] border border-[#30303b] text-xs text-[#f5f4f8]"
                        />
                        <button
                          type="button"
                          onClick={() => setEditingName(false)}
                          className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[#262631] text-xs text-[#c9c7d2]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingName}
                          className="min-h-[38px] px-3 py-1 rounded-lg bg-[#ffd21f] text-[#101016] text-xs font-bold disabled:opacity-60"
                        >
                          {savingName ? 'Saving...' : 'Save'}
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Stored Account Summary */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-[#101016] border border-white/[0.06]">
                      <p className="text-sm font-bold text-[#ffd21f] font-mono-tabular">
                        {favoritesCount}
                      </p>
                      <p className="text-[10px] text-[#a5a3b2] mt-0.5">
                        Favorites
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#101016] border border-white/[0.06]">
                      <p className="text-sm font-bold text-[#ffd21f] font-mono-tabular">
                        {remindersCount}
                      </p>
                      <p className="text-[10px] text-[#a5a3b2] mt-0.5">
                        Reminders
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#101016] border border-white/[0.06]">
                      <p className="text-sm font-bold text-[#ffd21f] font-mono-tabular">
                        {followedCount}
                      </p>
                      <p className="text-[10px] text-[#a5a3b2] mt-0.5">
                        Following
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#101016] border border-white/[0.06]">
                      <p className="text-sm font-bold text-[#ffd21f] font-mono-tabular">
                        {continueWatchingCount}
                      </p>
                      <p className="text-[10px] text-[#a5a3b2] mt-0.5">
                        History
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[#a5a3b2]">
                    <ShieldCheck className="w-4 h-4 text-[#ffd21f] shrink-0" />
                    <span>
                      {firebaseConnected
                        ? 'Firebase account connected · Global live chat enabled.'
                        : !isEmailVerified
                          ? 'Verify your email address to activate Firebase account sync.'
                          : 'Sign in with Email and Password to sync across devices & post to global chat.'}
                    </span>
                  </div>

                  {pendingSyncCount > 0 && (
                    <div className="p-3 rounded-xl bg-[#252116] border border-[#ffd21f]/35 text-xs text-[#f5f4f8]">
                      <span className="font-semibold text-[#ffd21f]">
                        {pendingSyncCount} queued{' '}
                        {pendingSyncCount === 1 ? 'change' : 'changes'}
                      </span>{' '}
                      · Comments, likes, and login updates will automatically upload to Firebase once connected.
                    </div>
                  )}

                  {!firebaseConnected && !isEmailVerified && (
                    <div className="p-3.5 rounded-xl bg-[#101016] border border-[#ffd21f]/30 space-y-2.5">
                      <p className="text-xs text-[#e4e2ec] leading-relaxed">
                        Verification email sent. Click the verification link in your inbox, then tap{' '}
                        <span className="font-semibold text-[#ffd21f]">
                          Check Verification
                        </span>
                        .
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCheckVerification()}
                          disabled={verificationLoading || !isOnline}
                          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold disabled:opacity-60"
                        >
                          {verificationLoading
                            ? 'Checking...'
                            : 'Check Verification'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResendVerification()}
                          disabled={verificationLoading || !isOnline}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] disabled:opacity-60"
                        >
                          Resend Link
                        </button>
                      </div>
                    </div>
                  )}

                  {domainHelperBox}
                  {feedback && (
                    <p className="text-xs text-[#ffd21f]">{feedback}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setUserSubTab('subscription')}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#262631] hover:bg-[#30303d] border border-white/10 text-xs sm:text-sm font-semibold text-[#f5f4f8] whitespace-nowrap transition-colors"
                    >
                      Manage Plan
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs sm:text-sm font-semibold text-[#f5f4f8] whitespace-nowrap flex items-center justify-center gap-2 transition-colors"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {(
                    [
                      {
                        name: 'Free' as const,
                        detail: 'Live local channels, TV guide, and visual radio',
                        price: 'UGX 0 / mo',
                      },
                      {
                        name: 'Plus' as const,
                        detail: 'Full TV archive catch-up and HD streams',
                        price: 'UGX 15,000 / mo',
                      },
                      {
                        name: 'Family' as const,
                        detail: 'Up to 4 simultaneous screens and priority breaking news alerts',
                        price: 'UGX 28,000 / mo',
                      },
                    ]
                  ).map((tier) => {
                    const active = profile.plan === tier.name;
                    return (
                      <button
                        key={tier.name}
                        type="button"
                        onClick={() => handleSelectPlan(tier.name)}
                        className={`w-full text-left p-4 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                          active
                            ? 'bg-[#262631] border-[#ffd21f]'
                            : 'bg-[#101016] border-white/[0.06] hover:border-white/20'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-[#f5f4f8]">
                              {tier.name}
                            </span>
                            <span className="text-xs text-[#a5a3b2] font-mono-tabular">
                              {tier.price}
                            </span>
                          </div>
                          <p className="text-xs text-[#a5a3b2] mt-1">
                            {tier.detail}
                          </p>
                        </div>
                        {active && (
                          <span className="w-6 h-6 rounded-full bg-[#ffd21f] text-[#101016] grid place-items-center shrink-0">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {feedback && (
                    <p className="text-xs text-[#ffd21f] pt-1">{feedback}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-[#f5f4f8]">
                  Viewer Sign In &amp; Registration
                </p>
                <p className="text-xs text-[#a5a3b2] mt-1">
                  Every login and sign-up syncs to Firebase so your chats and favorites stay saved across sessions.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#101016] border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setUserAuthMode('login');
                    setFeedback(null);
                  }}
                  className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
                    userAuthMode === 'login'
                      ? 'bg-[#262631] text-[#f5f4f8]'
                      : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUserAuthMode('signup');
                    setFeedback(null);
                  }}
                  className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors ${
                    userAuthMode === 'signup'
                      ? 'bg-[#262631] text-[#ffd21f]'
                      : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={(e) => void handleUserEmailAuth(e)} className="space-y-3.5">
                {userAuthMode === 'signup' && (
                  <div>
                    <label
                      htmlFor="account-name"
                      className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                    >
                      Display name
                    </label>
                    <input
                      id="account-name"
                      type="text"
                      value={displayName === 'Guest' ? '' : displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Name shown in live chat"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="user-auth-email"
                    className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="user-auth-email"
                    type="email"
                    autoComplete="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="user-auth-password"
                      className="block text-xs font-medium text-[#c9c7d2]"
                    >
                      Password
                    </label>
                    {userAuthMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => void handleForgotPassword(userEmail)}
                        className="text-[11px] font-semibold text-[#ffd21f] hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="user-auth-password"
                      type={showUserPassword ? 'text' : 'password'}
                      autoComplete={
                        userAuthMode === 'signup'
                          ? 'new-password'
                          : 'current-password'
                      }
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      placeholder={
                        userAuthMode === 'signup'
                          ? 'Create password (6+ characters)'
                          : 'Enter your password'
                      }
                      className="w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUserPassword((p) => !p)}
                      aria-label={
                        showUserPassword ? 'Hide password' : 'Show password'
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[34px] min-w-[34px] grid place-items-center text-[#a5a3b2] hover:text-[#f5f4f8]"
                    >
                      {showUserPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {domainHelperBox}
                {feedback && (
                  <p className="text-xs text-[#ffd21f]">{feedback}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm font-bold transition-colors disabled:opacity-60"
                >
                  {authLoading
                    ? userAuthMode === 'signup'
                      ? 'Creating account...'
                      : 'Signing in...'
                    : userAuthMode === 'signup'
                      ? 'Create Firebase Account'
                      : 'Sign In'}
                </button>
              </form>
            </div>
          ))}

        {/* ADMIN ONLY PORTAL (Strictly Email & Password Sign-In & Control Panel) */}
        {portal === 'admin' &&
          (isAdmin ? (
            <div className="mt-4 space-y-4">
              <div className="p-3.5 rounded-xl bg-[#101016] border border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#f5f4f8] truncate">
                    Station Administrator
                  </p>
                  <p className="text-xs text-[#a5a3b2] truncate">
                    {firebaseConnected
                      ? 'Authenticated · Firebase cloud sync active'
                      : 'Authenticated · Reconnect to sync changes'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {firebaseConnected && onSyncToCloud && (
                    <button
                      type="button"
                      onClick={handleManualCloudSync}
                      disabled={syncLoading}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] whitespace-nowrap flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <CloudUpload className="w-3.5 h-3.5 text-[#ffd21f]" />
                      <span>
                        {syncLoading ? 'Syncing...' : 'Sync Cloud Now'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleExitAdminMode}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-[#f5f4f8] whitespace-nowrap"
                  >
                    Switch to User
                  </button>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    aria-label="Sign out admin"
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-[#f5f4f8] whitespace-nowrap flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>

              {domainHelperBox}
              {feedback && <p className="text-xs text-[#ffd21f]">{feedback}</p>}

              <AdminPanel
                channels={channels}
                initialChannelId={initialChannelId}
                initialAdminSection={initialAdminSection}
                initialArchiveItemId={initialArchiveItemId}
                initialMovieId={initialMovieId}
                guideSchedule={guideSchedule}
                heroSlides={heroSlides}
                promo={promo}
                movies={movies}
                archiveItems={archiveItems}
                newsArticles={newsArticles}
                artists={artists}
                appConfig={appConfig}
                homeConfig={homeConfig}
                broadcastAlerts={broadcastAlerts}
                cloudFiles={cloudFiles}
                cloudBackups={cloudBackups}
                onAddChannel={onAddChannel}
                onUpdateChannel={onUpdateChannel}
                onDeleteChannel={onDeleteChannel}
                onPreviewChannel={(ch) => {
                  if (onPreviewChannel) {
                    onClose();
                    onPreviewChannel(ch);
                  }
                }}
                onUpdateGuideProgramme={onUpdateGuideProgramme}
                onAddHeroSlide={onAddHeroSlide}
                onUpdateHeroSlide={onUpdateHeroSlide}
                onDeleteHeroSlide={onDeleteHeroSlide}
                onUpdatePromo={onUpdatePromo}
                onAddMovie={onAddMovie}
                onUpdateMovie={onUpdateMovie}
                onDeleteMovie={onDeleteMovie}
                onPreviewMovie={(mov) => {
                  if (onPreviewMovie) {
                    onClose();
                    onPreviewMovie(mov);
                  }
                }}
                onAddArchiveItem={onAddArchiveItem}
                onUpdateArchiveItem={onUpdateArchiveItem}
                onDeleteArchiveItem={onDeleteArchiveItem}
                onPreviewArchiveItem={(item) => {
                  if (onPreviewArchiveItem) {
                    onClose();
                    onPreviewArchiveItem(item);
                  }
                }}
                onAddNewsArticle={onAddNewsArticle}
                onUpdateNewsArticle={onUpdateNewsArticle}
                onDeleteNewsArticle={onDeleteNewsArticle}
                onAddArtist={onAddArtist}
                onUpdateArtist={onUpdateArtist}
                onDeleteArtist={onDeleteArtist}
                onPreviewArtist={(artist) => {
                  if (onPreviewArtist) {
                    onClose();
                    onPreviewArtist(artist);
                  }
                }}
                onUpdateAppConfig={onUpdateAppConfig}
                onUpdateHomeConfig={onUpdateHomeConfig}
                onPublishBroadcastAlert={onPublishBroadcastAlert}
                onDeleteBroadcastAlert={onDeleteBroadcastAlert}
                onSyncToCloud={onSyncToCloud}
                onApplyRestoredCatalog={onApplyRestoredCatalog}
                onResetDefaults={onResetDefaults}
              />
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="p-4 rounded-xl bg-[#101016] border border-[#ffd21f]/25 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ffd21f]/15 text-[#ffd21f] grid place-items-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#f5f4f8]">
                    Station Administrator Access Only
                  </p>
                  <p className="text-xs text-[#a5a3b2] mt-1 leading-relaxed">
                    Sign in with your authorized administrator email and password to access the Admin Control Panel and manage channels, stream sources, movies, hero slides, and TV guide schedules.
                  </p>
                </div>
              </div>

              {profile.signedIn && (
                <div className="p-3 rounded-xl bg-[#262631]/70 border border-white/[0.08] text-xs text-[#c9c7d2]">
                  Currently signed in as viewer{' '}
                  <span className="font-semibold text-[#f5f4f8]">
                    {profile.displayName}
                  </span>
                  . Sign in below with an authorized administrator email and password to continue.
                </div>
              )}

              <form
                onSubmit={(e) => void handleAdminEmailLogin(e)}
                className="space-y-3.5"
              >
                <div>
                  <label
                    htmlFor="admin-auth-email"
                    className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                  >
                    Administrator Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#6f6d7d] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-auth-email"
                      type="email"
                      autoComplete="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="Enter administrator email"
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#ffd21f] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-auth-password"
                    className="block text-xs font-medium text-[#c9c7d2] mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="admin-auth-password"
                      type={showAdminPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter administrator password"
                      className="w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#ffd21f] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword((p) => !p)}
                      aria-label={
                        showAdminPassword ? 'Hide password' : 'Show password'
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[34px] min-w-[34px] grid place-items-center text-[#a5a3b2] hover:text-[#f5f4f8]"
                    >
                      {showAdminPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {needsVerificationBanner && (
                  <div className="p-3 rounded-xl bg-[#101016] border border-[#ffd21f]/30 space-y-2">
                    <p className="text-xs text-[#e4e2ec]">
                      Verify your email address using the link sent to your inbox, then tap Check Verification.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCheckVerification()}
                        disabled={verificationLoading}
                        className="flex-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#ffd21f] text-[#101016] text-xs font-bold disabled:opacity-60"
                      >
                        {verificationLoading
                          ? 'Checking...'
                          : 'Check Verification'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResendVerification()}
                        disabled={verificationLoading}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#262631] text-xs font-semibold text-[#f5f4f8] disabled:opacity-60"
                      >
                        Resend Link
                      </button>
                    </div>
                  </div>
                )}

                {domainHelperBox}
                {feedback && (
                  <p className="text-xs text-[#ffd21f]">{feedback}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm font-bold transition-colors disabled:opacity-60"
                >
                  {authLoading
                    ? 'Verifying Credentials...'
                    : 'Sign In to Admin Panel'}
                </button>
              </form>
            </div>
          ))}
      </div>
    </div>
  );
}
