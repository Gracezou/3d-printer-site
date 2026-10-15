'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, type SetStateAction } from 'react';

// Native history updates preserve the rendered list and Next's back/forward state.
export function useAdminQueryState<T extends string | number | boolean>(
  key: string,
  fallback: T,
) {
  const params = useSearchParams();
  const parse = useCallback(
    (raw: string | null): T => {
      if (raw === null) return fallback;
      if (typeof fallback === 'boolean') return (raw === 'true') as T;
      if (typeof fallback === 'number') {
        const value = Number(raw);
        return (
          Number.isSafeInteger(value) && value > 0 ? value : fallback
        ) as T;
      }
      return raw as T;
    },
    [fallback],
  );
  const value = parse(params.get(key));
  const setValue = useCallback(
    (action: SetStateAction<T>) => {
      const url = new URL(window.location.href);
      const current = parse(url.searchParams.get(key));
      const next = typeof action === 'function' ? action(current) : action;
      if (next === fallback || next === '') url.searchParams.delete(key);
      else url.searchParams.set(key, String(next));
      window.history.replaceState(
        null,
        '',
        url.pathname + url.search + url.hash,
      );
    },
    [fallback, key, parse],
  );
  return [value, setValue] as const;
}
