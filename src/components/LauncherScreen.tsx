import { LAUNCHER_MOSAIC } from '../data/channels';

interface LauncherScreenProps {
  signedIn: boolean;
  onGetStarted: () => void;
  onSignIn: () => void;
}

export function LauncherScreen({
  signedIn,
  onGetStarted,
  onSignIn,
}: LauncherScreenProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Kakumiro Online TV"
      className="fixed inset-0 z-50 bg-[#101016] text-[#f5f4f8] flex flex-col justify-end overflow-hidden"
    >
      {/* Background tilted broadcast mosaic */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <div className="relative w-full h-full max-w-4xl mx-auto">
          <img
            src={LAUNCHER_MOSAIC}
            alt="Kakumiro Online TV featured broadcasts and films"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-top"
          />
          <div className="hidden md:block absolute inset-y-0 left-0 w-36 bg-gradient-to-r from-[#101016] to-transparent" />
          <div className="hidden md:block absolute inset-y-0 right-0 w-36 bg-gradient-to-l from-[#101016] to-transparent" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#101016] via-[#101016]/80 to-black/15" />
      </div>

      {/* Foreground brand emblem, copy, and primary action */}
      <div className="relative z-10 w-full max-w-md mx-auto px-6 pb-10 sm:pb-12 pt-16 text-center flex flex-col items-center">
        {/* KOTV TV Emblem */}
        <div className="relative mb-6">
          <div className="px-3 py-0.5 rounded-full bg-[#101016] border border-[#ffd21f] text-[10px] font-extrabold tracking-widest uppercase text-[#ffd21f] inline-block relative z-10 -mb-2.5">
            KOTV
          </div>
          <div className="w-[104px] rounded-2xl border-2 border-[#ffd21f] bg-[#101016]/95 shadow-2xl overflow-hidden">
            <div className="py-3.5 px-3">
              <span className="font-display text-4xl font-extrabold tracking-tight text-[#ffd21f] leading-none block">
                TV
              </span>
            </div>
            <div className="bg-[#ffd21f] text-[#101016] py-1 px-2 text-[10px] font-extrabold tracking-tight">
              Kakumiro Online
            </div>
          </div>
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#f5f4f8] text-balance">
          Welcome to Kakumiro Online TV
        </h1>

        <p className="mt-2.5 text-sm sm:text-base text-[#b9b7c6] leading-relaxed max-w-sm">
          Stream unlimited movies, Bunyoro films, TV shows, live news, sports and visual radio
        </p>

        <div className="mt-7 w-full space-y-3">
          <button
            type="button"
            onClick={onGetStarted}
            className="w-full min-h-[50px] px-6 py-3 rounded-full bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm sm:text-base font-bold transition-colors shadow-lg"
          >
            Get started
          </button>

          {!signedIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="w-full min-h-[42px] px-4 py-2 text-xs font-semibold text-[#c9c7d2] hover:text-[#ffd21f] transition-colors"
            >
              Sign in to your account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
