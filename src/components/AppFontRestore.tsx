"use client";

import { useEffect } from "react";
import { DEFAULT_APP_FONT, getStoredAppFont } from "@/lib/app-font";

/**
 * Re-stamps the saved font once the app is running.
 *
 * The boot script in layout.tsx stamps `data-app-font` before first paint,
 * and that is normally the end of it. Firefox users reported the page coming
 * back in Monocraft after a refresh while the settings dialog still showed
 * their choice (issue #47), which means the storage entry survived and the
 * attribute did not. Whatever takes it off the element between the boot
 * script and the app being usable, this puts it back: on mount, and again
 * when the browser restores the page from its back-forward cache, where no
 * script runs at all.
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
