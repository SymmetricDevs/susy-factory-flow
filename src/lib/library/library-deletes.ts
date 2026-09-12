"use client";

/**
 * Deletions waiting to reach the account.
 *
 * A pull cannot see that a design is gone from the browser, so every local
 * delete is noted here and drained by the next push as a tombstone. Kept in
 * localStorage so a delete made just before the tab closed still reaches
 * the other devices. Its own module so the design store and the sync engine
 * can both import it without importing each other.
 */
const PENDING_DELETES_KEY = "gtnh-factory-flow.library-pending-deletes.v1";

export interface PendingDeletes {
  designs: string[];
  folders: string[];
}

export function readPendingDeletes(): PendingDeletes {
  try {
    const raw = window.localStorage.getItem(PENDING_DELETES_KEY);
    if (!raw) {
      return { designs: [], folders: [] };
    }
    const parsed = JSON.parse(raw) as Partial<PendingDeletes>;
    return {
      designs: Array.isArray(parsed.designs) ? parsed.designs.filter(isId) : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders.filter(isId) : [],
    };
  } catch {
    return { designs: [], folders: [] };
  }
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function writePendingDeletes(pending: PendingDeletes): void {
  try {
    if (pending.designs.length === 0 && pending.folders.length === 0) {
      window.localStorage.removeItem(PENDING_DELETES_KEY);
    } else {
      window.localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(pending));
    }
  } catch {
    // Without storage the delete reaches the account only if this tab lives
    // long enough to push it. Nothing else to do.
  }
}

const listeners = new Set<() => void>();

/** Called by the design store whenever it deletes for good. */
export function noteLibraryDeletion(kind: "design" | "folder", id: string): void {
  const pending = readPendingDeletes();
  const list = kind === "design" ? pending.designs : pending.folders;
  if (!list.includes(id)) {
    list.push(id);
    writePendingDeletes(pending);
  }
  for (const listener of listeners) {
    listener();
  }
}

/** Called by the sync once a tombstone has landed. */
export function forgetLibraryDeletion(kind: "design" | "folder", id: string): void {
  const pending = readPendingDeletes();
  if (kind === "design") {
    pending.designs = pending.designs.filter((entry) => entry !== id);
  } else {
    pending.folders = pending.folders.filter((entry) => entry !== id);
  }
  writePendingDeletes(pending);
}

export function subscribeToLibraryDeletions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
