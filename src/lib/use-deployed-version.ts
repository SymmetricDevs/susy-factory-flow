"use client";

import { useEffect, useState } from "react";
import { compareVersions } from "@/lib/whats-new";
import { APP_VERSION } from "@/lib/version";

/** Quarter of an hour: often enough to catch a deploy, rare enough to ignore. */
const POLL_MS = 15 * 60 * 1000;

/**
 * The version the server is on, when it is NEWER than the one this page is
 * running. Undefined the rest of the time, which is almost always.
 *
 * A tab left open across a deploy keeps running the bundle it loaded; when
 * the server reports a newer version the app offers a reload.
 *
 * Polled on an interval AND whenever the tab returns to the front (the common
 * case is a tab left open for days, then clicked). A hidden tab never polls.
 */
export function useDeployedVersion(): string | undefined {
  const [newer, setNewer] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { version?: string };
        const deployed = body.version;
        if (!cancelled && deployed && compareVersions(deployed, APP_VERSION) > 0) {
          setNewer(deployed);
        }
      } catch {
        // Offline, or the endpoint is missing: stay quiet, this is a courtesy.
      }
    };

    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return newer;
}
