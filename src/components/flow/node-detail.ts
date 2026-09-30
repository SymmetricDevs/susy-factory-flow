/**
 * How much of the board is worth drawing at the current zoom.
 *
 * Zoomed out, a card's contents are noise, so past a threshold the board
 * switches to a glance view: machines show how hard they are running, buffers
 * show what is in them, and lines are just their routes.
 *
 * ONE level, held here, for nodes and edges alike: detail switching in pieces
 * reads as the board glitching.
 *
 * TUNING: the two numbers below are the whole control surface. They are a
 * pair because a single boundary flickers when the board is parked on it;
 * the gap is the dead zone. Keep it narrow, or regaining detail means zooming
 * noticeably further in than where it was lost.
 *
 * Nothing here may change a node's SIZE. Detail is dropped with `visibility`,
 * never `display`, so every element keeps its layout box: the router measures
 * node bounds and slot anchors through those boxes, and a card that changed
 * shape with zoom would reroute the board every time you scrolled the wheel —
 * exactly the viewport-dependent routing CLAUDE.md forbids.
 */

import { boardZoomScale } from "@/lib/ui-scale";

export const NODE_DETAIL_FULL = 0;
export const NODE_DETAIL_GLANCE = 1;

export type NodeDetailLevel = typeof NODE_DETAIL_FULL | typeof NODE_DETAIL_GLANCE;

/**
 * Below this the board drops to the glance view: roughly where a port row's
 * lettering falls under six screen pixels and the card stops being readable.
 */
export const NODE_GLANCE_ENTER_ZOOM = 0.45;
/** And above this it comes back. The gap is the anti-flicker dead zone. */
export const NODE_GLANCE_LEAVE_ZOOM = 0.5;

/**
 * The level for this zoom, given the level currently in force.
 *
 * Passing the current level is what makes the threshold hysteretic: the step is
 * only entered below `ENTER` and only left above `LEAVE`, so zoom noise around
 * the boundary cannot make the board strobe.
 */
export function getNodeDetailLevel(zoom: number, current: NodeDetailLevel): NodeDetailLevel {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return current;
  }
  // The thresholds are written for a 1:1 interface; the board's zoom carries
  // the interface size (ui-scale.ts), so the lettering falls under eight
  // pixels at 0.45 times that.
  const apparent = zoom / boardZoomScale();
  if (apparent < NODE_GLANCE_ENTER_ZOOM) {
    return NODE_DETAIL_GLANCE;
  }
  if (apparent >= NODE_GLANCE_LEAVE_ZOOM) {
    return NODE_DETAIL_FULL;
  }
  return current;
}

/*
 * The level itself, as a tiny external store.
 *
 * It cannot be derived inside a React Flow selector: hysteresis depends on the
 * PREVIOUS level, and a selector has to be a pure function of store state. So
 * one owner (NodeDetailController) computes it from the live transform and
 * publishes here, and everything that cares subscribes. Edges read it through
 * useSyncExternalStore, which re-renders them only when the level actually
 * flips rather than on every frame of a zoom gesture.
 */
let detailLevel: NodeDetailLevel = NODE_DETAIL_FULL;
const detailListeners = new Set<() => void>();

/**
 * The dev menu's "always glance" switch: the zoomed-out faces at EVERY zoom.
 * The controller keeps publishing the honest level underneath, so switching
 * it off lands straight back on what the current zoom deserves.
 */
const FORCE_GLANCE_KEY = "gtnh-factory-flow.dev.force-glance";

let forceGlance = readStoredForceGlance();

function readStoredForceGlance(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(FORCE_GLANCE_KEY) === "on";
  } catch {
    return false;
  }
}

export function isNodeDetailGlanceForced(): boolean {
  return forceGlance;
}

export function setNodeDetailGlanceForced(forced: boolean): void {
  if (forced === forceGlance) {
    return;
  }
  forceGlance = forced;
  try {
    if (forced) {
      window.localStorage.setItem(FORCE_GLANCE_KEY, "on");
    } else {
      window.localStorage.removeItem(FORCE_GLANCE_KEY);
    }
  } catch {
    // Session-only is fine.
  }
  for (const listener of detailListeners) {
    listener();
  }
}

export function setNodeDetailLevel(level: NodeDetailLevel) {
  if (level === detailLevel) {
    return;
  }
  detailLevel = level;
  if (forceGlance) {
    // Published output is pinned to glance; the honest level above still
    // updated, so lifting the pin lands on it.
    return;
  }
  for (const listener of detailListeners) {
    listener();
  }
}

export function getPublishedNodeDetailLevel(): NodeDetailLevel {
  return forceGlance ? NODE_DETAIL_GLANCE : detailLevel;
}

/** Server render has no viewport, so it always describes the full board. */
export function getServerNodeDetailLevel(): NodeDetailLevel {
  return NODE_DETAIL_FULL;
}

export function subscribeNodeDetailLevel(listener: () => void) {
  detailListeners.add(listener);
  return () => {
    detailListeners.delete(listener);
  };
}

/**
 * The board element carries the level as a data ATTRIBUTE, not a class: React
 * owns the board's `className` and rebuilds it on every render, which would
 * wipe an imperatively added class. React never touches an attribute it was
 * not given.
 */
export const NODE_DETAIL_ATTRIBUTE = "data-detail-level";

export function nodeDetailAttributeValue(level: NodeDetailLevel): string | undefined {
  return level === NODE_DETAIL_GLANCE ? "glance" : undefined;
}
