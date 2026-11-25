import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock,
  Newspaper,
  Play,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  User as UserIcon,
  X,
} from 'lucide-react';
import { NEWS_CATEGORIES } from '../data/channels';
import { Channel, NewsArticle, NewsCategory } from '../types/broadcast';
import { AutoImagePreview } from './AutoImagePreview';

interface NewsViewProps {
  articles: NewsArticle[];
  channels: Channel[];
  isAdmin?: boolean;
  onSelectChannel?: (channel: Channel, contextTitle?: string) => void;
  onOpenControlPanel?: (section: 'news', itemId?: string) => void;
}

const CATEGORY_STYLES: Record<NewsCategory, string> = {
  Breaking: 'bg-red-500/15 text-red-300 border-red-500/35',
  Politics: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  Sports: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  Business: 'bg-[#ffd21f]/15 text-[#ffd21f] border-[#ffd21f]/35',
  Community: 'bg-violet-500/15 text-violet-300 border-violet-500/35',
  Entertainment: 'bg-pink-500/15 text-pink-300 border-pink-500/35',
};

function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export function NewsView({
  articles,
  channels,
  isAdmin = false,
  onSelectChannel,
  onOpenControlPanel,
}: NewsViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    'All' | NewsCategory
  >('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeArticle, setActiveArticle] = useState<NewsArticle | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sortedArticles = useMemo(
    () => [...articles].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)),
    [articles]
  );

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sortedArticles.filter((article) => {
      if (selectedCategory !== 'All' && article.category !== selectedCategory) {
        return false;
      }
      if (q) {
        const hay =
          `${article.headline} ${article.summary} ${article.body} ${article.author} ${article.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sortedArticles, selectedCategory, searchQuery]);

  const showLeadSplit =
    selectedCategory === 'All' &&
    searchQuery.trim() === '' &&
    filteredArticles.length > 0;

  const leadArticle = useMemo(() => {
    if (!showLeadSplit) return null;
    return (
      filteredArticles.find((a) => a.featured) ||
      filteredArticles.find((a) => a.category === 'Breaking') ||
      filteredArticles[0] ||
      null
    );
  }, [showLeadSplit, filteredArticles]);

  const remainingArticles = useMemo(() => {
    if (!leadArticle) return filteredArticles;
    return filteredArticles.filter((a) => a.id !== leadArticle.id);
  }, [filteredArticles, leadArticle]);

  useEffect(() => {
    if (!activeArticle) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveArticle(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeArticle]);

  const handleShareArticle = async (article: NewsArticle) => {
    const shareText = `${article.headline}\n\n${article.summary}\n— Kakumiro Online TV News`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: article.headline,
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
    setCopiedId(article.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  const relatedChannel = activeArticle?.channelId
    ? channels.find((c) => c.id === activeArticle.channelId)
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-red-500/15 border border-red-500/35 text-[11px] font-bold uppercase tracking-wider text-red-300">
              <Newspaper className="w-3.5 h-3.5" />
              <span>Written News Desk</span>
            </span>
            <span className="text-xs text-[#a5a3b2] font-mono-tabular">
              {sortedArticles.length}{' '}
              {sortedArticles.length === 1 ? 'story' : 'stories'}
            </span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#f5f4f8] mt-2">
            Breaking News
          </h2>
          <p className="text-sm text-[#a5a3b2] mt-0.5">
            Written bulletins, community updates, sports desks, and regional reports from Kakumiro Online TV
          </p>
        </div>

        {isAdmin && onOpenControlPanel && (
          <button
            type="button"
            onClick={() => onOpenControlPanel('news')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Publish Breaking News</span>
          </button>
        )}
      </div>

      {/* Category Filter & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
          role="tablist"
          aria-label="News categories"
        >
          {(['All', ...NEWS_CATEGORIES] as const).map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                    : 'bg-[#1d1d26] text-[#e4e2ec] border-white/10 hover:bg-[#262631]'
                }`}
              >
                {cat}
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
            placeholder="Search written news..."
            aria-label="Search written news"
            className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[#1d1d26] border border-white/10 focus:border-[#ffd21f] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
          />
        </div>
      </div>

      {/* Lead Story Card */}
      {leadArticle && (
        <article className="bg-[#1d1d26] border border-white/[0.08] rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {leadArticle.imageUrl && (
            <div className="lg:col-span-5 relative min-h-[200px] lg:min-h-[260px] bg-[#121218]">
              <AutoImagePreview
                src={leadArticle.imageUrl}
                alt={leadArticle.headline}
                className="w-full h-full bg-transparent"
                imgClassName="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d26]/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#1d1d26]/40 pointer-events-none" />
            </div>
          )}

          <div
            className={`${
              leadArticle.imageUrl ? 'lg:col-span-7' : 'lg:col-span-12'
            } p-5 sm:p-6 flex flex-col justify-between gap-4`}
          >
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wider ${
                    CATEGORY_STYLES[leadArticle.category]
                  }`}
                >
                  {leadArticle.category}
                </span>
                <span className="text-[#a5a3b2] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {leadArticle.publishedAt}
                </span>
                <span aria-hidden="true" className="text-[#6f6d7d]">
                  ·
                </span>
                <span className="text-[#a5a3b2] font-mono-tabular">
                  {estimateReadingMinutes(leadArticle.body)} min read
                </span>
              </div>

              <h3 className="font-display text-xl sm:text-2xl font-bold text-[#f5f4f8] leading-snug">
                {leadArticle.headline}
              </h3>

              <p className="text-sm text-[#c9c7d2] leading-relaxed">
                {leadArticle.summary}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
              <span className="text-xs text-[#a5a3b2] flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                <span>By {leadArticle.author}</span>
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {isAdmin && onOpenControlPanel && (
                  <button
                    type="button"
                    onClick={() => onOpenControlPanel('news', leadArticle.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#ffd21f] flex items-center gap-1.5"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveArticle(leadArticle)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Read full report</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      )}

      {/* Written Articles Grid */}
      {remainingArticles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {remainingArticles.map((article) => (
            <article
              key={article.id}
              className="bg-[#1d1d26] border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              {article.imageUrl && (
                <div className="relative aspect-[16/9] bg-[#121218]">
                  <AutoImagePreview
                    src={article.imageUrl}
                    alt={article.headline}
                    className="w-full h-full bg-transparent"
                    imgClassName="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1d1d26] via-transparent to-transparent pointer-events-none" />
                </div>
              )}

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider ${
                        CATEGORY_STYLES[article.category]
                      }`}
                    >
                      {article.category}
                    </span>
                    <span className="text-[#a5a3b2]">{article.publishedAt}</span>
                    <span aria-hidden="true" className="text-[#6f6d7d]">
                      ·
                    </span>
                    <span className="text-[#a5a3b2] font-mono-tabular">
                      {estimateReadingMinutes(article.body)} min read
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-[#f5f4f8] leading-snug">
                    {article.headline}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#c9c7d2] leading-relaxed line-clamp-3">
                    {article.summary}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                  <span className="text-xs text-[#a5a3b2] truncate">
                    By {article.author}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAdmin && onOpenControlPanel && (
                      <button
                        type="button"
                        onClick={() => onOpenControlPanel('news', article.id)}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#ffd21f]"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveArticle(article)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] flex items-center gap-1.5 transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#ffd21f]" />
                      <span>Read article</span>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : !leadArticle ? (
        <div className="p-8 rounded-2xl bg-[#1d1d26] border border-white/[0.06] text-center space-y-2">
          <Newspaper className="w-8 h-8 text-[#ffd21f] mx-auto" />
          <p className="text-sm font-semibold text-[#f5f4f8]">
            No breaking news stories match this filter
          </p>
          <p className="text-xs text-[#a5a3b2]">
            Try clearing your search or choosing another news category.
          </p>
        </div>
      ) : null}

      {/* Full Written News Reader Modal */}
      {activeArticle && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="news-reader-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveArticle(null);
          }}
        >
          <div className="w-full max-w-2xl max-h-[92vh] bg-[#16161f] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="px-4 sm:px-6 h-14 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0 bg-[#101016]">
              <button
                type="button"
                onClick={() => setActiveArticle(null)}
                className="min-h-[40px] px-2 -ml-2 rounded-xl text-xs font-semibold text-[#c9c7d2] hover:text-[#f5f4f8] hover:bg-white/[0.06] inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>All Breaking News</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleShareArticle(activeArticle)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#262631] hover:bg-[#323240] text-xs font-semibold text-[#f5f4f8] inline-flex items-center gap-1.5"
                >
                  {copiedId === activeArticle.id ? (
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
                  onClick={() => setActiveArticle(null)}
                  aria-label="Close article"
                  className="min-h-[38px] min-w-[38px] grid place-items-center rounded-xl text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-5 sm:p-7 space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wider ${
                    CATEGORY_STYLES[activeArticle.category]
                  }`}
                >
                  {activeArticle.category}
                </span>
                <span className="text-[#a5a3b2]">
                  {activeArticle.publishedAt}
                </span>
                <span aria-hidden="true" className="text-[#6f6d7d]">
                  ·
                </span>
                <span className="text-[#a5a3b2] font-mono-tabular">
                  {estimateReadingMinutes(activeArticle.body)} min read
                </span>
              </div>

              <h2
                id="news-reader-title"
                className="font-display text-2xl sm:text-3xl font-extrabold text-[#f5f4f8] leading-tight"
              >
                {activeArticle.headline}
              </h2>

              <p className="text-xs text-[#a5a3b2] flex items-center gap-1.5 pb-3 border-b border-white/[0.08]">
                <UserIcon className="w-3.5 h-3.5 text-[#ffd21f]" />
                <span>Written by {activeArticle.author}</span>
              </p>

              {activeArticle.imageUrl && (
                <div className="rounded-2xl overflow-hidden border border-white/10 aspect-[16/9] bg-[#101016]">
                  <AutoImagePreview
                    src={activeArticle.imageUrl}
                    alt={activeArticle.headline}
                    allowExpand
                    className="w-full h-full bg-transparent"
                    imgClassName="w-full h-full object-cover"
                  />
                </div>
              )}

              <p className="text-base font-medium text-[#e4e2ec] leading-relaxed border-l-2 border-[#ffd21f] pl-4">
                {activeArticle.summary}
              </p>

              <div className="space-y-4 text-sm sm:text-base text-[#d9d7e3] leading-relaxed">
                {activeArticle.body
                  .split(/\n+/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))}
              </div>

              {relatedChannel && onSelectChannel && (
                <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#f5f4f8]">
                      Watch live coverage on {relatedChannel.name}
                    </p>
                    <p className="text-[11px] text-[#a5a3b2]">
                      {relatedChannel.program}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveArticle(null);
                      onSelectChannel(relatedChannel, activeArticle.headline);
                    }}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold inline-flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Watch {relatedChannel.name}</span>
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
