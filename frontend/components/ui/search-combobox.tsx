"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";

export type SearchComboboxVariant = "plain" | "list";

type CommonProps<T> = {
  value: string;
  onSelect: (item: T) => void;
  fetcher: (q: string) => Promise<T[]>;
  getItemKey: (item: T) => string | number;
  getItemLabel: (item: T) => string;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  debounceMs?: number;
  className?: string;
};

type PlainProps<T> = CommonProps<T> & {
  variant?: "plain";
  renderItem: (item: T) => React.ReactNode;
};

type ListProps<T> = CommonProps<T> & {
  variant: "list";
  itemIdOf: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
};

export type SearchComboboxProps<T> = PlainProps<T> | ListProps<T>;

// Bug-1 fix: pointerdown on document closes the dropdown UNLESS the click was
// inside the combobox root. The old `setTimeout(setOpen(false), 150)` race
// against onMouseDown is gone.
function useOutsidePointerDown(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
) {
  React.useEffect(() => {
    function handler(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && ref.current && !ref.current.contains(target)) {
        onOutside();
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [ref, onOutside]);
}

export function SearchCombobox<T>(props: SearchComboboxProps<T>) {
  const {
    value,
    onSelect,
    fetcher,
    getItemKey,
    getItemLabel,
    placeholder,
    disabled,
    emptyText = "No results",
    debounceMs,
    className,
  } = props;
  const { query, setQuery, results, busy, open, setOpen } = useDebouncedSearch<T>(fetcher, { debounceMs });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listboxId = React.useId();
  useOutsidePointerDown(rootRef, () => setOpen(false));

  // Sync the hook's query from the parent's controlled value when the parent
  // updates it programmatically (e.g. setLinkedPrLabel after async prefill).
  // For the plain variant, `value` is the displayed label, so this keeps the
  // input in sync. For the list variant, `value` is the selected id — we
  // display `query` directly, so don't overwrite it with the id.
  React.useEffect(() => {
    if (props.variant !== "list") setQuery(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, props.variant]);

  const handleSelect = React.useCallback(
    (item: T) => {
      onSelect(item);
      setQuery(getItemLabel(item));
      setOpen(false);
    },
    [onSelect, getItemLabel, setQuery, setOpen],
  );

  if (props.variant === "list") {
    return (
      <div ref={rootRef} className={cn("relative", className)}>
        <Combobox
          value={value}
          onValueChange={(v: unknown) => {
            const id = v as string;
            const found = results.find((r) => String(props.itemIdOf(r)) === id);
            if (found) handleSelect(found);
          }}
        >
          <ComboboxInput
            placeholder={placeholder}
            disabled={disabled}
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              if (!query) setQuery("");
            }}
            className="w-full"
          />
          <ComboboxContent>
            <ComboboxList>
              {busy && results.length === 0 && (
                <div className="py-2 px-3 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Searching…
                </div>
              )}
              {!busy && results.length === 0 && open && (
                <div className="py-2 px-3 text-xs text-muted-foreground">{emptyText}</div>
              )}
              {results.map((item) => (
                <ComboboxItem key={String(getItemKey(item))} value={String(props.itemIdOf(item))}>
                  {props.renderItem(item)}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-autocomplete="list"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          if (!query) setQuery("");
        }}
      />
      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-md overflow-hidden"
        >
          {busy && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            results.map((item) => (
              <button
                key={String(getItemKey(item))}
                type="button"
                role="option"
                aria-selected={false}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(item)}
              >
                {props.renderItem(item)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
