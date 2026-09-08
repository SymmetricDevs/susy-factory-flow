"use client";

import { useSyncExternalStore } from "react";

/**
 * The public setups you bookmarked: a set of post ids kept in this
 * browser. The Saved shelf under Public setups lists them, and every
 * public tile wears a ribbon you can click to add or take one away.
 */
const SAVED_KEY = "gtnh-factory-flow.saved-setups.v1";

let saved: Set<string> | undefined;
let snapshot: string[] = [];
const listeners = new Set<() => void>();

function load(): Set<string> {
  if (saved) {
    return saved;
  }
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    saved = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    saved = new Set();
  }
  snapshot = [...saved];
  return saved;
}

function persist() {
  snapshot = [...load()];
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(snapshot));
  } catch {
    // Without storage the bookmarks last the session.
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY: string[] = [];

/** The saved post ids, newest bookmark last. */
export function useSavedSetups(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return snapshot;
    },
    () => EMPTY,
  );
}

export function isSetupSaved(planId: string): boolean {
  return load().has(planId);
}

export function toggleSavedSetup(planId: string): boolean {
  const set = load();
  if (set.has(planId)) {
    set.delete(planId);
  } else {
    set.add(planId);
  }
  persist();
  return set.has(planId);
}
