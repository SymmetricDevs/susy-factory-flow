/**
 * Pure geometry for how edges are drawn: which parallel run each one takes,
 * and how thick its casing is. A function of its arguments only, so it tests
 * without React Flow, a DOM or a board. Routing lives elsewhere; this is only
 * what gets painted once a route exists.
 */

/**
 * Outer width of the dark rim drawn under every line: proportional to the
 * core so a crossing of two fat pipes stays visibly separated, with a 2px
 * floor for thin wires.
 */
export function edgeCasingWidth(coreWidth: number): number {
  return coreWidth + Math.max(2, coreWidth * 0.22);
}

export interface EdgeDepth {
  /** The line's published stroke width. */
  width: number;
  /** Its index in project edge order — the stable tiebreak. */
  routeIndex: number;
}

/**
 * Back-to-front order for lines that share pixels. Sorted with this, the line
 * on TOP sorts last, and that same line must be the one that hops (when paint
 * order and hop precedence disagree, a hop arcs under a line painted over it).
 *
 * Thinner lines go on top and do the hopping: a thin line survives being
 * drawn over a fat pipe but vanishes under one, and a small bump on a thin
 * line reads instantly where a fat pipe rearing up is a blob. Equal widths
 * fall back to routeIndex.
 */
export function compareEdgeDepth(left: EdgeDepth, right: EdgeDepth): number {
  if (left.width !== right.width) {
    return right.width - left.width;
  }
  return left.routeIndex - right.routeIndex;
}

/**
 * Lanes beyond this wrap. Every finite cap collides eventually; this one is
 * chosen so the worst case is a node with more than six wires on one face,
 * where the corridor is already the problem.
 */
export const EDGE_LANE_CAP = 6;

/**
 * Assigns each edge a parallel run so that no two edges leaving the same
 * node, or arriving at the same node, share one: greedy colouring over that
 * conflict relation. Edges that merely cross the same empty space are not
 * conflicts here; that is a corridor problem for the router.
 *
 * Deterministic: iteration follows the given edge order, and the result does
 * not depend on solver output, so a throughput change never reshuffles lanes
 * or invalidates a route.
 */
export function assignEdgeLanes(
  edges: ReadonlyArray<{ id: string; source: string; target: string }>,
): Map<string, number> {
  const laneByEdgeId = new Map<string, number>();
  const usedBySource = new Map<string, Set<number>>();
  const usedByTarget = new Map<string, Set<number>>();

  for (const edge of edges) {
    let sourceUsed = usedBySource.get(edge.source);
    if (!sourceUsed) {
      sourceUsed = new Set<number>();
      usedBySource.set(edge.source, sourceUsed);
    }
    let targetUsed = usedByTarget.get(edge.target);
    if (!targetUsed) {
      targetUsed = new Set<number>();
      usedByTarget.set(edge.target, targetUsed);
    }

    let lane = 0;
    while (sourceUsed.has(lane) || targetUsed.has(lane)) {
      lane += 1;
    }
    sourceUsed.add(lane);
    targetUsed.add(lane);
    // The conflict sets keep the UNWRAPPED lane so the search keeps climbing;
    // only the offset that gets drawn wraps.
    laneByEdgeId.set(edge.id, lane % EDGE_LANE_CAP);
  }

  return laneByEdgeId;
}
