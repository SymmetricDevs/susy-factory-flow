"use client";

import { useEffect } from "react";
import { DEFAULT_APP_FONT, getStoredAppFont } from "@/lib/app-font";

/**
 * Re-stamps the saved font once the app is running. The boot script in
 * layout.tsx stamps `data-app-font` before first paint, but the attribute can
 * be lost afterwards (seen in Firefox after a refresh) while storage keeps the
 * choice. This restores it on mount and on back-forward-cache restores, where
 * no script runs.
 */
export function AppFontRestore() {
  useEffect(() => {
    const restore = () => {
      const font = getStoredAppFont();
      const root = document.documentElement;
      if (font === DEFAULT_APP_FONT) {
        return;
      }
      if (root.getAttribute("data-app-font") !== font) {
        root.setAttribute("data-app-font", font);
      }
    };
    restore();
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return null;
}
