import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Film, Info, Play, Search, Tv, X } from 'lucide-react';
import { MOVIE_GENRES } from '../data/channels';
import { Channel, MovieGenre, MovieItem, StreamFormat } from '../types/broadcast';
import { AutoImagePreview } from './AutoImagePreview';

interface MoviesViewProps {
  movies: MovieItem[];
  channels: Channel[];
  movieAutoArtUrl?: string;
  onPlayMovie: (
    channel: Channel,
    contextTitle?: string,
    overrideStreamUrl?: string,
    overrideStreamType?: StreamFormat
  ) => void;
}

const GENRE_BACKDROPS: Record<MovieGenre, string> = {
  Action: 'from-[#1b2e4f] via-[#111c33] to-[#0e1018]',
  Thriller: 'from-[#1f293d] via-[#141926] to-[#0e1016]',
  Horror: 'from-[#42131c] via-[#220d14] to-[#100e14]',
  Adventure: 'from-[#16382b] via-[#0f221b] to-[#0e1116]',
  'Bunyoro Films': 'from-[#4a310a] via-[#291c09] to-[#121016]',
  Series: 'from-[#2e1f4d] via-[#1b142e] to-[#101016]',
  Drama: 'from-[#332238] via-[#1e1522] to-[#101016]',
  Comedy: 'from-[#3d2b14] via-[#241a0f] to-[#101016]',
};

function MoviePosterCard({
  movie,
  fallbackPosterUrl,
  size = 'standard',
  onPlay,
  onInspect,
}: {
  movie: MovieItem;
  fallbackPosterUrl?: string;
  size?: 'featured' | 'standard';
  onPlay: (movie: MovieItem) => void;
  onInspect: (movie: MovieItem) => void;
}) {
  const backdrop = GENRE_BACKDROPS[movie.genre] || GENRE_BACKDROPS.Action;

  return (
    <article
      className={`group flex flex-col ${
        size === 'featured'
          ? 'w-[200px] sm:w-[232px] shrink-0'
          : 'w-full'
      }`}
    >
      <div
        className={`relative w-full ${
          size === 'featured' ? 'aspect-[4/5]' : 'aspect-[2/3]'
        } rounded-2xl overflow-hidden bg-gradient-to-br ${backdrop} border border-white/[0.08]`}
      >
        <AutoImagePreview
          src={movie.posterPath || fallbackPosterUrl}
          alt={movie.title}
          className="w-full h-full bg-transparent"
          imgClassName="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
          fallbackNode={
            <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-transparent to-black/20">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-[#ffd21f]/90">
                {movie.genre}
              </span>
              <div>
                <Film className="w-7 h-7 text-white/30 mb-2" />
                <p className="font-display text-lg font-extrabold leading-tight text-[#f5f4f8] text-balance">
                  {movie.title}
                </p>
              </div>
            </div>
          }
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#101016] via-[#101016]/35 to-transparent pointer-events-none" />

        <button
          type="button"
          onClick={() => onPlay(movie)}
          aria-label={`Watch ${movie.title}`}
          className="absolute inset-0 w-full h-full flex flex-col justify-end p-3.5 text-left focus-visible:outline-2 focus-visible:outline-[#1685ff]"
        >
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-[#ffd21f] font-semibold truncate">
                {movie.genre}
              </p>
              <h3 className="text-sm font-bold text-[#f5f4f8] leading-snug line-clamp-2 mt-0.5">
                {movie.title}
              </h3>
            </div>
            <span className="w-9 h-9 rounded-full bg-[#ffd21f] text-[#101016] grid place-items-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInspect(movie);
          }}
          aria-label={`Details for ${movie.title}`}
          className="absolute top-2.5 right-2.5 z-10 min-h-[36px] min-w-[36px] grid place-items-center rounded-xl bg-black/55 hover:bg-black/80 text-[#f5f4f8] opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-[#a5a3b2] mt-2 truncate px-0.5">
        <span className="font-mono-tabular">{movie.year}</span>
        <span aria-hidden="true" className="mx-1.5">
          ·
        </span>
        <span className="font-mono-tabular">{movie.duration}</span>
      </p>
    </article>
  );
}

