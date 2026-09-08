/**
 * The arranger's judge and search: takes an island the layered pass has
 * already placed and rearranges its cards until the wires the router will
 * draw cross as little as possible, and are short after that.
 *
 * The arranger and the router are one system (Jack, 2026-09-08): a layout
 * is only as good as the wires it makes the router draw, and the router
 * prices crossings far above length. So the arranger scores a layout the
 * way the router will see it. Every wire gets a PROXY route shaped like the
 * router's own - leave at the rim point nearest the far end, run straight
 * for the clean cells, take the shortest octilinear way with its one
 * diagonal centred, land straight - and proxy routes are scored
 *
 *   crossings x CROSS + wires driven through a card x BLOCKED + length.
 *
 * The SEARCH keeps the column discipline the layered pass gave the island:
 * a state is the order of cards in each column, each column's vertical
 * offset, the air above each card, and how far along its machine's side
 * each satellite drawer sits. Positions are DERIVED from that by a placer,
 * so every trial is a tidy layout - columns stay columns, rows stay rows.
 * Simulated annealing over swaps, moves between neighbouring columns and
 * offset nudges hunts the score down; the real router then judges the few
 * best candidates and the fewest actual crossings wins. The proxy knows
 * the shape of a wire; the router knows the wire.
 *
 * Pure and deterministic: the RNG is seeded from the island's ids.
 */

import { BOARD_GRID } from "./board-grid";
import {
  solveGridRoutes,
  type GridEndpoint,
  type GridObstacle,
  type GridRouteRequest,
} from "@/components/flow/grid-edge-router";
import { DEFAULT_ROUTER_TUNING, getRouterTuning } from "@/components/flow/router-tuning";

export interface OptimizeCard {
  id: string;
  width: number;
  height: number;
  role?: "machine" | "storage";
  /** Column from the layered pass. Satellites carry their anchor's. */
  layer: number;
  /** Order within the column from the layered pass (any monotone key). */
  seq: number;
  /** The feeder section the layered pass put the card in; bands keep air. */
  section?: number;
  /**
   * A drawer pinned to one machine's side keeps to that side: supplies on
   * the left, catches on the right - the way players park them and the way
   * the fixed ports face. It slides along the side and stacks.
   */
  satellite?: { anchorId: string; side: "left" | "right" };
}

export interface OptimizeWire {
  source: string;
  target: string;
  weight?: number;
  /**
   * Port rows, from the card's top: where the wire leaves the source's
   * right side and enters the target's left side when the far card is on
   * that side. Aligned rows make a straight wire, which the router prices
   * as the cheapest of all.
   */
  sourcePortY?: number;
  targetPortY?: number;
}

export interface OptimizeOptions {
  /** Air between stacked cards, in cells. */
  rowGapCells?: number;
  /** Air between stacked cards of different sections, in cells. */
  sectionGapCells?: number;
  /** Least corridor between columns, in cells. */
  columnGapCells?: number;
  /** Air between a satellite and its machine, in cells. */
  satellitePadCells?: number;
  /** Annealing trials; scales with the island by default. */
  trials?: number;
  /**
   * The judge of the finalists: given every card's top-left, the number of
   * crossings the board's real wires would have there. The host supplies
   * one built on the board's own route requests (docks, widths, ids), so
   * the verdict is the one the player will see. `false` skips judging;
   * absent, a stand-in routes plain rim docks with the real router.
   */
  judge?: false | ((positions: ReadonlyMap<string, { x: number; y: number }>) => number);
}

export interface OptimizeResult {
  /** New top-lefts in px, same order as the input cards, normalised to 0,0. */
  positions: Array<{ x: number; y: number }>;
  /** Proxy score before and after. */
  before: number;
  after: number;
  /** Real crossings of the winner when the router judged, else undefined. */
  crossings?: number;
  /** What the judge saw: each finalist's proxy score, proxy crossings and real crossings. */
  finalists?: Array<{ score: number; proxyCrossings: number; crossings: number }>;
}

