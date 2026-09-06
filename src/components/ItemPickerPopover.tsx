"use client";

import { Search, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DatasetResourceIndexEntry } from "@/lib/datasets/types";
import type { RecipeQueryRole } from "@/lib/datasets/recipe-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { POWER_EU_CLAUSE_ID, queryAsksForPower } from "@/lib/power/power-search";
import { machineArtPixels } from "./flow/MachinePicker";
import { ResourceIcon } from "./nei/ResourceIcon";

/**
 * The item picker behind the stencil's "+ takes" / "+ makes" keys: one
 * search box over a two-column list of dataset resources, first result on
 * Enter, a click anywhere else closes it. The recipe search opens it ABOVE
 * the stencil (the stencil sits at the bottom of the screen); the library
 * opens it BELOW its header keys. Same picker, one `placement`.
 */
export function ItemPickerPopover({
  role,
  placement = "above",
  onPick,
  onClose,
  searchPickerResources,
}: {
  role: RecipeQueryRole;
  placement?: "above" | "below";
  onPick: (entry: DatasetResourceIndexEntry, role: RecipeQueryRole) => void;
  onClose: () => void;
  searchPickerResources: (
    query: string,
    signal: AbortSignal,
  ) => Promise<DatasetResourceIndexEntry[]>;
}) {
  const [pickerQuery, setPickerQuery] = useState("");
  // Results remember the query they answer, so "loading" is simply
  // "the answer on screen is not for the query being asked".
  const [answer, setAnswer] = useState<{ query: string; entries: DatasetResourceIndexEntry[] }>();
  const debouncedQuery = useDebouncedValue(pickerQuery, 125);
  const asked = debouncedQuery.trim();
  const results = answer?.entries ?? [];
  const loading = answer?.query !== asked;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Centred under its key, then nudged back inside the window if that put
  // an edge off screen. Measured once it is on the page.
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || placement !== "below") {
      return;
    }
    const margin = 8;
    const rect = root.getBoundingClientRect();
    const overRight = rect.right - (window.innerWidth - margin);
    const overLeft = margin - rect.left;
    if (overRight > 0) {
      setShift((current) => current - overRight);
    } else if (overLeft > 0) {
      setShift((current) => current + overLeft);
    }
  }, [placement]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A click elsewhere closes the picker.
  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    searchPickerResources(asked, controller.signal)
      .then((entries) => setAnswer({ query: asked, entries }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setAnswer({ query: asked, entries: [] });
        }
      });
    return () => controller.abort();
  }, [asked, searchPickerResources]);

  // Power is not a dataset resource, but it IS something machines make: the
  // makes side offers it as a condition, and generators answer it.
  const displayResults: DatasetResourceIndexEntry[] =
    role === "makes" && queryAsksForPower(pickerQuery)
      ? [
          {
            kind: "fluid",
            id: POWER_EU_CLAUSE_ID,
            displayName: "Power (EU)",
            dominantColor: "#d99a2b",
          } as DatasetResourceIndexEntry,
          ...results,
        ]
      : results;

  return (
    <div
      ref={rootRef}
      style={placement === "below" ? { transform: `translateX(calc(-50% + ${shift}px))` } : undefined}
      // The items column's own dress (RecipeBrowser's search box and rows):
      // flat dark panel, 4px corners, neutral ink - not the canvas bevel.
      className={[
        "absolute z-20 w-full max-w-[calc(100vw-16px)] rounded-[6px] border border-neutral-700 bg-[#1b1e23] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] sm:w-[360px] sm:max-w-[360px]",
        placement === "above" ? "bottom-full left-1/2 mb-2 -translate-x-1/2" : "left-1/2 top-full mt-2",
      ].join(" ")}
    >
      <label className="flex h-9 items-center gap-2 rounded-[4px] border border-neutral-700 bg-[#17191d] px-2 text-sm text-neutral-200 shadow-[inset_1px_1px_0_rgba(255,255,255,0.08)] focus-within:border-cyan-600">
        <Search className="h-4 w-4 shrink-0 text-neutral-500" />
        <input
          ref={inputRef}
          value={pickerQuery}
          onChange={(event) => setPickerQuery(event.target.value)}
          placeholder={role === "takes" ? "Add an input..." : "Add an output..."}
          className="min-w-0 flex-1 bg-transparent text-neutral-200 outline-none placeholder:text-neutral-500"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
            if (event.key === "Enter" && displayResults[0]) {
              onPick(displayResults[0], role);
            }
          }}
        />
      </label>
      <div className="recipe-search-scroll mt-2 flex max-h-[420px] flex-col gap-px overflow-y-auto compact:max-h-[max(140px,calc(100vh-320px))]">
        {loading && displayResults.length === 0 ? (
          <div className="px-2 py-2 text-sm text-neutral-500">Searching...</div>
        ) : displayResults.length === 0 ? (
          <div className="px-2 py-2 text-sm text-neutral-500">No matching items.</div>
        ) : (
          displayResults.map((entry) => (
            <button
              key={`${entry.kind}:${entry.id}`}
              type="button"
              onClick={() => onPick(entry, role)}
              className="flex h-9 w-full shrink-0 items-center gap-2 rounded-[4px] px-2 text-left text-neutral-200 hover:bg-[#2a2d33]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden">
                {entry.id === POWER_EU_CLAUSE_ID ? (
                  <Zap className="h-4 w-4 fill-current text-amber-300" aria-hidden />
                ) : (
                  <ResourceIcon
                    resource={{ ...entry, amount: 1 }}
                    size="sm"
                    bare
                    showAmount={false}
                    tooltip={false}
                    className="!h-full !w-full"
                    iconPixelSize={machineArtPixels(24)}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{entry.displayName ?? entry.id}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