export function MoviesView({
  movies,
  channels,
  movieAutoArtUrl,
  onPlayMovie,
}: MoviesViewProps) {
  const [formatFilter, setFormatFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [genreFilter, setGenreFilter] = useState<'All' | MovieGenre>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGenreMenu, setShowGenreMenu] = useState(false);
  const [inspectedMovie, setInspectedMovie] = useState<MovieItem | null>(null);

  const handlePlay = (movie: MovieItem) => {
    const channel =
      channels.find((c) => c.id === movie.channelId) || channels[0];
    if (!channel) return;
    onPlayMovie(
      channel,
      movie.title,
      movie.streamUrl,
      movie.streamType
    );
  };

  const filteredMovies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return movies.filter((m) => {
      if (formatFilter === 'movie' && m.format !== 'movie') return false;
      if (
        formatFilter === 'series' &&
        m.format !== 'series' &&
        m.genre !== 'Series'
      ) {
        return false;
      }
      if (genreFilter !== 'All') {
        if (genreFilter === 'Series') {
          if (m.format !== 'series' && m.genre !== 'Series') return false;
        } else if (m.genre !== genreFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${m.title} ${m.genre} ${m.description} ${m.channelName} ${m.year}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movies, formatFilter, genreFilter, searchQuery]);

  const featuredMovies = useMemo(() => {
    const featured = movies.filter((m) => m.featured);
    return featured.length > 0 ? featured : movies.slice(0, 5);
  }, [movies]);

  const isDefaultBrowse =
    formatFilter === 'all' &&
    genreFilter === 'All' &&
    searchQuery.trim() === '';

  const genreShelves: {
    id: string;
    title: string;
    items: MovieItem[];
    jumpGenre?: MovieGenre;
    jumpFormat?: 'series';
  }[] = useMemo(() => {
    const shelves: {
      id: string;
      title: string;
      items: MovieItem[];
      jumpGenre?: MovieGenre;
      jumpFormat?: 'series';
    }[] = [
      {
        id: 'bunyoro',
        title: 'Bunyoro Films',
        items: movies.filter((m) => m.genre === 'Bunyoro Films'),
        jumpGenre: 'Bunyoro Films',
      },
      {
        id: 'series',
        title: 'Series',
        items: movies.filter(
          (m) => m.format === 'series' || m.genre === 'Series'
        ),
        jumpFormat: 'series',
      },
      {
        id: 'action-thriller',
        title: 'Action & Thriller',
        items: movies.filter(
          (m) => m.genre === 'Action' || m.genre === 'Thriller'
        ),
        jumpGenre: 'Action',
      },
      {
        id: 'horror',
        title: 'Horror',
        items: movies.filter((m) => m.genre === 'Horror'),
        jumpGenre: 'Horror',
      },
      {
        id: 'adventure',
        title: 'Adventure',
        items: movies.filter((m) => m.genre === 'Adventure'),
        jumpGenre: 'Adventure',
      },
      {
        id: 'drama-comedy',
        title: 'Drama & Comedy',
        items: movies.filter(
          (m) => m.genre === 'Drama' || m.genre === 'Comedy'
        ),
        jumpGenre: 'Comedy',
      },
    ];
    return shelves.filter((s) => s.items.length > 0);
  }, [movies]);

  return (
    <div className="space-y-6">
      {/* Filter & Genre Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 relative">
          <button
            type="button"
            onClick={() => {
              setFormatFilter('all');
              setGenreFilter('All');
              setShowGenreMenu(false);
            }}
            className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
              formatFilter === 'all' && genreFilter === 'All'
                ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                : 'bg-[#1d1d26] text-[#e4e2ec] border-white/10 hover:bg-[#262631]'
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => {
              setFormatFilter((prev) => (prev === 'movie' ? 'all' : 'movie'));
              setShowGenreMenu(false);
            }}
            className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
              formatFilter === 'movie'
                ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                : 'bg-[#1d1d26] text-[#e4e2ec] border-white/10 hover:bg-[#262631]'
            }`}
          >
            Movies
          </button>

          <button
            type="button"
            onClick={() => {
              setFormatFilter((prev) => (prev === 'series' ? 'all' : 'series'));
              if (genreFilter === 'Series') setGenreFilter('All');
              setShowGenreMenu(false);
            }}
            className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
              formatFilter === 'series'
                ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                : 'bg-[#1d1d26] text-[#e4e2ec] border-white/10 hover:bg-[#262631]'
            }`}
          >
            Series
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowGenreMenu((prev) => !prev)}
              aria-expanded={showGenreMenu}
              className={`min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                genreFilter !== 'All'
                  ? 'bg-[#ffd21f] text-[#101016] border-[#ffd21f]'
                  : 'bg-[#1d1d26] text-[#e4e2ec] border-white/10 hover:bg-[#262631]'
              }`}
            >
              <span>{genreFilter === 'All' ? 'Genres' : genreFilter}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showGenreMenu && (
              <div className="absolute left-0 top-12 z-30 w-48 rounded-2xl bg-[#1d1d26] border border-white/10 shadow-2xl py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setGenreFilter('All');
                    setShowGenreMenu(false);
                  }}
                  className={`w-full min-h-[38px] px-4 text-left text-xs font-semibold transition-colors ${
                    genreFilter === 'All'
                      ? 'text-[#ffd21f] bg-white/[0.04]'
                      : 'text-[#e4e2ec] hover:bg-white/[0.04]'
                  }`}
                >
                  All Genres
                </button>
                {MOVIE_GENRES.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => {
                      setGenreFilter(genre);
                      if (genre === 'Series') {
                        setFormatFilter('series');
                      } else if (formatFilter === 'series') {
                        setFormatFilter('all');
                      }
                      setShowGenreMenu(false);
                    }}
                    className={`w-full min-h-[38px] px-4 text-left text-xs font-semibold transition-colors ${
                      genreFilter === genre
                        ? 'text-[#ffd21f] bg-white/[0.04]'
                        : 'text-[#e4e2ec] hover:bg-white/[0.04]'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#a5a3b2] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search movies, series, Bunyoro..."
            aria-label="Search movies and series"
            className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[#1d1d26] border border-white/10 focus:border-[#1685ff] focus:outline-none text-xs text-[#f5f4f8] placeholder:text-[#6f6d7d]"
          />
        </div>
      </div>

      {/* Quick Movie Details Panel */}
      {inspectedMovie && (
        <section
          aria-label="Selected title details"
          className="p-4 sm:p-5 rounded-2xl bg-[#1d1d26] border border-[#ffd21f]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-4 min-w-0">
            {(inspectedMovie.posterPath?.trim() || movieAutoArtUrl?.trim()) && (
              <AutoImagePreview
                src={inspectedMovie.posterPath || movieAutoArtUrl}
                alt={inspectedMovie.title}
                fallbackLabel="Auto art"
                allowExpand
                className="w-20 h-28 rounded-xl border border-white/10 shrink-0"
              />
            )}
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs text-[#ffd21f] font-semibold">
                <span>
                  {inspectedMovie.format === 'series' ? 'Series' : 'Movie'}
                </span>
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                <span>{inspectedMovie.genre}</span>
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                <span className="font-mono-tabular">{inspectedMovie.year}</span>
                <span aria-hidden="true" className="mx-1.5">
                  ·
                </span>
                <span className="font-mono-tabular">{inspectedMovie.duration}</span>
              </p>
              <h3 className="font-display text-xl font-bold text-[#f5f4f8]">
                {inspectedMovie.title}
              </h3>
              <p className="text-xs sm:text-sm text-[#c9c7d2] max-w-2xl leading-relaxed">
                {inspectedMovie.description}
              </p>
              <p className="text-xs text-[#a5a3b2] flex items-center gap-1.5 pt-0.5">
                <Tv className="w-3.5 h-3.5 text-[#ffd21f]" />
                <span>Channel: {inspectedMovie.channelName}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handlePlay(inspectedMovie)}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              Watch now
            </button>
            <button
              type="button"
              onClick={() => setInspectedMovie(null)}
              aria-label="Close movie details"
              className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl bg-[#262631] hover:bg-[#323240] text-[#c9c7d2]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {isDefaultBrowse ? (
        <div className="space-y-8">
          {/* Featured Showcase Row */}
          {featuredMovies.length > 0 && (
            <section aria-labelledby="featured-movies-heading">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2
                  id="featured-movies-heading"
                  className="font-display text-lg sm:text-xl font-bold text-[#f5f4f8]"
                >
                  Featured Movies &amp; Bunyoro Cinema
                </h2>
                <span className="text-xs text-[#a5a3b2] font-mono-tabular">
                  {movies.length} titles
                </span>
              </div>
              <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2">
                {featuredMovies.map((movie) => (
                  <MoviePosterCard
                    key={movie.id}
                    movie={movie}
                    fallbackPosterUrl={movieAutoArtUrl}
                    size="featured"
                    onPlay={handlePlay}
                    onInspect={setInspectedMovie}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Genre Shelves */}
          {genreShelves.map((shelf) => (
            <section key={shelf.id} aria-labelledby={`shelf-${shelf.id}`}>
              <button
                type="button"
                onClick={() => {
                  if (shelf.jumpGenre) setGenreFilter(shelf.jumpGenre);
                  if (shelf.jumpFormat) setFormatFilter(shelf.jumpFormat);
                }}
                className="inline-flex items-center gap-1.5 mb-3 group"
              >
                <h2
                  id={`shelf-${shelf.id}`}
                  className="font-display text-lg sm:text-xl font-bold text-[#f5f4f8] group-hover:text-[#ffd21f] transition-colors"
                >
                  {shelf.title}
                </h2>
                <ChevronRight className="w-5 h-5 text-[#a5a3b2] group-hover:text-[#ffd21f]" />
              </button>

              <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-2">
                {shelf.items.map((movie) => (
                  <div key={movie.id} className="w-[152px] sm:w-[178px] shrink-0">
                    <MoviePosterCard
                      movie={movie}
                      fallbackPosterUrl={movieAutoArtUrl}
                      onPlay={handlePlay}
                      onInspect={setInspectedMovie}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section aria-label="Filtered movies and series" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#f5f4f8]">
              {genreFilter !== 'All'
                ? genreFilter
                : formatFilter === 'series'
                  ? 'Series'
                  : 'Movies'}
            </h2>
            <span className="text-xs text-[#a5a3b2] font-mono-tabular">
              {filteredMovies.length}{' '}
              {filteredMovies.length === 1 ? 'title' : 'titles'}
            </span>
          </div>

          {filteredMovies.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredMovies.map((movie) => (
                <MoviePosterCard
                  key={movie.id}
                  movie={movie}
                  fallbackPosterUrl={movieAutoArtUrl}
                  onPlay={handlePlay}
                  onInspect={setInspectedMovie}
                />
              ))}
            </div>
          ) : (
            <div className="p-10 rounded-2xl bg-[#1d1d26] border border-white/[0.06] text-center space-y-2">
              <p className="text-sm font-semibold text-[#f5f4f8]">
                No movies or series match your filter
              </p>
              <p className="text-xs text-[#a5a3b2]">
                Clear the genre filter or search term to browse all titles.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFormatFilter('all');
                  setGenreFilter('All');
                  setSearchQuery('');
                }}
                className="mt-2 min-h-[40px] px-4 py-1.5 rounded-xl bg-[#ffd21f] text-[#101016] text-xs font-bold"
              >
                Show all movies
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
