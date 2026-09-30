"use client";

import { useEffect } from "react";
import { subscribeViewportAttributes } from "@/lib/compact-view";
import { restoreUiScale } from "@/lib/ui-scale";

/**
 * Keeps the interface size and viewport attributes on <html> current after
 * the boot script in layout.tsx stamps `--ui-scale`, `data-compact` and
 * `data-snug`. Keeps compact-view.ts subscribed to its live media queries,
 * and re-stamps on pageshow because a back-forward-cache restore runs no
 * script (as with AppFontRestore).
 */
export function UiScaleRestore() {
  useEffect(() => {
    restoreUiScale();
    const unsubscribe = subscribeViewportAttributes();
    const restore = () => {
      restoreUiScale();
    };
    window.addEventListener("pageshow", restore);
    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  return null;
}
