import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export function PWAInstallButton({ variant = 'card' }: PWAInstallButtonProps) {
  const { canInstallPrompt, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (canInstallPrompt) {
      const outcome = await install();
      if (outcome !== 'unavailable') return;
    }
    setShowInstructions(true);
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="min-h-[40px] px-3 py-2 rounded-xl bg-[#1d1d26] hover:bg-[#262631] border border-white/10 text-xs font-semibold text-[#f5f4f8] whitespace-nowrap inline-flex items-center gap-1.5 transition-colors"
          aria-label="Install Kakumiro Online TV app"
        >
          <Download className="w-3.5 h-3.5 text-[#ffd21f]" />
          <span className="hidden lg:inline">Install App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#262631] hover:bg-[#323240] border border-white/10 text-xs font-semibold text-[#f5f4f8] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-[#ffd21f]" />
          <span>Install App</span>
        </button>
      )}

      {showInstructions && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowInstructions(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#1c1c25] border border-white/10 p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-[#ffd21f]/15 text-[#ffd21f] grid place-items-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </span>
                <div>
                  <h3
                    id="pwa-install-guide-title"
                    className="text-base font-bold text-[#f5f4f8]"
                  >
                    Install Kakumiro Online TV
                  </h3>
                  <p className="text-xs text-[#a5a3b2]">
                    Add to Home Screen for instant launch &amp; Offline Mode
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                aria-label="Close install instructions"
                className="min-h-[36px] min-w-[36px] grid place-items-center rounded-lg text-[#a5a3b2] hover:text-[#f5f4f8] hover:bg-white/[0.06]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-xs text-[#e4e2ec] leading-relaxed list-decimal list-inside">
                <li>
                  Tap the{' '}
                  <span className="inline-flex items-center gap-1 font-semibold text-[#ffd21f]">
                    <Share className="w-3.5 h-3.5" /> Share
                  </span>{' '}
                  button in Safari.
                </li>
                <li>
                  Scroll down and tap{' '}
                  <strong className="text-[#f5f4f8]">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-[#f5f4f8]">Add</strong> to save Kakumiro Online TV with its Android/iOS launcher icon.
                </li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-xs text-[#e4e2ec] leading-relaxed list-decimal list-inside">
                <li>
                  Open your browser menu (<strong className="text-[#f5f4f8]">⋮</strong> in Chrome/Edge).
                </li>
                <li>
                  Tap <strong className="text-[#f5f4f8]">Install app</strong> or{' '}
                  <strong className="text-[#f5f4f8]">Add to Home screen</strong>.
                </li>
                <li>
                  Once installed, launch from your home screen anytime — even offline.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="w-full min-h-[42px] rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-xs font-bold transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
