"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const FlashContext = createContext<((message: string) => void) | null>(null);

/** Show a short confirmation line, e.g. "Tall Pines Brewing: Scheduled with Carlos for Thursday". */
export function useFlash(): (message: string) => void {
  const flash = useContext(FlashContext);
  if (!flash) throw new Error("useFlash must be used inside <FlashProvider>");
  return flash;
}

/**
 * App-wide confirmation line after an action. It sits above everything, so it
 * still shows after the card or dialog it was about has gone.
 */
export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 5000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <FlashContext.Provider value={flash}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4"
      >
        {message && (
          <p className="pointer-events-auto max-w-md rounded-xl bg-stone-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
            {message}
          </p>
        )}
      </div>
    </FlashContext.Provider>
  );
}