/* Costs, in pixels of wire. Crossings first, then wires the router would
 * have to detour round a card for, then length. */
const CROSS = 1200;
const BLOCKED = 500;
/** A 45° bend in a proxy path: the router's own price for one. */
const BEND = 35;
/** Per pixel of the layout's bounding box perimeter: tidy is compact. */
const SPRAWL = 0.4;
/**
 * Cards with no wire path between them keep this much air apart: a chain
 * that trades with nothing else stands as its own group, the way a player
 * would draw it, instead of interleaving with a stranger's cards.
 */
const STRANGER_GAP = 8 * BOARD_GRID;
const STRANGER = 3;
const CLEAN = 2 * BOARD_GRID;
/**
 * A card may hop to a neighbouring column only while flow still reads left
 * to right: every feeder stays in an earlier column, every taker in a
 * later one. Hops toward partners are what shorten long wires - the
 * layered pass ranks by longest path, which spreads a board wider than a
 * hand would.
 */
const ALLOW_COLUMN_MOVES = true;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Point {
  x: number;
  y: number;
}

type Path = Point[];

/** A tiny deterministic RNG (mulberry32). */
function rng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashIds(ids: string[]): number {
  let hash = 2166136261;
  for (const id of ids) {
    for (let i = 0; i < id.length; i += 1) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0x9e3779b9;
  }
  return hash >>> 0;
}

/** The rim point of `rect` nearest `to`, and the outward normal there. */
function exitPoint(rect: Rect, to: Point): { point: Point; nx: number; ny: number } {
  const clampX = Math.min(Math.max(to.x, rect.left + BOARD_GRID), rect.right - BOARD_GRID);
  const clampY = Math.min(Math.max(to.y, rect.top + BOARD_GRID), rect.bottom - BOARD_GRID);
  if (to.y < rect.top) {
    return { point: { x: clampX, y: rect.top }, nx: 0, ny: -1 };
  }
  if (to.y > rect.bottom) {
    return { point: { x: clampX, y: rect.bottom }, nx: 0, ny: 1 };
  }
  if (to.x < rect.left) {
    return { point: { x: rect.left, y: clampY }, nx: -1, ny: 0 };
  }
  return { point: { x: rect.right, y: clampY }, nx: 1, ny: 0 };
}

function centre(rect: Rect): Point {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

/** The proxy route: clean exit, shortest octilinear way, clean landing. */
function proxyPath(
  source: Rect,
  target: Rect,
  sourcePortY: number | undefined,
  targetPortY: number | undefined,
): Path {
  let exit = exitPoint(source, centre(target));
  let entry = exitPoint(target, centre(source));
  // Flow reads left to right: a wire to a card standing to the right leaves
  // by the output port on the right side and lands on the input port on
  // the left side, whatever the vertical offset - which is what makes the
  // score smooth in that offset (a Z that straightens as the rows align)
  // instead of flipping sides at some height. Only cards that overlap
  // horizontally use the nearest rim point.
  if (target.left >= source.right) {
    if (sourcePortY !== undefined) {
      exit = { point: { x: source.right, y: source.top + sourcePortY }, nx: 1, ny: 0 };
    }
    if (targetPortY !== undefined) {
      entry = { point: { x: target.left, y: target.top + targetPortY }, nx: -1, ny: 0 };
    }
  }
  const a = { x: exit.point.x + exit.nx * CLEAN, y: exit.point.y + exit.ny * CLEAN };
  const b = { x: entry.point.x + entry.nx * CLEAN, y: entry.point.y + entry.ny * CLEAN };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const path: Path = [exit.point, a];
  if (adx > ady) {
    const straight = (adx - ady) / 2;
    const sx = Math.sign(dx);
    const m1 = { x: a.x + sx * straight, y: a.y };
    const m2 = { x: m1.x + sx * ady, y: b.y };
    path.push(m1, m2);
  } else if (ady > adx) {
    const straight = (ady - adx) / 2;
    const sy = Math.sign(dy);
    const m1 = { x: a.x, y: a.y + sy * straight };
    const m2 = { x: b.x, y: m1.y + sy * adx };
    path.push(m1, m2);
  }
  path.push(b, entry.point);
  return path;
}

function pathLength(path: Path): number {
  let length = 0;
  for (let i = 1; i < path.length; i += 1) {
    length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return length;
}

/** Bends along a path, as the router would price them (45° = 1, 90° = 2). */
function pathBends(path: Path): number {
  let bends = 0;
  for (let i = 2; i < path.length; i += 1) {
    const ax = path[i - 1].x - path[i - 2].x;
    const ay = path[i - 1].y - path[i - 2].y;
    const bx = path[i].x - path[i - 1].x;
    const by = path[i].y - path[i - 1].y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < 1e-6 || lb < 1e-6) continue;
    const cos = (ax * bx + ay * by) / (la * lb);
    if (cos > 0.99) continue;
    bends += cos > 0.5 ? 1 : cos > -0.5 ? 2 : 3;
  }
  return bends;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Proper crossings between two paths (touching ends do not count). */
function pathCrossings(p: Path, q: Path): number {
  let count = 0;
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1];
    const b = p[i];
    if (a.x === b.x && a.y === b.y) continue;
    for (let j = 1; j < q.length; j += 1) {
      const c = q[j - 1];
      const d = q[j];
      if (c.x === d.x && c.y === d.y) continue;
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      const eps = 0.5;
      if (
        ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
        ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
      ) {
        count += 1;
      }
    }
  }
  return count;
}

