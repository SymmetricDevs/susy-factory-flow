/**
 * The marching dashes, drawn on one canvas above the edge layer instead of
 * as per-edge SVG paths: an animated `stroke-dashoffset` is a paint property
 * that cannot be composited, so it re-rasters every line on the board every
 * frame. Geometry is the edges' own path strings handed to `Path2D`; stroke
 * widths, dash lengths and speeds are the SVG's numbers.
 *
 * Everything here is pure module state in FLOW coordinates, the same
 * discipline the routing caches follow: nothing depends on zoom or pan.
 */

import type {
  EdgePulseFrameSpec,
  ExportOcclusionDot,
} from "@/lib/import-export/plan-image";

export interface EdgePulseSpec {
  /** The edge's route, exactly as the SVG draws it (hops included). */
  path: string;
  /** Stroke width of the dash overlay, in flow units. */
  width: number;
  dash: number;
  gap: number;
  /** Flow pixels per second the dashes travel. */
  velocity: number;
  /** Route bounding box, for viewport culling. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /**
   * A mid-morph path: one frame of a wire gliding to its new route. Kept out
   * of the Path2D cache — every frame of every morphing edge is a fresh
   * string, and caching them would churn the cache straight past its ceiling.
   */
  transient?: boolean;
}

interface CompiledPulse extends EdgePulseSpec {
  path2d: Path2D | undefined;
  /**
   * A fixed phase offset derived from the edge id, so lines of the same speed
   * do not march in lockstep (one marching column reads as a light show, not
   * flow). Stable across rerenders and reloads.
   */
  phase: number;
  /**
   * The speed the dashes are ACTUALLY moving at, chasing `velocity`. When the
   * board's value motion is on, a solver change swings `velocity` in one
   * step and this eases after it, so the flow reads as speeding up rather
   * than as a different animation being swapped in.
   */
  liveVelocity: number;
  /**
   * Distance marched so far, in flow px. Integrating it (rather than deriving
   * it from absolute time x velocity) keeps the dashes continuous when the
   * speed changes.
   */
  travel: number;
}

const pulses = new Map<string, CompiledPulse>();
/** Path2D is not free to build; route strings repeat across frames. */
const path2dCache = new Map<string, Path2D>();

function hashPhase(edgeId: string) {
  let hash = 0;
  for (let index = 0; index < edgeId.length; index += 1) {
    hash = (hash * 31 + edgeId.charCodeAt(index)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

function compilePath(path: string, transient?: boolean): Path2D | undefined {
  if (!path) {
    return undefined;
  }
  const cached = path2dCache.get(path);
  if (cached) {
    return cached;
  }
  // A malformed `d` throws in some engines; a missing pulse beats a dead frame.
  try {
    const compiled = new Path2D(path);
    if (!transient) {
      // Routes churn while dragging; without a ceiling this grows unbounded.
      if (path2dCache.size > 4000) {
        path2dCache.clear();
      }
      path2dCache.set(path, compiled);
    }
    return compiled;
  } catch {
    return undefined;
  }
}

export function publishEdgePulse(edgeId: string, spec: EdgePulseSpec) {
  const existing = pulses.get(edgeId);
  if (
    existing &&
    existing.path === spec.path &&
    existing.width === spec.width &&
    existing.dash === spec.dash &&
    existing.gap === spec.gap &&
    existing.velocity === spec.velocity
  ) {
    return;
  }

  pulses.set(edgeId, {
    ...spec,
    path2d: compilePath(spec.path, spec.transient),
    phase: existing?.phase ?? hashPhase(edgeId),
    // The march continues from wherever it was: a new route or a new speed
    // target must not reset how far the dashes have walked.
    liveVelocity: existing?.liveVelocity ?? spec.velocity,
    travel: existing?.travel ?? 0,
  });
}

export function retractEdgePulse(edgeId: string) {
  pulses.delete(edgeId);
}

/**
 * The marching dashes as data, for rendering outside the live canvas — the
 * export dialog replays these into GIF frames. Geometry and speeds are copied
 * out so the export can quantise velocities for a seamless loop without
 * touching the live march. Taken while the export render is up, because a
 * culled edge has no pulse to copy.
 */
export function snapshotEdgePulses(): EdgePulseFrameSpec[] {
  return [...pulses.values()].map((pulse) => ({
    path: pulse.path,
    width: pulse.width,
    dash: pulse.dash,
    gap: pulse.gap,
    velocity: pulse.velocity,
    phase: pulse.phase,
  }));
}

/** The rate-chip boxes, as plain rects for the export's own eraser. */
export function snapshotEdgeLabelBoxes(): Array<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}> {
  return [...labelBoxes.values()].map((box) => ({
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  }));
}

/** Every pinned waypoint dot the dashes must not march over. */
export function snapshotEdgeWaypointDots(): ExportOcclusionDot[] {
  return [...waypointDots.values()].flat().map((dot) => ({ x: dot.x, y: dot.y, r: dot.r }));
}

/**
 * Where each edge's rate chip sits, in flow units.
 *
 * The canvas sits at the very TOP of the paint order, because anything drawn
 * above a composited layer must be composited too, and hundreds of node and
 * label layers are expensive to layerize every frame. So instead of stacking
 * the dashes under the chips and cards, the canvas punches those rectangles
 * back out after drawing, keeping the layer tree to a handful.
 */
export interface EdgeLabelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const labelBoxes = new Map<string, EdgeLabelBox>();

interface EdgeWaypointDot {
  x: number;
  y: number;
  r: number;
}

const waypointDots = new Map<string, EdgeWaypointDot[]>();

/** The dot circles the dash canvas must not paint over, per edge. */
export function publishEdgeWaypointDots(edgeId: string, dots: EdgeWaypointDot[]) {
  const existing = waypointDots.get(edgeId);
  if (
    existing &&
    existing.length === dots.length &&
    existing.every(
      (dot, index) =>
        dot.x === dots[index].x && dot.y === dots[index].y && dot.r === dots[index].r,
    )
  ) {
    return;
  }
  waypointDots.set(edgeId, dots);
}

export function retractEdgeWaypointDots(edgeId: string) {
  waypointDots.delete(edgeId);
}

/** Colour and cap match the SVG overlay this replaces, exactly. */
export const PULSE_STROKE = "rgba(255,255,255,0.92)";
