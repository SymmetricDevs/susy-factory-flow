"use client";

import { useSyncExternalStore } from "react";

import type { FactoryEdge } from "@/lib/model/types";
import { inkFor } from "./node-colors";

/**
 * How far every node is from the one under the cursor, in wires.
 *
 * At glance zoom, hovering a card turns the board into a distance map: the
 * hovered node is the hub, nodes one wire away take the first colour of the
 * ramp, two wires the next, and so on; anything the hub cannot reach goes
 * grey. Distance is UNDIRECTED: a node feeding the hub is as near as one the
 * hub feeds.
 *
 * Cost rules:
 * - NOTHING RE-RENDERS. Colours are written straight onto each mounted node
 *   element as two custom properties, and CSS in globals.css paints the
 *   glance layer from them. A per-card React subscription would reconcile
 *   every card per hovered node; src/components/flow/CLAUDE.md's rule is that hover must
 *   not rebuild the board. The one React subscriber is the legend.
 * - The map waits for the pointer to SETTLE, so sweeping across a dozen
 *   cards paints once, not a dozen times.
 * - It exists only at the glance zoom step; NodeDetailController clears it
 *   on the way back to full detail, where cards show their real contents.
 */

/**
 * The ramp: one colour fading to one other, so distance reads as one
 * continuous quantity rather than as categories (a multi-stop rainbow has
 * seams between adjacent rings). Hot amber at the hub, deep crimson at the
 * far end.
 *
 * Mixed in HSL, not RGB: straight RGB between bright amber and dark crimson
 * goes muddy in the middle. The far hue is negative on purpose so it winds
 * down through orange and red, not the long way through green.
 */
const HOP_NEAR = { h: 40, s: 100, l: 64 };
const HOP_FAR = { h: -20, s: 72, l: 26 };

/** The hub is off the ramp on purpose: nothing else on the board is white. */
const HUB_FILL = "#fff6df";

/**
 * Nothing the hub touches: a light grey with faded ink. Not a dark tile,
 * which would read as the far end of the ramp ("very far") instead of
 * outside the scale ("not connected").
 */
const UNREACHABLE_FILL = "#c9ccd1";
const UNREACHABLE_INK = "rgba(22,22,26,0.42)";

interface HopMap {
  hubId: string;
  maxDepth: number;
  depthById: Map<string, number>;
}

function hslHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  const channel = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rampColor(t: number): string {
  const value = Math.min(Math.max(t, 0), 1);
  const lerp = (from: number, to: number) => from + (to - from) * value;
  return hslHex(
    lerp(HOP_NEAR.h, HOP_FAR.h),
    lerp(HOP_NEAR.s, HOP_FAR.s),
    lerp(HOP_NEAR.l, HOP_FAR.l),
  );
}

/** The colour for a given hop count, exported so the legend cannot drift. */
export function hopFill(depth: number, maxDepth: number): string {
  if (depth < 0) {
    return UNREACHABLE_FILL;
  }
  if (depth === 0) {
    return HUB_FILL;
  }
  // The ramp spans hop 1 to the furthest hop, so the reading is "near or far
  // for THIS plant", not an absolute number of wires.
  return rampColor(maxDepth > 1 ? (depth - 1) / (maxDepth - 1) : 0);
}

/** Legible ink for a hop colour — the legend uses it for its chip numbers. */
export function hopInk(depth: number, maxDepth: number): string {
  return depth < 0 ? UNREACHABLE_INK : inkFor(hopFill(depth, maxDepth)).ink;
}

/**
 * Breadth-first over the wires, from the hub outwards.
 *
 * Nodes are discovered from the edge list: a node with no wires can only be
 * unreachable, and absence from the map means the same as distance -1.
 *
 * `passThrough` nodes (drawers, tanks, buffers) are where items wait, not a
 * step in the chain: going IN to one costs a hop and coming out is free, so
 * a machine -> drawer -> machine trip counts as one hop and the buffer sits
 * at the same distance as what it feeds. Leaving the hub is never free, even
 * from a buffer, so hovering a drawer puts its neighbours at 1.
 */
