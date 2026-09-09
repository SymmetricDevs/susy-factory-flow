"use client";

import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";

/**
 * Noticing that the app changed under you.
 *
 * Two different situations, and they want two different answers:
 *
 * - you were away and it shipped while you were gone. The code running is the
 *   new code, so the only question is what you have already seen. That is a
 *   version stamped in localStorage, and the answer is a DOT on the header's
 *   version chip, which opens the notes. Nothing pops up by itself: the
 *   arriving popup, its close guard, the settings mute for it and the
 *   "show to everyone" record that fed it were all removed (Jack, 2026-09-08).
 * - you had the tab open and it shipped. The code running is the OLD code and
 *   cannot become the new one on its own, so the honest thing is to say a new
 *   version exists and offer a reload. `useDeployedVersion` asks the server.
 *
 * The stamp is written when the notes are OPENED from the chip.
 */
const LAST_SEEN_KEY = "gtnh-factory-flow.last-seen-version.v1";

function readLastSeen(): string | undefined {
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function markVersionSeen(version = APP_VERSION): void {
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // A blocked or full quota must never break the app. The cost is the dot
    // staying lit, which is the harmless direction to fail in.
  }
}

/** Newest-first compare of two `1.2.3` strings. */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * What has shipped since this browser last looked, or an empty list.
 *
 * Empty on a FIRST visit, deliberately. Somebody arriving for the first time
 * has no idea what any of it used to do, so a list of changes is noise in
 * front of the thing they came to see - the stamp is written silently instead
 * and they hear about the next release like everyone else.
 */
export function unseenEntries(): ChangelogEntry[] {
  const lastSeen = readLastSeen();
  if (!lastSeen) {
    markVersionSeen();
    return [];
  }
  if (compareVersions(lastSeen, APP_VERSION) >= 0) {
    return [];
  }
  return CHANGELOG.filter(
    (entry) =>
      compareVersions(entry.version, lastSeen) > 0 &&
      compareVersions(entry.version, APP_VERSION) <= 0,
  );
}

/**
 * A version stamp is browser-wide, so the header button and anything else
 * reading it have to agree about it within the same page. Nothing here is
 * worth a store; it is one string and two readers.
 */
const listeners = new Set<() => void>();

export function subscribeToVersionSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markVersionSeenAndNotify(): void {
  markVersionSeen();
  for (const listener of [...listeners]) {
    listener();
  }
}
