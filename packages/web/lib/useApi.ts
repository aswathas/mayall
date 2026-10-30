'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Small client-side data hook: fetch on mount, expose loading/error, and a
 * reload trigger. Aborts the in-flight request when the url changes or the
 * component unmounts so stale responses never overwrite fresh state.
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed (${response.status} ${response.statusText})`);
        }
        return (await response.json()) as T;
      })
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Unknown network error';
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}