export function computeHopDepths(
  hubId: string,
  edges: readonly FactoryEdge[],
  passThrough?: ReadonlySet<string>,
): Map<string, number> {
  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const existing = neighbours.get(from);
    if (existing) {
      existing.push(to);
    } else {
      neighbours.set(from, [to]);
    }
  };
  for (const edge of edges) {
    if (edge.source === edge.target) {
      continue;
    }
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const depths = new Map<string, number>([[hubId, 0]]);
  let frontier = [hubId];
  let depth = 0;
  while (frontier.length > 0) {
    // Free first: anything reachable out of a buffer already in the frontier
    // joins it at the SAME distance, and can in turn leak through a buffer of
    // its own. Only then does the frontier take a real step.
    if (passThrough?.size) {
      const leaking = [...frontier];
      while (leaking.length > 0) {
        const id = leaking.pop()!;
        if (id === hubId || !passThrough.has(id)) {
          continue;
        }
        for (const neighbour of neighbours.get(id) ?? []) {
          if (depths.has(neighbour)) {
            continue;
          }
          depths.set(neighbour, depth);
          frontier.push(neighbour);
          leaking.push(neighbour);
        }
      }
    }

    depth += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of neighbours.get(id) ?? []) {
        if (depths.has(neighbour)) {
          continue;
        }
        depths.set(neighbour, depth);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return depths;
}

let hopMap: HopMap | null = null;
const listeners = new Set<() => void>();

/**
 * The board wears "a map is up" as an attribute, and the wires read it in
 * CSS to fade back (at this zoom they hide the colours). An attribute plus a
 * CSS rule, not edge props, because hover must not re-render the board
 * (src/components/flow/CLAUDE.md). The same trick, and the same warning about
 * `className`, as node-detail.ts.
 */
export const HOP_MAP_ATTRIBUTE = "data-hop-map";

/** Set on the one node under the cursor, so CSS can give it its ring. */
export const HOP_HUB_ATTRIBUTE = "data-hop-hub";

/** The properties globals.css paints the glance layer from. */
const HOP_FILL_PROPERTY = "--hop-fill";
const HOP_INK_PROPERTY = "--hop-ink";
/**
 * The figure the card shows while a map is up: the hop count. A CSS string,
 * quotes and all, because the rule that draws it is
 * `content: var(--hop-label)`; that lets the card change its text without
 * React. Out-of-reach cards get an empty label.
 */
const HOP_LABEL_PROPERTY = "--hop-label";

let boardElement: HTMLElement | null = null;

export function registerHopMapBoard(element: HTMLElement | null) {
  boardElement = element;
  paint();
  return () => {
    if (boardElement === element) {
      boardElement = null;
    }
  };
}

/**
 * Write the current map onto the DOM, or wipe it off.
 *
 * Every mounted node gets a colour, unreachable ones included, so they do
 * not look like part of the map. Unmounted nodes are not painted, which is
 * why the map is dropped the moment the board pans or zooms (FactoryFlow's
 * move handlers): React Flow culls off-screen nodes, so a map held across a
 * pan would miss cards that mount later.
 */
function paint() {
  const board = boardElement;
  if (!board) {
    return;
  }
  const nodes = board.querySelectorAll<HTMLElement>(".react-flow__node");
  if (!hopMap) {
    board.removeAttribute(HOP_MAP_ATTRIBUTE);
    for (const node of nodes) {
      node.style.removeProperty(HOP_FILL_PROPERTY);
      node.style.removeProperty(HOP_INK_PROPERTY);
      node.style.removeProperty(HOP_LABEL_PROPERTY);
      node.removeAttribute(HOP_HUB_ATTRIBUTE);
    }
    return;
  }

  const { hubId, maxDepth, depthById } = hopMap;
  // One colour pair per DISTANCE rather than per node: a board where forty
  // cards sit two wires out does the colour maths once, not forty times.
  const fills = new Map<number, { fill: string; ink: string; label: string }>();
  const paintFor = (depth: number) => {
    let colour = fills.get(depth);
    if (!colour) {
      colour = {
        fill: hopFill(depth, maxDepth),
        ink: hopInk(depth, maxDepth),
        label: depth < 0 ? '""' : `"${depth}"`,
      };
      fills.set(depth, colour);
    }
    return colour;
  };

  board.setAttribute(HOP_MAP_ATTRIBUTE, "on");
  for (const node of nodes) {
    const id = node.getAttribute("data-id");
    const colour = paintFor(id ? (depthById.get(id) ?? -1) : -1);
    node.style.setProperty(HOP_FILL_PROPERTY, colour.fill);
    node.style.setProperty(HOP_INK_PROPERTY, colour.ink);
    node.style.setProperty(HOP_LABEL_PROPERTY, colour.label);
    if (id === hubId) {
      node.setAttribute(HOP_HUB_ATTRIBUTE, "on");
    } else {
      node.removeAttribute(HOP_HUB_ATTRIBUTE);
    }
  }
}

function publish() {
  paint();
  for (const listener of listeners) {
    listener();
  }
}

export function setHopMapHub(
  hubId: string,
  edges: readonly FactoryEdge[],
  passThrough?: ReadonlySet<string>,
) {
  if (hopMap?.hubId === hubId) {
    return;
  }
  const depthById = computeHopDepths(hubId, edges, passThrough);
  let maxDepth = 0;
  for (const depth of depthById.values()) {
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }
  hopMap = { hubId, maxDepth, depthById };
  publish();
}

export function clearHopMap() {
  if (!hopMap) {
    return;
  }
  hopMap = null;
  publish();
}

export function getHopMapHubId(): string | undefined {
  return hopMap?.hubId;
}

export function subscribeHopMap(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The map as a whole, for the legend. Re-renders only when the hub changes. */
export function useHopMapSummary(): { hubId: string; maxDepth: number } | undefined {
  return useSyncExternalStore(subscribeHopMap, getHopMapSummary, () => undefined);
}

let summary: { hubId: string; maxDepth: number } | undefined;
let summarySource: HopMap | null = null;

function getHopMapSummary(): { hubId: string; maxDepth: number } | undefined {
  // Cached against the map it was derived from: getSnapshot must return the
  // same identity for the same state or useSyncExternalStore loops forever.
  if (summarySource !== hopMap) {
    summarySource = hopMap;
    summary = hopMap ? { hubId: hopMap.hubId, maxDepth: hopMap.maxDepth } : undefined;
  }
  return summary;
}