/** Does the segment enter the open rectangle? (Liang-Barsky.) */
function segmentEnters(a: Point, b: Point, rect: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) {
      return q > 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, a.x - rect.left) &&
    clip(dx, rect.right - a.x) &&
    clip(-dy, a.y - rect.top) &&
    clip(dy, rect.bottom - a.y) &&
    t1 - t0 > 1e-6
  );
}

/** How many cards (not its own two) the path runs through. */
function pathBlocked(path: Path, rects: Rect[], skipA: number, skipB: number): number {
  let count = 0;
  for (let r = 0; r < rects.length; r += 1) {
    if (r === skipA || r === skipB) continue;
    const rect = rects[r];
    const inflated = {
      left: rect.left - BOARD_GRID,
      top: rect.top - BOARD_GRID,
      right: rect.right + BOARD_GRID,
      bottom: rect.bottom + BOARD_GRID,
    };
    for (let i = 1; i < path.length; i += 1) {
      if (segmentEnters(path[i - 1], path[i], inflated)) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/** The layout state the search permutes. */
interface State {
  /** Card indices per column, top to bottom. Satellites are not here. */
  columns: number[][];
  /** Vertical offset of each column, in cells. */
  columnOffset: number[];
  /** Extra air above each card, in cells. */
  padBefore: number[];
  /** Satellite: offset of its top from its anchor's top, in cells. */
  satelliteOffset: number[];
}

export function optimizeIslandLayout(
  cards: OptimizeCard[],
  wires: OptimizeWire[],
  options: OptimizeOptions = {},
): OptimizeResult {
  const n = cards.length;
  const index = new Map<string, number>();
  cards.forEach((card, i) => index.set(card.id, i));
  const links: Array<{
    a: number;
    b: number;
    weight: number;
    sourcePortY?: number;
    targetPortY?: number;
  }> = [];
  for (const wire of wires) {
    const a = index.get(wire.source);
    const b = index.get(wire.target);
    if (a === undefined || b === undefined || a === b) continue;
    links.push({
      a,
      b,
      weight: Math.max(wire.weight ?? 1, 0.01),
      sourcePortY: wire.sourcePortY,
      targetPortY: wire.targetPortY,
    });
  }
  // Who can reach whom: cards in different webs are strangers and keep apart.
  const component = new Int32Array(n);
  for (let i = 0; i < n; i += 1) component[i] = i;
  const find = (i: number): number => {
    while (component[i] !== i) {
      component[i] = component[component[i]];
      i = component[i];
    }
    return i;
  };
  for (const link of links) {
    component[find(link.a)] = find(link.b);
  }
  cards.forEach((card, i) => {
    if (card.satellite) {
      const anchor = index.get(card.satellite.anchorId);
      if (anchor !== undefined) component[find(i)] = find(anchor);
    }
  });
  const componentOf = cards.map((_, i) => find(i));
  const rowGap = (options.rowGapCells ?? 2) * BOARD_GRID;
  const sectionGap = (options.sectionGapCells ?? options.rowGapCells ?? 2) * BOARD_GRID;
  const columnGap = (options.columnGapCells ?? 3) * BOARD_GRID;
  const satellitePad = (options.satellitePadCells ?? 2) * BOARD_GRID;
  const snap = (value: number) => Math.round(value / BOARD_GRID) * BOARD_GRID;

  // Satellites hang off anchors; everything else lives in the columns.
  const anchorOf = new Int32Array(n).fill(-1);
  const satellitesOf = new Map<number, number[]>();
  cards.forEach((card, i) => {
    if (!card.satellite) return;
    const anchor = index.get(card.satellite.anchorId);
    if (anchor === undefined || cards[anchor].satellite) return;
    anchorOf[i] = anchor;
    const list = satellitesOf.get(anchor);
    if (list) list.push(i);
    else satellitesOf.set(anchor, [i]);
  });

  const layerCount = cards.reduce((max, card) => Math.max(max, card.layer), 0) + 1;
  const state: State = {
    columns: Array.from({ length: layerCount }, () => []),
    columnOffset: new Array(layerCount).fill(0),
    padBefore: new Array(n).fill(0),
    satelliteOffset: new Array(n).fill(0),
  };
  cards.forEach((card, i) => {
    if (anchorOf[i] < 0) state.columns[card.layer].push(i);
  });
  for (const column of state.columns) {
    column.sort((a, b) => cards[a].seq - cards[b].seq || a - b);
  }
  // Satellites start stacked in seq order along their side.
  for (const [, sats] of satellitesOf) {
    sats.sort((a, b) => cards[a].seq - cards[b].seq || a - b);
    let offset = 0;
    for (const sat of sats) {
      state.satelliteOffset[sat] = offset;
      offset += Math.ceil(cards[sat].height / BOARD_GRID) + 1;
    }
  }

  /** Derives every card's top-left from the state. */
  const positions: Array<{ x: number; y: number }> = cards.map(() => ({ x: 0, y: 0 }));
  const rect: Rect[] = cards.map(() => ({ left: 0, top: 0, right: 0, bottom: 0 }));
  const place = () => {
    // Column widths include the satellites riding on either side.
    const leftPad = new Array(layerCount).fill(0);
    const rightPad = new Array(layerCount).fill(0);
    const widths = new Array(layerCount).fill(0);
    state.columns.forEach((column, layer) => {
      for (const i of column) {
        widths[layer] = Math.max(widths[layer], cards[i].width);
        for (const sat of satellitesOf.get(i) ?? []) {
          const need = cards[sat].width + satellitePad;
          if (cards[sat].satellite!.side === "left") leftPad[layer] = Math.max(leftPad[layer], need);
          else rightPad[layer] = Math.max(rightPad[layer], need);
        }
      }
    });
    let x = 0;
    const columnX: number[] = [];
    for (let layer = 0; layer < layerCount; layer += 1) {
      x += leftPad[layer];
      columnX.push(x);
      x += widths[layer] + rightPad[layer] + columnGap;
    }
    state.columns.forEach((column, layer) => {
      let y = state.columnOffset[layer] * BOARD_GRID;
      let previous: number | undefined;
      for (const i of column) {
        if (previous !== undefined && cards[previous].section !== cards[i].section) {
          y += sectionGap - rowGap;
        }
        previous = i;
        y += state.padBefore[i] * BOARD_GRID;
        // A machine with satellites on a side needs room above for the
        // ones that ride higher than it.
        let rise = 0;
        for (const sat of satellitesOf.get(i) ?? []) {
          rise = Math.max(rise, -state.satelliteOffset[sat] * BOARD_GRID);
        }
        y += rise;
        positions[i].x = snap(columnX[layer] + (widths[layer] - cards[i].width) / 2);
        positions[i].y = snap(y);
        let bottom = y + cards[i].height;
        for (const sat of satellitesOf.get(i) ?? []) {
          const side = cards[sat].satellite!.side;
          positions[sat].x = snap(
            side === "left"
              ? positions[i].x - satellitePad - cards[sat].width
              : positions[i].x + cards[i].width + satellitePad,
          );
          positions[sat].y = snap(y + state.satelliteOffset[sat] * BOARD_GRID);
          bottom = Math.max(bottom, positions[sat].y + cards[sat].height);
        }
        y = bottom + rowGap;
      }
    });
    for (let i = 0; i < n; i += 1) {
      rect[i].left = positions[i].x;
      rect[i].top = positions[i].y;
      rect[i].right = positions[i].x + cards[i].width;
      rect[i].bottom = positions[i].y + cards[i].height;
    }
  };

  /** Satellites on one side must not overlap each other. */
  const satellitesLegal = (anchor: number): boolean => {
    const sats = satellitesOf.get(anchor) ?? [];
    for (let i = 0; i < sats.length; i += 1) {
      for (let k = i + 1; k < sats.length; k += 1) {
        const a = sats[i];
        const b = sats[k];
        if (cards[a].satellite!.side !== cards[b].satellite!.side) continue;
        const aTop = state.satelliteOffset[a];
        const aBottom = aTop + Math.ceil(cards[a].height / BOARD_GRID);
        const bTop = state.satelliteOffset[b];
        const bBottom = bTop + Math.ceil(cards[b].height / BOARD_GRID);
        if (aTop < bBottom + 1 && bTop < aBottom + 1) return false;
      }
    }
    return true;
  };

  // Scoring, incremental: paths, lengths, bends, blocks and the pairwise
  // crossing matrix are kept, and a trial re-scores only what its moved
  // cards touched. The stranger and sprawl terms are cheap and global.
  const paths: Path[] = links.map(() => []);
  const linksOf: number[][] = cards.map(() => []);
  links.forEach((link, l) => {
    linksOf[link.a].push(l);
    linksOf[link.b].push(l);
  });
  const lengthOf = new Float64Array(links.length);
  const bendsOf = new Float64Array(links.length);
  const blockedOf = new Float64Array(links.length);
  const pairCross = new Uint8Array(links.length * links.length);
  let lastProxyCrossings = 0;
  const previous: Array<{ x: number; y: number }> = cards.map(() => ({ x: NaN, y: NaN }));
  const scoreLink = (l: number) => {
    const link = links[l];
    paths[l] = proxyPath(rect[link.a], rect[link.b], link.sourcePortY, link.targetPortY);
    lengthOf[l] = pathLength(paths[l]) * Math.min(link.weight, 4);
    bendsOf[l] = pathBends(paths[l]);
    blockedOf[l] = pathBlocked(paths[l], rect, link.a, link.b);
  };
  const crossRow = (l: number) => {
    for (let m = 0; m < links.length; m += 1) {
      if (m === l) continue;
      const c = pathCrossings(paths[l], paths[m]);
      pairCross[l * links.length + m] = c;
      pairCross[m * links.length + l] = c;
    }
  };
  const globalTerms = (): number => {
    let sum = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i += 1) {
      minX = Math.min(minX, rect[i].left);
      minY = Math.min(minY, rect[i].top);
      maxX = Math.max(maxX, rect[i].right);
      maxY = Math.max(maxY, rect[i].bottom);
    }
    sum += (maxX - minX + (maxY - minY)) * SPRAWL;
    for (let i = 0; i < n; i += 1) {
      for (let k = i + 1; k < n; k += 1) {
        if (componentOf[i] === componentOf[k]) continue;
        const gapX = Math.max(rect[i].left - rect[k].right, rect[k].left - rect[i].right, 0);
        const gapY = Math.max(rect[i].top - rect[k].bottom, rect[k].top - rect[i].bottom, 0);
        const gap = Math.max(gapX, gapY);
        if (gap < STRANGER_GAP) {
          sum += (STRANGER_GAP - gap) * STRANGER;
        }
      }
    }
    return sum;
  };
  const total = (): number => {
    let sum = globalTerms();
    let crossings = 0;
    for (let l = 0; l < links.length; l += 1) {
      sum += lengthOf[l] + bendsOf[l] * BEND + blockedOf[l] * BLOCKED;
      for (let m = l + 1; m < links.length; m += 1) {
        crossings += pairCross[l * links.length + m];
      }
    }
    lastProxyCrossings = crossings;
    return sum + crossings * CROSS;
  };
  /** Scores the current state; only what moved since the last call is redone. */
  const score = (): number => {
    place();
    const moved: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (positions[i].x !== previous[i].x || positions[i].y !== previous[i].y) {
        moved.push(i);
        previous[i].x = positions[i].x;
        previous[i].y = positions[i].y;
      }
    }
    if (moved.length === 0) {
      return total();
    }
    const touched = new Set<number>();
    for (const i of moved) {
      for (const l of linksOf[i]) touched.add(l);
    }
    for (const l of touched) {
      scoreLink(l);
    }
    for (const l of touched) {
      crossRow(l);
    }
    // A moved card may block, or unblock, wires that never touch it.
    if (moved.length < n) {
      for (let l = 0; l < links.length; l += 1) {
        if (!touched.has(l)) {
          blockedOf[l] = pathBlocked(paths[l], rect, links[l].a, links[l].b);
        }
      }
    }
    return total();
  };

  const snapshot = (): State => ({
    columns: state.columns.map((column) => [...column]),
    columnOffset: [...state.columnOffset],
    padBefore: [...state.padBefore],
    satelliteOffset: [...state.satelliteOffset],
  });
  const restore = (saved: State) => {
    state.columns = saved.columns.map((column) => [...column]);
    state.columnOffset = [...saved.columnOffset];
    state.padBefore = [...saved.padBefore];
    state.satelliteOffset = [...saved.satelliteOffset];
  };

  const normalise = (places: Array<{ x: number; y: number }>) => {
    let minX = Infinity;
    let minY = Infinity;
    for (const p of places) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
    return places.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  };

  let current = score();
  const before = current;
  if (n < 2 || links.length === 0) {
    return { positions: normalise(positions), before, after: before };
  }
  let best = current;
  let bestState = snapshot();
  const candidates: Array<{ score: number; state: State }> = [{ score: current, state: snapshot() }];
  const remember = (value: number) => {
    if (candidates.some((c) => Math.abs(c.score - value) < 1e-6)) return;
    candidates.push({ score: value, state: snapshot() });
    candidates.sort((a, b) => a.score - b.score);
    if (candidates.length > 4) candidates.pop();
  };

  const random = rng(hashIds(cards.map((card) => card.id)));
  const trials = options.trials ?? Math.min(20_000, 600 * n + 3000);
  const startTemperature = CROSS / 2;
  const endTemperature = 4;
  const columnCards = state.columns.flat();
  if (columnCards.length === 0) {
    return { positions: normalise(positions), before, after: before };
  }
  /** Which column a card (or, for a satellite, its anchor) stands in now. */
  const layerOfCard = (i: number): number | undefined => {
    const who = anchorOf[i] >= 0 ? anchorOf[i] : i;
    for (let layer = 0; layer < layerCount; layer += 1) {
      if (state.columns[layer].includes(who)) return layer;
    }
    return undefined;
  };

  for (let trial = 0; trial < trials; trial += 1) {
    const temperature =
      startTemperature * Math.pow(endTemperature / startTemperature, trial / trials);
    const saved = snapshot();
    const kind = random();
    let legal = true;
    if (kind < 0.3) {
      // Swap two cards in one column.
      const layer = Math.floor(random() * layerCount);
      const column = state.columns[layer];
      if (column.length < 2) continue;
      const i = Math.floor(random() * column.length);
      let k = Math.floor(random() * column.length);
      if (k === i) k = (i + 1) % column.length;
      const tmp = column[i];
      column[i] = column[k];
      column[k] = tmp;
    } else if (kind < 0.45 && ALLOW_COLUMN_MOVES) {
      // Move a card into a neighbouring column.
      const layer = Math.floor(random() * layerCount);
      const column = state.columns[layer];
      if (column.length < 2 && layerCount > 1 && column.length === 1 && random() < 0.5) continue;
      if (column.length === 0) continue;
      const i = Math.floor(random() * column.length);
      const to = layer + (random() < 0.5 ? -1 : 1);
      if (to < 0 || to >= layerCount) continue;
      const card = column[i];
      // Flow must still read left to right after the hop.
      let allowed = true;
      for (const l of linksOf[card]) {
        const link = links[l];
        const other = link.a === card ? link.b : link.a;
        const otherLayer = layerOfCard(other);
        if (otherLayer === undefined) continue;
        const ownLayer = layer;
        // A wire already running backwards (a recycle) does not constrain.
        if (link.a === card) {
          if (otherLayer > ownLayer && otherLayer <= to) allowed = false;
        } else if (otherLayer < ownLayer && otherLayer >= to) {
          allowed = false;
        }
      }
      if (!allowed) continue;
      column.splice(i, 1);
      const target = state.columns[to];
      const at = Math.floor(random() * (target.length + 1));
      target.splice(at, 0, card);
    } else if (kind < 0.65) {
      // Nudge a column up or down.
      const layer = Math.floor(random() * layerCount);
      const reach = 1 + Math.floor(random() * 6);
      state.columnOffset[layer] += random() < 0.5 ? -reach : reach;
    } else if (kind < 0.85) {
      // More or less air above a card.
      const i = columnCards[Math.floor(random() * columnCards.length)];
      const reach = 1 + Math.floor(random() * 4);
      state.padBefore[i] = Math.max(0, state.padBefore[i] + (random() < 0.5 ? -reach : reach));
    } else {
      // Slide a satellite along its machine's side.
      const sats = cards.map((_, i) => i).filter((i) => anchorOf[i] >= 0);
      if (sats.length === 0) continue;
      const sat = sats[Math.floor(random() * sats.length)];
      const anchor = anchorOf[sat];
      const reach = 1 + Math.floor(random() * 4);
      const limit = Math.ceil(cards[anchor].height / BOARD_GRID);
      state.satelliteOffset[sat] = Math.max(
        -2,
        Math.min(limit, state.satelliteOffset[sat] + (random() < 0.5 ? -reach : reach)),
      );
      legal = satellitesLegal(anchor);
    }
    if (!legal) {
      restore(saved);
      continue;
    }
    const next = score();
    const delta = next - current;
    if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
      current = next;
      if (current < best - 1e-9) {
        best = current;
        bestState = snapshot();
      }
      remember(current);
    } else {
      restore(saved);
    }
  }

  // The finisher: from the best state, every single-step move that helps
  // is taken until none does. Annealing gets close; this lands it, and it
  // is what makes tight spacing come out tight every time.
  restore(bestState);
  current = score();
  const polish = () => {
    for (let round = 0; round < 40; round += 1) {
      let improved = false;
      const attempt = (apply: () => boolean) => {
        const saved = snapshot();
        if (!apply()) {
          restore(saved);
          return;
        }
        const next = score();
        if (next < current - 1e-9) {
          current = next;
          improved = true;
        } else {
          restore(saved);
        }
      };
      for (let layer = 0; layer < layerCount; layer += 1) {
        for (const step of [-1, 1, -2, 2, -4, 4]) {
          attempt(() => {
            state.columnOffset[layer] += step;
            return true;
          });
        }
        const column = state.columns[layer];
        for (let i = 0; i + 1 < column.length; i += 1) {
          attempt(() => {
            const tmp = column[i];
            column[i] = column[i + 1];
            column[i + 1] = tmp;
            return true;
          });
        }
      }
      for (const i of columnCards) {
        for (const step of [-1, 1, -2, 2, -4, 4]) {
          attempt(() => {
            const next = state.padBefore[i] + step;
            if (next < 0) return false;
            state.padBefore[i] = next;
            return true;
          });
        }
      }
      for (let i = 0; i < n; i += 1) {
        if (anchorOf[i] < 0) continue;
        for (const step of [-1, 1, -2, 2]) {
          attempt(() => {
            state.satelliteOffset[i] += step;
            return satellitesLegal(anchorOf[i]);
          });
        }
      }
      if (!improved) break;
    }
  };
  polish();
  if (current < best - 1e-9) {
    best = current;
    bestState = snapshot();
    remember(current);
  }

  // The router judges the finalists.
  let winner = bestState;
  let crossings: number | undefined;
  const finalists: OptimizeResult["finalists"] = [];
  if (options.judge !== false && links.length <= 80) {
    let bestReal = Infinity;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      restore(candidate.state);
      score();
      const real =
        typeof options.judge === "function"
          ? options.judge(new Map(cards.map((card, i) => [card.id, { ...positions[i] }])))
          : judgeWithRouter(cards, links, positions);
      finalists.push({ score: candidate.score, proxyCrossings: lastProxyCrossings, crossings: real });
      if (real < bestReal || (real === bestReal && candidate.score < bestScore)) {
        bestReal = real;
        bestScore = candidate.score;
        winner = candidate.state;
      }
    }
    crossings = bestReal;
  }
  restore(winner);
  place();
  return { positions: normalise(positions), before, after: best, crossings, finalists };
}

