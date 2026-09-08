"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_DATASET_MANIFEST_URL } from "@/lib/datasets";
import {
  queryRecipeDatasetResources,
  type RecipeDatasetResourceQueryResult,
} from "@/lib/datasets/browser-loader";
import type { EntryIcon, PlanResourceStat } from "@/lib/community/types";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useFactoryStore } from "@/store/factory-store";
import { ResourceIcon } from "./nei/ResourceIcon";

const PICKER_PAGE = 60;

/**
 * The obvious candidates for an entry's face: what it makes, then what it
 * eats — shown at the top of the picker before any searching happens.
 */
export function iconSuggestionsFromStats(
  needs: PlanResourceStat[] | undefined,
  outputs: PlanResourceStat[] | undefined,
): EntryIcon[] {
  const seen = new Set<string>();
  const suggestions: EntryIcon[] = [];
  for (const stat of [...(outputs ?? []), ...(needs ?? [])]) {
    const key = `${stat.kind}:${stat.resourceId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push({
      kind: stat.kind,
      resourceId: stat.resourceId,
      displayName: stat.displayName,
      iconPath: stat.iconPath,
      iconAtlas: stat.iconAtlas,
      dominantColor: stat.dominantColor,
    });
    if (suggestions.length >= 16) {
      break;
    }
  }
  return suggestions;
}

/**
 * The one-item face chooser: search the dataset the same way the item
 * browser does, click an icon, done. A small modal so it works from
 * dialogs and list rows alike.
 */
export function IconPicker({
  title = "Pick an icon",
  suggestions,
  onPick,
  onClear,
  onClose,
}: {
  title?: string;
  /** The build's own ins and outs — the likely faces, offered up top. */
  suggestions?: EntryIcon[];
  onPick: (icon: EntryIcon) => void;
  /** Present when the caller already has an icon that can be removed. */
  onClear?: () => void;
  onClose: () => void;
}) {
  const datasetManifest = useFactoryStore((state) => state.datasetManifest);
  const datasetManifestUrl = useFactoryStore((state) => state.datasetManifestUrl);
  const selectedDatasetVersionId = useFactoryStore((state) => state.selectedDatasetVersionId);
  const version = datasetManifest?.versions.find(
    (entry) => entry.id === selectedDatasetVersionId,
  );

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const [result, setResult] = useState<RecipeDatasetResourceQueryResult>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!version) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    queryRecipeDatasetResources(
      datasetManifestUrl ?? DEFAULT_DATASET_MANIFEST_URL,
      version,
      { query: debouncedQuery.trim(), offset: 0, limit: PICKER_PAGE, sort: "relevance" },
      { signal: controller.signal },
    )
      .then((response) => {
        if (!cancelled) {
          setError(undefined);
          setResult(response);
        }
      })
      .catch((queryError: unknown) => {
        if (!cancelled && (queryError as Error)?.name !== "AbortError") {
          setError(queryError instanceof Error ? queryError.message : "Search failed.");
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [datasetManifestUrl, debouncedQuery, version]);

  // Aspects have icons too, but they aren't things a factory makes.
  const resources = (result?.resources ?? []).filter((entry) => entry.kind !== "aspect");

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-neutral-950/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(70*var(--ui-vh))] w-full max-w-sm flex-col rounded-[6px] border border-neutral-600 bg-[#25272c] p-3 text-neutral-100 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close icon picker"
            className="rounded p-1 text-neutral-400 hover:text-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="flex h-9 shrink-0 items-center gap-2 rounded-[4px] border border-neutral-700 bg-[#17191d] px-2 text-sm shadow-[inset_1px_1px_0_rgba(255,255,255,0.08)]">
          <Search className="h-4 w-4 text-neutral-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search item or fluid..."
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {error ? <p className="mt-2 text-[11px] text-red-400">{error}</p> : null}
        {suggestions && suggestions.length > 0 ? (
          <div className="mt-2 shrink-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
              From this build
            </p>
            <div className="flex flex-wrap gap-1">
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.kind}:${suggestion.resourceId}`}
                  type="button"
                  onClick={() => onPick(suggestion)}
                  title={suggestion.displayName ?? suggestion.resourceId}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[4px] border border-neutral-600 bg-[#17191d] hover:border-cyan-500"
                >
                  <ResourceIcon
                    resource={{
                      id: suggestion.resourceId,
                      kind: suggestion.kind,
                      amount: 1,
                      displayName: suggestion.displayName,
                      iconPath: suggestion.iconPath,
                      iconAtlas: suggestion.iconAtlas,
                      dominantColor: suggestion.dominantColor,
                    }}
                    bare
                    tooltip={false}
                    showAmount={false}
                    className="!h-full !w-full"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {!version ? (
            <p className="pt-1 text-[11px] text-neutral-500">The dataset is still loading…</p>
          ) : resources.length === 0 ? (
            <p className="pt-1 text-[11px] text-neutral-500">
              {result ? "Nothing matches." : "Searching…"}
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-1">
              {resources.map((entry) => (
                <button
                  key={`${entry.kind}:${entry.id}`}
                  type="button"
                  onClick={() =>
                    onPick({
                      kind: entry.kind as EntryIcon["kind"],
                      resourceId: entry.id,
                      displayName: entry.displayName,
                      iconPath: entry.iconPath,
                      iconAtlas: entry.iconAtlas,
                      dominantColor: entry.dominantColor,
                    })
                  }
                  title={entry.displayName ?? entry.id}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[4px] border border-neutral-700 bg-[#17191d] hover:border-cyan-500"
                >
                  <ResourceIcon
                    resource={{
                      id: entry.id,
                      kind: entry.kind as "item" | "fluid",
                      amount: 1,
                      displayName: entry.displayName,
                      iconPath: entry.iconPath,
                      iconAtlas: entry.iconAtlas,
                      dominantColor: entry.dominantColor,
                    }}
                    bare
                    tooltip={false}
                    showAmount={false}
                    className="!h-full !w-full"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="mt-2 h-7 shrink-0 rounded-[4px] border border-neutral-700 bg-[#17191d] text-[11px] text-neutral-400 hover:border-red-500 hover:text-red-400"
          >
            Remove the current icon
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The icon slot lists and dialogs share: shows the picked face, or a
 * dashed empty square as the "pick one" affordance when editable.
 */
export function EntryIconSlot({
  icon,
  editable,
  onEdit,
  className,
}: {
  icon?: EntryIcon;
  editable?: boolean;
  onEdit?: () => void;
  className?: string;
}) {
  // Fills the slot: the padded source art is drawn at 200% and cropped by
  // the wrapper, so the sprite lands at roughly the slot's own size.
  const face = icon ? (
    <ResourceIcon
      resource={{
        id: icon.resourceId,
        kind: icon.kind,
        amount: 1,
        displayName: icon.displayName,
        iconPath: icon.iconPath,
        iconAtlas: icon.iconAtlas,
        dominantColor: icon.dominantColor,
      }}
      bare
      tooltip={false}
      showAmount={false}
      className="!h-full !w-full"
    />
  ) : null;

  if (!editable) {
    // Read-only rows without an icon give the space back to the name.
    if (!icon) {
      return null;
    }
    return (
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden",
          className ?? "",
        ].join(" ")}
      >
        {face}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={icon ? "Change the icon" : "Pick an icon"}
      className={[
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[4px] border",
        icon
          ? "border-transparent hover:border-cyan-600"
          : "border-dashed border-neutral-600 text-neutral-600 hover:border-cyan-600 hover:text-cyan-400",
        className ?? "",
      ].join(" ")}
    >
      {face ?? <span className="text-[10px] leading-none">+</span>}
    </button>
  );
}
