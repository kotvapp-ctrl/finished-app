import { useEffect, useRef, useState } from 'react';
import {
  Heart,
  LogIn,
  MessageSquare,
  Reply,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { ChatMessage } from '../types/broadcast';
import { formatRelativeChatTime } from '../utils/timeFormat';

interface StreamChatSectionProps {
  channelId: string;
  streamKey?: string;
  channelName: string;
  viewerName: string;
  currentUserId?: string;
  isSignedIn: boolean;
  isFirebaseConnected?: boolean;
  isAdmin?: boolean;
  networkNow: Date;
  messages: ChatMessage[];
  followedSenders: Set<string>;
  onRequestSignIn: () => void;
  onSendMessage: (
    channelId: string,
    text: string,
    replyTo?: ChatMessage['replyTo'],
    streamKey?: string
  ) => void;
  onToggleLikeMessage: (messageId: string) => void;
  onToggleFollowSender: (senderId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
}

export function StreamChatSection({
  channelId,
  streamKey,
  channelName,
  viewerName,
  currentUserId,
  isSignedIn,
  isFirebaseConnected = false,
  isAdmin = false,
  networkNow,
  messages,
  followedSenders,
  onRequestSignIn,
  onSendMessage,
  onToggleLikeMessage,
  onToggleFollowSender,
  onDeleteMessage,
}: StreamChatSectionProps) {
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage['replyTo'] | null>(
    null
  );
  const [filterMode, setFilterMode] = useState<'all' | 'following'>('all');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const effectiveKey = streamKey || channelId;

  useEffect(() => {
    setDraft('');
    setReplyingTo(null);
  }, [effectiveKey]);

  const channelMessages = messages.filter(
    (m) => (m.streamKey || m.channelId) === effectiveKey
  );
  const displayedMessages =
    filterMode === 'following'
      ? channelMessages.filter(
          (m) =>
            m.senderId === 'self' ||
            (currentUserId ? m.senderId === currentUserId : false) ||
            followedSenders.has(m.senderId)
        )
      : channelMessages;

  const handleStartReply = (msg: ChatMessage) => {
    if (!isSignedIn) {
      onRequestSignIn();
      return;
    }
    const trimmedExcerpt =
      msg.text.length > 70 ? `${msg.text.slice(0, 70)}...` : msg.text;
    setReplyingTo({
      messageId: msg.id,
      senderName: msg.senderName,
      excerpt: trimmedExcerpt,
    });
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      onRequestSignIn();
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage(channelId, trimmed, replyingTo || undefined, effectiveKey);
    setDraft('');
    setReplyingTo(null);
  };

  return (
    <section
      aria-label={`Viewer chat for ${channelName}`}
      className="bg-[#1d1d26] border border-white/[0.06] rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#ffd21f] shrink-0" />
            <h3 className="font-display text-base sm:text-lg font-bold text-[#f5f4f8]">
              Live Chat
            </h3>
          </div>
          <p className="text-xs text-[#a5a3b2] mt-0.5">
            <span className="font-mono-tabular">
              {channelMessages.length}
            </span>{' '}
            {channelMessages.length === 1 ? 'message' : 'messages'}
            <span aria-hidden="true" className="mx-1.5">
              ·
            </span>
            <span className="font-mono-tabular">{followedSenders.size}</span>{' '}
            following
          </p>
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-xl bg-[#101016] border border-white/[0.06]"
          role="tablist"
          aria-label="Filter chat messages"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === 'all'}
            onClick={() => setFilterMode('all')}
            className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterMode === 'all'
                ? 'bg-[#262631] text-[#f5f4f8]'
                : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
            }`}
          >
            All chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterMode === 'following'}
            onClick={() => setFilterMode('following')}
            className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              filterMode === 'following'
                ? 'bg-[#262631] text-[#ffd21f]'
                : 'text-[#a5a3b2] hover:text-[#f5f4f8]'
            }`}
          >
            Following
          </button>
        </div>
      </div>

      {/* Chat Feed */}
      <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.05]">
        {displayedMessages.length > 0 ? (
          displayedMessages.map((msg) => {
            const isOwn =
              msg.senderId === 'self' ||
              (currentUserId ? msg.senderId === currentUserId : false);
            const isFollowing = followedSenders.has(msg.senderId);
            const liked = Boolean(msg.likedByMe);

            return (
              <article key={msg.id} className="p-4 sm:px-5 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                        isOwn
                          ? 'bg-[#ffd21f] text-[#101016]'
                          : 'bg-[#262631] text-[#f5f4f8] border border-white/10'
                      }`}
                    >
                      {msg.senderName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-[#f5f4f8] truncate">
                          {msg.senderName}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-xs text-[#6f6d7d]"
                        >
                          ·
                        </span>
                        <span className="text-xs text-[#a5a3b2] font-mono-tabular">
                          {formatRelativeChatTime(
                            msg.timestampMs,
                            msg.createdAt,
                            networkNow
                          )}
                        </span>
                        {msg.pendingSync && (
                          <span className="text-[10px] font-semibold text-[#ffd21f] px-1.5 py-0.5 rounded bg-[#ffd21f]/10 border border-[#ffd21f]/25">
                            Pending sync
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isOwn && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isSignedIn) {
                          onRequestSignIn();
                          return;
                        }
                        onToggleFollowSender(msg.senderId);
                      }}
                      aria-pressed={isFollowing}
                      title={
                        isSignedIn
                          ? undefined
                          : 'Sign in to follow viewers'
                      }
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                        isFollowing
                          ? 'bg-[#ffd21f]/15 text-[#ffd21f] border border-[#ffd21f]/30'
                          : 'bg-[#262631] hover:bg-[#323240] text-[#e4e2ec] border border-white/[0.08]'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Follow
                        </>
                      )}
                    </button>
                  )}
                </div>

                {msg.replyTo && (
                  <div className="bg-[#101016] border border-white/[0.06] rounded-xl px-3 py-2 text-xs">
                    <p className="font-semibold text-[#ffd21f]">
                      Replying to {msg.replyTo.senderName}
                    </p>
                    <p className="text-[#a5a3b2] truncate mt-0.5">
                      {msg.replyTo.excerpt}
                    </p>
                  </div>
                )}

                <p className="text-sm text-[#e4e2ec] leading-relaxed break-words">
                  {msg.text}
                </p>

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isSignedIn) {
                        onRequestSignIn();
                        return;
                      }
                      onToggleLikeMessage(msg.id);
                    }}
                    aria-pressed={liked}
                    aria-label={
                      liked
                        ? `Unlike message from ${msg.senderName}`
                        : `Like message from ${msg.senderName}`
                    }
                    title={isSignedIn ? undefined : 'Sign in to like comments'}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      liked
                        ? 'bg-[#ffd21f]/15 text-[#ffd21f]'
                        : 'bg-[#101016] hover:bg-[#262631] text-[#a5a3b2] hover:text-[#f5f4f8]'
                    }`}
                  >
                    <Heart
                      className="w-3.5 h-3.5"
                      fill={liked ? 'currentColor' : 'none'}
                    />
                    <span className="font-mono-tabular">{msg.likes}</span>
                    <span>{liked ? 'Liked' : 'Like'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartReply(msg)}
                    aria-label={`Reply to ${msg.senderName}`}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[#101016] hover:bg-[#262631] text-xs font-semibold text-[#a5a3b2] hover:text-[#f5f4f8] flex items-center gap-1.5 transition-colors"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    Reply
                  </button>

                  {onDeleteMessage &&
                    ((isOwn &&
                      (isFirebaseConnected ||
                        msg.senderId === 'self' ||
                        msg.pendingSync)) ||
                      isAdmin) && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        aria-label={`Delete message from ${msg.senderName}`}
                        className="ml-auto min-h-[36px] px-2.5 py-1 rounded-lg bg-[#101016] hover:bg-red-500/15 text-xs font-semibold text-[#a5a3b2] hover:text-red-300 flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                </div>
              </article>
            );
          })
        ) : (
          <div className="p-6 text-center text-xs sm:text-sm text-[#a5a3b2]">
            {filterMode === 'following'
              ? 'Follow viewers in chat to filter their messages here.'
              : `No messages yet on ${channelName}. Say hello below.`}
          </div>
        )}
      </div>

      {/* Composer or Sign-In Gate */}
      {isSignedIn ? (
        <form
          onSubmit={handleSubmit}
          className="p-3.5 sm:p-4 bg-[#15151d] border-t border-white/[0.06] space-y-2.5"
        >
          {!isFirebaseConnected && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#101016] border border-[#ffd21f]/30 text-xs">
              <p className="text-[#c9c7d2]">
                Verify your account or reconnect online to sync and back up comments to Firebase.
              </p>
              <button
                type="button"
                onClick={onRequestSignIn}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] font-bold whitespace-nowrap shrink-0 transition-colors"
              >
                Account Sync
              </button>
            </div>
          )}

          {replyingTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#101016] border border-[#ffd21f]/30 text-xs">
              <div className="min-w-0">
                <span className="font-semibold text-[#ffd21f]">
                  Replying to {replyingTo.senderName}
                </span>
                <span className="text-[#a5a3b2] ml-2 truncate">
                  {replyingTo.excerpt}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                className="min-h-[32px] min-w-[32px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-[#f5f4f8] shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                replyingTo
                  ? `Write a reply to ${replyingTo.senderName}...`
                  : `Chat as ${viewerName} on ${channelName}...`
              }
              maxLength={280}
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#101016] border border-[#30303b] focus:border-[#1685ff] focus:outline-none text-sm text-[#f5f4f8] placeholder:text-[#6f6d7d]"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] disabled:opacity-45 disabled:hover:bg-[#ffd21f] text-[#101016] text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="p-4 bg-[#15151d] border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#f5f4f8]">
              Sign in to comment on {channelName}
            </p>
            <p className="text-xs text-[#a5a3b2] mt-0.5">
              Sign in to your user account to post messages, reply, like, and follow senders.
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestSignIn}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign in to Comment</span>
          </button>
        </div>
      )}
    </section>
  );
}
