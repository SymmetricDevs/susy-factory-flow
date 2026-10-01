import { sectionHandleId, splitSectionHandleId } from "./shared-machine";
import type { FactoryEdge } from "./types";

/**
 * Collapses any handle id onto the index-less port id the node renders. A card
 * exposes ONE port row per resource per side, but handle ids come both ways:
 * `output:item:cobble` and, from auto-connect, imports and older saves, with a
 * trailing slot index (`output:item:cobble:0`). Both name the same row.
 *
 * Ids that don't parse (storage schemes, malformed) pass through untouched.
 */
export function canonicalizeResourceHandleId(handleId?: string | null): string | undefined {
  if (!handleId) {
    return undefined;
  }

  // A shared machine's section prefix (`r2:`) is part of the port's identity
  // - two sections may well carry the same resource - so it is kept and only
  // the handle behind it is collapsed.
  const { section, handleId: bare } = splitSectionHandleId(handleId);
  const [side, kind, encodedResourceId] = (bare ?? "").split(":");
  if (
    (side !== "input" && side !== "output") ||
    (kind !== "item" && kind !== "fluid") ||
    !encodedResourceId
  ) {
    return handleId;
  }

  return sectionHandleId(section, `${side}:${kind}:${encodedResourceId}`);
}

/**
 * Whether two edges are the same wire: the same resource, running between the
 * same two cards, landing on the same port ROW at each end.
 *
 * The row is the unit on purpose: a recipe with cobblestone in three output
 * slots draws one output row, so edges differing only in slot index are copies
 * of one line that would split the rate between them. Never compare raw
 * handle strings for this.
 */
export function isSameEdgeWire(left: FactoryEdge, right: FactoryEdge): boolean {
  return (
    left.source === right.source &&
    left.target === right.target &&
    left.resourceKind === right.resourceKind &&
    left.resourceId === right.resourceId &&
    canonicalizeResourceHandleId(left.sourceHandle) ===
      canonicalizeResourceHandleId(right.sourceHandle) &&
    canonicalizeResourceHandleId(left.targetHandle) ===
      canonicalizeResourceHandleId(right.targetHandle)
  );
}

/**
 * The wire in `edges` that `edge` would duplicate. Callers pass a candidate
 * that is not yet in the list, so this never matches an edge against itself.
 */
export function findDuplicateEdge(
  edges: readonly FactoryEdge[],
  edge: FactoryEdge,
): FactoryEdge | undefined {
  return edges.find((existing) => isSameEdgeWire(existing, edge));
}

/**
 * Drops every wire that another wire already draws, keeping the first of each.
 * Returns the input array itself when there is nothing to drop, so callers can
 * skip work on the overwhelmingly common clean case.
 */
export function dedupeEdgeWires(edges: FactoryEdge[]): FactoryEdge[] {
  const kept: FactoryEdge[] = [];
  for (const edge of edges) {
    if (!findDuplicateEdge(kept, edge)) {
      kept.push(edge);
    }
  }

  return kept.length === edges.length ? edges : kept;
}
