"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseDebouncedSearchResult<T> = {
  query: string;
  setQuery: (q: string) => void;
  results: readonly T[];
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
  const [results, setResults] = useState<readonly T[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetcherRef = useRef(fetcher);
  const reqIdRef = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const runFetch = useCallback((q: string) => {
    const id = ++reqIdRef.current;
    setBusy(true);
    fetcherRef
      .current(q)
      .then((r) => {
        if (id === reqIdRef.current) setResults(r);
      })
      .catch(() => {
        if (id === reqIdRef.current) setResults([]);
      })
      .finally(() => {
        if (id === reqIdRef.current) setBusy(false);
      });
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
    reqIdRef.current++;
    setQueryState("");
    setResults([]);
    setOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      reqIdRef.current++;
    };
  }, []);

  return { query, setQuery, results, busy, open, setOpen, reset };
}
