"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseDebouncedSearchResult<T> = {
  query: string;
  setQuery: (q: string) => void;
  results: T[];
  busy: boolean;
  open: boolean;
  setOpen: (b: boolean) => void;
  reset: () => void;
};

export function useDebouncedSearch<T>(
  fetcher: (q: string) => Promise<T[]>,
  opts: { debounceMs?: number } = {},
): UseDebouncedSearchResult<T> {
  const { debounceMs = 300 } = opts;
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const runFetch = useCallback((q: string) => {
    setBusy(true);
    fetcherRef
      .current(q)
      .then((r) => {
        setResults(r);
      })
      .catch(() => {
        setResults([]);
      })
      .finally(() => setBusy(false));
  }, []);

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      if (timer.current) clearTimeout(timer.current);
      const delay = debounceMs > 0 && q.trim() ? debounceMs : 0;
      timer.current = setTimeout(() => runFetch(q), delay);
    },
    [debounceMs, runFetch],
  );

  const reset = useCallback(() => {
    setQueryState("");
    setResults([]);
    setOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { query, setQuery, results, busy, open, setOpen, reset };
}
