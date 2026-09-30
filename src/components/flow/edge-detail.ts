import { NODE_DETAIL_FULL, NODE_DETAIL_GLANCE, type NodeDetailLevel } from "./node-detail";

/**
 * Edge detail, encoded as a bitmask.
 *
 * Edges must never subscribe to the raw `transform[2]` scalar: that re-renders
 * every visible edge on every frame of a zoom gesture, and each re-render
 * re-runs the route solver. They read a level that only changes when the board
 * actually crosses its threshold.
 */

/**
 * What a line draws, as a bitmask. No thresholds of its own: edges and nodes
 * both read the single level in node-detail.ts, so all detail switches at
 * once, in both directions, at the same zoom (detail arriving in pieces reads
 * as the board glitching).
 */
export const EDGE_DETAIL_GLOBAL = 1;
export const EDGE_DETAIL_ARROWS = 2;
export const EDGE_DETAIL_LABELS = 4;
export const EDGE_DETAIL_PULSE = 8;

/**
 * At a glance, a line is its route and its ARROWS: no rate chip, no marching
 * dashes, no hover surface, each a per-edge cost paid hundreds of times over
 * for something a few pixels tall. The arrows stay, drawn twice their size so
 * they read at glance zoom.
 */
export const EDGE_DETAIL_BY_LEVEL: Record<NodeDetailLevel, number> = {
  [NODE_DETAIL_FULL]: EDGE_DETAIL_ARROWS | EDGE_DETAIL_LABELS | EDGE_DETAIL_PULSE,
  [NODE_DETAIL_GLANCE]: EDGE_DETAIL_GLOBAL | EDGE_DETAIL_ARROWS,
};

/**
 * A table rather than a function on purpose: calling an imported function
 * here makes the React Compiler give up memoizing ResourceEdgeComponent
 * ("Existing memoization could not be preserved"); a property read does not.
 */
export function edgeDetailForLevel(level: NodeDetailLevel): number {
  return EDGE_DETAIL_BY_LEVEL[level];
}

export function hasEdgeDetail(detailLevel: number, flag: number) {
  return (detailLevel & flag) !== 0;
}

/**
 * Returns the cached object when every field still points at the same value.
 *
 * React Flow node `data` is rebuilt whenever anything on the board changes —
 * a hover, a solver run — and a fresh object identity defeats the `memo` on the
 * node components, re-rendering every node for a change affecting one. Handing
 * back the previous object when nothing in it moved keeps those memos effective.
 *
 * The result is always derived purely from `next`, so returning either identity
 * is equally correct; only the reference differs.
 */
export function reuseObjectIdentity<T extends Record<string, unknown>>(
  cache: Map<string, T>,
  id: string,
  next: T,
): T {
  const previous = cache.get(id);
  if (previous) {
    const keys = Object.keys(next);
    if (
      keys.length === Object.keys(previous).length &&
      keys.every((key) => previous[key] === next[key])
    ) {
      return previous;
    }
  }

  cache.set(id, next);
  return next;
}

function deepEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => deepEquals(entry, right[index]))
    );
  }

  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null ||
    Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)
  ) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) =>
      deepEquals((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
}

/**
 * `reuseObjectIdentity` for objects whose fields are themselves rebuilt every
 * pass. Edge objects nest fresh `data`/`style`/`resource` objects on each
 * rebuild, so shallow comparison never matches; structural equality is what
 * decides whether the previous identity can stand in. Same purity argument as
 * above: both identities carry equal values, only the reference differs.
 */
export function reuseDeepObjectIdentity<T extends Record<string, unknown>>(
  cache: Map<string, T>,
  id: string,
  next: T,
): T {
  const previous = cache.get(id);
  if (previous && deepEquals(previous, next)) {
    return previous;
  }

  cache.set(id, next);
  return next;
}
