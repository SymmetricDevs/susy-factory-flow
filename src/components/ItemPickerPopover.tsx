"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DatasetResourceIndexEntry } from "@/lib/datasets/types";
import type { RecipeQueryRole } from "@/lib/datasets/recipe-query";
import { ResourceIndexPane, type IndexedResource } from "./ResourceIndexPane";

/**
 * The item picker behind the stencil's "+ takes" / "+ makes" keys, the
 * library's filter and Pool's product drawer button: THE ITEM PANEL
 * (ResourceIndexPane - the items column's own search, filters, sort, paged
 * grid and recent shelf), in a popover, where a click on a tile picks it. A
 * click anywhere else closes it. The recipe search opens it ABOVE the
 * stencil (the stencil sits at the bottom of the screen); the library opens
 * it BELOW its header keys. Same picker, one `placement`.
 */
export function ItemPickerPopover({
  role,
  placement = "above",
  onPick,
  onClose,
}: {
  role: RecipeQueryRole;
  placement?: "above" | "below";
  onPick: (entry: DatasetResourceIndexEntry, role: RecipeQueryRole) => void;
  onClose: () => void;
  /** Kept for callers that still pass it; the pane queries the dataset itself. */
  searchPickerResources?: unknown;
}) {
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const pick = (resource: IndexedResource) => {
    onPick(
      {
        kind: resource.kind,
        id: resource.id,
        displayName: resource.displayName,
        iconPath: resource.iconPath,
        iconAtlas: resource.iconAtlas,
        dominantColor: resource.dominantColor,
        tooltip: resource.tooltip,
      } as DatasetResourceIndexEntry,
      role,
    );
  };

  return (
    <div
      ref={rootRef}
      style={placement === "below" ? { transform: `translateX(calc(-50% + ${shift}px))` } : undefined}
      // The items column's own shell: same ground, same border. Tall enough
      // for the paged grid to show a few rows; the pane sizes its page to it.
      className={[
        "absolute z-20 flex h-[min(560px,calc(100vh-120px))] w-full max-w-[calc(100vw-16px)] flex-col overflow-hidden border border-neutral-800 bg-[#25272c] text-neutral-100 shadow-[0_8px_24px_rgba(0,0,0,0.5)] sm:w-[380px] sm:max-w-[380px]",
        placement === "above" ? "bottom-full left-1/2 mb-2 -translate-x-1/2" : "left-1/2 top-full mt-2",
      ].join(" ")}
      data-item-picker={role}
    >
      <ResourceIndexPane
        search={search}
        onSearchChange={setSearch}
        onBrowse={pick}
        autoFocus
      />
    </div>
  );
}
