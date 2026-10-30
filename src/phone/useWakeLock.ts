import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Wake lock options for the HTML5 Screen Wake Lock API.
 */
export interface UseWakeLockOptions {
  /** Whether screen wake lock should be actively maintained (default: true) */
  enabled?: boolean;
  /** Callback invoked when wake lock is successfully granted */
  onRequestSuccess?: () => void;
  /** Callback invoked when requesting wake lock fails */
  onRequestError?: (err: Error) => void;
  /** Callback invoked when browser or OS releases the wake lock */
  onRelease?: () => void;
}

/**
 * Return type for the useWakeLock hook.
 */
export interface UseWakeLockResult {
  /** Whether Wake Lock API is supported in the current runtime environment */
  isSupported: boolean;
  /** Whether the screen wake lock is currently active */
  isActive: boolean;
  /** Last error encountered when requesting wake lock */
  error: Error | null;
  /** Manually request screen wake lock */
  request: () => Promise<boolean>;
  /** Manually release screen wake lock */
  release: () => Promise<void>;
  /** Toggle wake lock state */
  toggle: () => Promise<void>;
}

/**
 * HTML5 Screen Wake Lock hook.
 * Prevents mobile devices from sleeping during live voting/presentation sessions.
 * Automatically re-acquires the lock on document visibilitychange (e.g. app switching).
 */
export function useWakeLock(options: UseWakeLockOptions = {}): UseWakeLockResult {
  const { enabled = true, onRequestSuccess, onRequestError, onRelease } = options;

  // Initialize support flag directly during state creation
  const [isSupported] = useState<boolean>(() => {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  });

  const [isActive, setIsActive] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const sentinelRef = useRef<any>(null);

  // Release the active wake lock
  const release = useCallback(async () => {
    if (sentinelRef.current) {
      try {
        await sentinelRef.current.release();
      } catch {
        // Ignore errors during release
      }
      sentinelRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Request a new screen wake lock
  const request = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return false;
    }

    // Already active and holding valid sentinel
    if (sentinelRef.current && !sentinelRef.current.released) {
      return true;
    }

    try {
      const sentinel = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<any> } }).wakeLock.request("screen");
      sentinelRef.current = sentinel;
      setIsActive(true);
      setError(null);
      onRequestSuccess?.();

      sentinel.addEventListener("release", () => {
        sentinelRef.current = null;
        setIsActive(false);
        onRelease?.();
      });

      return true;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      setIsActive(false);
      onRequestError?.(errorObj);
      return false;
    }
  }, [onRequestSuccess, onRequestError, onRelease]);

  // Toggle between active and released states
  const toggle = useCallback(async () => {
    if (isActive) {
      await release();
    } else {
      await request();
    }
  }, [isActive, release, request]);

  // Sync with enabled property
  useEffect(() => {
    let cancelled = false;

    if (enabled && isSupported) {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        (navigator as unknown as { wakeLock: { request: (t: string) => Promise<any> } }).wakeLock
          .request("screen")
          .then((sentinel: any) => {
            if (cancelled) {
              void sentinel.release();
              return;
            }
            sentinelRef.current = sentinel;
            setIsActive(true);
            setError(null);
            onRequestSuccess?.();

            sentinel.addEventListener("release", () => {
              sentinelRef.current = null;
              setIsActive(false);
              onRelease?.();
            });
          })
          .catch((err: any) => {
            if (!cancelled) {
              const errorObj = err instanceof Error ? err : new Error(String(err));
              setError(errorObj);
              setIsActive(false);
              onRequestError?.(errorObj);
            }
          });
      }
    } else if (!enabled && sentinelRef.current) {
      void release();
    }

    return () => {
      cancelled = true;
      if (sentinelRef.current) {
        void sentinelRef.current.release();
        sentinelRef.current = null;
      }
    };
  }, [enabled, isSupported, release, onRequestSuccess, onRequestError, onRelease]);

  // Automatically re-request wake lock when document becomes visible again
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        enabled &&
        isSupported &&
        (!sentinelRef.current || sentinelRef.current.released)
      ) {
        await request();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, isSupported, request]);

  return {
    isSupported,
    isActive,
    error,
    request,
    release,
    toggle,
  };
}
