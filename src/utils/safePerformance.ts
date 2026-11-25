// Guard User Timing API calls (used by React 19 Dev/Profiler instrumentation)
// against browsers (e.g. Firefox/Gecko) where performance.measure throws
// "SyntaxError: An invalid or illegal string was specified" on options objects.
if (typeof window !== 'undefined' && typeof window.performance !== 'undefined') {
  const perf = window.performance;

  const installSafeMethod = <K extends 'measure' | 'clearMeasures'>(
    key: K,
    wrapped: Performance[K]
  ) => {
    try {
      perf[key] = wrapped;
    } catch {
      try {
        Object.defineProperty(perf, key, {
          configurable: true,
          writable: true,
          value: wrapped,
        });
      } catch {
        // Ignore if non-configurable in a locked runtime
      }
    }
  };

  if (typeof perf.measure === 'function') {
    const originalMeasure = perf.measure.bind(perf);
    const safeMeasure = ((...args: Parameters<Performance['measure']>) => {
      try {
        return originalMeasure(...args);
      } catch {
        return undefined as unknown as PerformanceMeasure;
      }
    }) as Performance['measure'];
    installSafeMethod('measure', safeMeasure);
  }

  if (typeof perf.clearMeasures === 'function') {
    const originalClear = perf.clearMeasures.bind(perf);
    const safeClear = ((name?: string) => {
      try {
        originalClear(name);
      } catch {
        // Ignore invalid measure names
      }
    }) as Performance['clearMeasures'];
    installSafeMethod('clearMeasures', safeClear);
  }
}
