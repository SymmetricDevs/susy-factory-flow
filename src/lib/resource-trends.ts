"use client";

import { useSyncExternalStore } from "react";
import type { ResourceBalance, ThroughputResult } from "./model/types";

/**
 * How every resource's balance has moved across your recent edits.
 *
 * The x axis is EDITS, not time: the question is which numbers an edit made
 * better or worse, and an untouched plan has nothing to record.
 *
 * The recorded number is `netPerSecond` (produced minus consumed): its
 * meaning survives a resource changing groups, and up is always better.
 *
 * Every resource is recorded, not only the starred ones, so starring
 * something mid-session shows the history it already has.
 */

/** One edit's worth of balances: ResourceKey to netPerSecond. */
export type TrendSample = Record<string, number>;

/** Roughly a session's worth of edits. Old samples fall off the left. */
export const TREND_HISTORY_LIMIT = 80;

let samples: TrendSample[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function sampleOf(resources: Record<string, ResourceBalance>): TrendSample {
  const sample: TrendSample = {};
  for (const balance of Object.values(resources)) {
    sample[balance.key] = balance.netPerSecond;
  }
  return sample;
}

/**
 * True when two samples say the same thing. Solves that move no numbers
 * (dragging or renaming a card, a recompute that is not an edit) add no
 * point to the chart.
 */
function sameSample(left: TrendSample, right: TrendSample): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of leftKeys) {
    const a = left[key];
    const b = right[key];
    // Absolute epsilon rather than relative: these are rates per second, and
    // solver float dust is orders of magnitude below any deliberate change.
    if (b === undefined || Math.abs(a - b) > 0.000001) {
      return false;
    }
  }
  return true;
}

/** Record one solve. No-ops when nothing moved. */
export function recordResourceTrend(result: ThroughputResult) {
  const next = sampleOf(result.resources);
  const previous = samples[samples.length - 1];
  if (previous && sameSample(previous, next)) {
    return;
  }

  samples = [...samples, next].slice(-TREND_HISTORY_LIMIT);
  emit();
}

/** Wipe the chart. Loading a different design starts a new story. */
export function resetResourceTrends() {
  if (samples.length === 0) {
    return;
  }
  samples = [];
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TrendSample[] {
  return samples;
}

/** The record as it stands, for callers outside React. */
export function getResourceTrends(): TrendSample[] {
  return samples;
}

const EMPTY: TrendSample[] = [];

function getServerSnapshot(): TrendSample[] {
  return EMPTY;
}

export function useResourceTrends(): TrendSample[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * One resource's line, as far back as the record goes.
 *
 * A resource absent from a sample reads as 0 rather than as a gap: it was
 * not in the plan at that edit.
 */
export function selectTrendSeries(history: TrendSample[], resourceKey: string): number[] {
  return history.map((sample) => sample[resourceKey] ?? 0);
}