/** Rim docks the way the board offers them in free-dock mode. */
function rim(rect: Rect): GridEndpoint[] {
  const out: GridEndpoint[] = [];
  const keepOut = (span: number) => (span < 6 * BOARD_GRID ? BOARD_GRID : 2 * BOARD_GRID);
  const kx = keepOut(rect.right - rect.left);
  const ky = keepOut(rect.bottom - rect.top);
  for (let x = rect.left + kx; x <= rect.right - kx; x += BOARD_GRID) {
    out.push({ x, y: rect.top, side: "top" }, { x, y: rect.bottom, side: "bottom" });
  }
  for (let y = rect.top + ky; y <= rect.bottom - ky; y += BOARD_GRID) {
    out.push({ x: rect.left, y, side: "left" }, { x: rect.right, y, side: "right" });
  }
  return out;
}

/** Runs the real router over a candidate and counts its geometric crossings. */
function judgeWithRouter(
  cards: OptimizeCard[],
  links: Array<{ a: number; b: number }>,
  positions: Array<{ x: number; y: number }>,
): number {
  const obstacles: GridObstacle[] = cards.map((card, i) => ({
    id: card.id,
    left: positions[i].x,
    top: positions[i].y,
    right: positions[i].x + card.width,
    bottom: positions[i].y + card.height,
  }));
  const requests: GridRouteRequest[] = links.map((link, i) => ({
    edgeId: `w${i}`,
    order: i,
    sources: rim(obstacles[link.a]),
    targets: rim(obstacles[link.b]),
    sourceCardId: cards[link.a].id,
    targetCardId: cards[link.b].id,
    strokeWidth: 6,
  }));
  let tuning = DEFAULT_ROUTER_TUNING;
  try {
    tuning = getRouterTuning();
  } catch {
    // Outside a browser the defaults stand.
  }
  const solved = solveGridRoutes(obstacles, requests, undefined, tuning);
  const paths = [...solved.values()].map((route) => route.points);
  let crossings = 0;
  for (let i = 0; i < paths.length; i += 1) {
    for (let j = i + 1; j < paths.length; j += 1) {
      crossings += pathCrossings(paths[i], paths[j]);
    }
  }
  return crossings;
}
