"use client";

import { useEffect } from "react";
import { subscribeViewportAttributes } from "@/lib/compact-view";
import { restoreUiScale } from "@/lib/ui-scale";

/**
 * Keeps the interface size and the viewport attributes on <html> honest once
 * the app is running.
 *
 * The boot script in layout.tsx stamps `--ui-scale`, `data-compact` and
 * `data-snug` before first paint. From here on, compact-view.ts answers the
 * media queries live (window resizes, a changed size setting) and this
 * component is what keeps it subscribed; and, as with the font
 * (AppFontRestore), a back-forward-cache restore runs no script at all, so
 * the scale is re-stamped on pageshow too.
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
