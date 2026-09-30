"use client";

import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/version";

/** Release notes open only from the version chip; unread notes get a dot
 * (see NOTES_READ_KEY). This last-seen stamp stays readable for compatibility
 * but opens no UI. */
const LAST_SEEN_KEY = "gtnh-factory-flow.last-seen-version.v1";

/**
 * The version this browser last stamped, or nothing if it never has.
 */
export function readLastSeenVersion(): string | undefined {
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
    // A blocked or full quota must never break the app.
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

/* ---------------------------------------------------------------------- */
/* The notes, and whether this reader has opened them.                     */
/* ---------------------------------------------------------------------- */

/**
 * The newest release whose NOTES this browser has actually opened.
 *
 * A separate stamp from `LAST_SEEN_KEY` on purpose: a stamp written on page
 * load would put the dot out on the very load that should raise it. This one
 * is written only by opening the notes.
 */
const NOTES_READ_KEY = "gtnh-factory-flow.changelog-read.v1";

function readNotesRead(): string | undefined {
  try {
    return window.localStorage.getItem(NOTES_READ_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeNotesRead(version: string): void {
  try {
    window.localStorage.setItem(NOTES_READ_KEY, version);
  } catch {
    // A blocked or full quota must never break the app; the dot just returns.
  }
}

/**
 * What has shipped since this browser last opened the notes, newest first.
 *
 * Empty on a FIRST visit, deliberately: a newcomer has no use for a history,
 * so the stamp is written silently and they see the next release's notes.
 */
export function unseenEntries(): ChangelogEntry[] {
  const read = readNotesRead();
  if (!read) {
    writeNotesRead(APP_VERSION);
    return [];
  }
  if (compareVersions(read, APP_VERSION) >= 0) {
    return [];
  }
  return CHANGELOG.filter(
    (entry) =>
      compareVersions(entry.version, read) > 0 &&
      compareVersions(entry.version, APP_VERSION) <= 0,
  );
}

/**
 * The stamp is browser-wide, so every reader in the page is notified when it
 * changes.
 */
const listeners = new Set<() => void>();

export function subscribeToNotesRead(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opening the notes IS reading them. */
export function markNotesReadAndNotify(version = APP_VERSION): void {
  writeNotesRead(version);
  for (const listener of [...listeners]) {
    listener();
  }
}
