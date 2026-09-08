/**
 * Every dial the grid router has, as one plain object.
 *
 * The router (`grid-edge-router.ts`) reads all of its costs and limits from
 * a `RouterTuning`, never from module constants, so the dev menu can turn
 * any of them live and the worker can be handed the same numbers the main
 * thread is using. `DEFAULT_ROUTER_TUNING` is the shipped behaviour; the
 * dev menu's overrides persist on this device only and never touch a plan.
 *
 * Pure and worker-safe: no React, no DOM beyond a guarded localStorage.
 */

export interface RouterTuning {
  /** Cost per pixel on an empty lane. The unit everything else is priced in. */
  costEmpty: number;
  /** Cost per pixel on a lane this wire fits beside others in. */
  costShared: number;
  /** Cost per pixel on a lane this wire does NOT fit into. */
  costOverflow: number;
  /** Cost multiplier inside a board frame the wire is leaving. */
  costInsideExempt: number;
  /** Cost multiplier outside the frame holding both of the wire's ends. */
  costOutsideHome: number;
  /** A 45° bend, in pixel-equivalents. */
  turn45: number;
  /** A 90° corner, in pixel-equivalents. */
  turn90: number;
  /** Reversing along the same line (waypoint excursions only). */
  reverse: number;
  /** Bending inside the clean run at either end, on top of the turn. */
  earlyTurn: number;
  /** Cells a wire runs straight out of a port and straight into one. */
  cleanCells: number;
  /** Crossing another wire once. */
  crossing: number;
  /** Whether diagonal runs are allowed at all. */
  diagonals: boolean;
  /** Length of a diagonal cell relative to a straight one (root two is true). */
  diagonalLength: number;
  /** Usable stroke pixels in a diagonal lane. */
  diagonalLaneCapacity: number;
  /** Per pixel of rim between the dock taken and the dock planned. */
  dockPlanBias: number;
  /** Cells of rim either side of the plan a wire may still dock in. */
  dockPlanWindow: number;
  /** Landing on a dock another wire already uses, on top of everything else. */
  dockShare: number;
  /** Negotiation rounds after the first pass. */
  negotiationRounds: number;
  /** Reroute budget, as a multiple of the wire count. */
  negotiationBudget: number;
  /** Route the longest wires first (else shortest first). */
  longestFirst: boolean;
  /** Search window padding round a wire's ends, in cells. */
  windowPad: number;
  /** Padding of the wide retry rung a route that paid for a crossing gets, in cells. */
  wideRungCells: number;
}

export const DEFAULT_ROUTER_TUNING: RouterTuning = {
  costEmpty: 1,
  costShared: 1.3,
  costOverflow: 6,
  costInsideExempt: 3,
  costOutsideHome: 3,
  turn45: 35,
  turn90: 80,
  reverse: 240,
  earlyTurn: 100,
  cleanCells: 2,
  crossing: 1000,
  diagonals: true,
  diagonalLength: Math.SQRT2,
  diagonalLaneCapacity: 10,
  dockPlanBias: 0.35,
  dockPlanWindow: 12,
  dockShare: 300,
  negotiationRounds: 8,
  negotiationBudget: 2,
  longestFirst: true,
  windowPad: 4,
  wideRungCells: 30,
};

export interface RouterTuningField {
  key: keyof RouterTuning;
  label: string;
  /** One line for the player who is not the developer. */
  hint: string;
  kind: "number" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  group: "Costs" | "Turns" | "Crossings" | "Docks" | "Negotiation" | "Search";
}

/** The dials in the order the dev menu shows them. */
export const ROUTER_TUNING_FIELDS: RouterTuningField[] = [
  { key: "costEmpty", label: "Empty lane", hint: "Per pixel on a free line.", kind: "number", min: 0.1, max: 5, step: 0.1, group: "Costs" },
  { key: "costShared", label: "Shared lane", hint: "Per pixel riding beside another wire that fits.", kind: "number", min: 0.1, max: 5, step: 0.1, group: "Costs" },
  { key: "costOverflow", label: "Full lane", hint: "Per pixel in a lane the wire does not fit.", kind: "number", min: 1, max: 30, step: 0.5, group: "Costs" },
  { key: "costInsideExempt", label: "Leaving a board", hint: "Multiplier while still inside a board frame the wire is leaving.", kind: "number", min: 1, max: 10, step: 0.5, group: "Costs" },
  { key: "costOutsideHome", label: "Outside home board", hint: "Multiplier outside the board that holds both ends.", kind: "number", min: 1, max: 10, step: 0.5, group: "Costs" },
  { key: "turn45", label: "45° bend", hint: "In pixels of travel.", kind: "number", min: 0, max: 400, step: 5, group: "Turns" },
  { key: "turn90", label: "90° corner", hint: "In pixels of travel.", kind: "number", min: 0, max: 600, step: 5, group: "Turns" },
  { key: "reverse", label: "Reversal", hint: "Doubling back on the same line; only waypoints need it.", kind: "number", min: 0, max: 1000, step: 10, group: "Turns" },
  { key: "earlyTurn", label: "Early bend", hint: "Extra for bending inside the clean run at a port.", kind: "number", min: 0, max: 600, step: 10, group: "Turns" },
  { key: "cleanCells", label: "Clean run", hint: "Cells a wire runs straight out of a port and straight into one.", kind: "number", min: 1, max: 5, step: 1, group: "Turns" },
  { key: "diagonals", label: "Diagonals", hint: "Allow 45° runs at all.", kind: "boolean", group: "Turns" },
  { key: "diagonalLength", label: "Diagonal length", hint: "A diagonal cell relative to a straight one. Root two is true.", kind: "number", min: 1, max: 2.5, step: 0.01, group: "Turns" },
  { key: "crossing", label: "Crossing", hint: "Running across another wire once.", kind: "number", min: 0, max: 2000, step: 10, group: "Crossings" },
  { key: "negotiationRounds", label: "Rounds", hint: "Passes that rip up crossing wires and route them again.", kind: "number", min: 0, max: 12, step: 1, group: "Negotiation" },
  { key: "negotiationBudget", label: "Reroute budget", hint: "Reroutes allowed, as a multiple of the wire count.", kind: "number", min: 0, max: 5, step: 0.25, group: "Negotiation" },
  { key: "longestFirst", label: "Longest first", hint: "Route the longest wires first; off routes the shortest first.", kind: "boolean", group: "Negotiation" },
  { key: "dockPlanBias", label: "Plan pull", hint: "Per pixel of rim between the dock taken and the dock planned.", kind: "number", min: 0, max: 3, step: 0.05, group: "Docks" },
  { key: "dockShare", label: "Shared dock", hint: "Extra for landing on a dock another wire already uses. Never a ban: wires may stack onto one side.", kind: "number", min: 0, max: 600, step: 10, group: "Docks" },
  { key: "dockPlanWindow", label: "Plan window", hint: "Cells of rim either side of the plan a wire may still dock in.", kind: "number", min: 1, max: 60, step: 1, group: "Docks" },
  { key: "diagonalLaneCapacity", label: "Diagonal lane width", hint: "Usable stroke pixels in a diagonal lane.", kind: "number", min: 4, max: 16, step: 1, group: "Search" },
  { key: "wideRungCells", label: "Wide retry", hint: "Cells of search window a route that paid for a crossing gets on its retry.", kind: "number", min: 0, max: 80, step: 2, group: "Search" },
  { key: "windowPad", label: "Search pad", hint: "Cells of search window round a wire's ends before it grows.", kind: "number", min: 2, max: 40, step: 1, group: "Search" },
];

const STORAGE_KEY = "gtnh-factory-flow.router-tuning.v1";

let current: RouterTuning = { ...DEFAULT_ROUTER_TUNING };
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) {
    return;
  }
  loaded = true;
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as Partial<RouterTuning>;
    current = sanitize({ ...DEFAULT_ROUTER_TUNING, ...parsed });
  } catch {
    current = { ...DEFAULT_ROUTER_TUNING };
  }
}

function sanitize(tuning: RouterTuning): RouterTuning {
  const clean: RouterTuning = { ...tuning };
  for (const field of ROUTER_TUNING_FIELDS) {
    const value = clean[field.key];
    if (field.kind === "boolean") {
      (clean as unknown as Record<string, unknown>)[field.key] = Boolean(value);
      continue;
    }
    let number = typeof value === "number" && Number.isFinite(value) ? value : (DEFAULT_ROUTER_TUNING[field.key] as number);
    if (field.min !== undefined) number = Math.max(field.min, number);
    if (field.max !== undefined) number = Math.min(field.max, number);
    (clean as unknown as Record<string, unknown>)[field.key] = number;
  }
  return clean;
}

export function getRouterTuning(): RouterTuning {
  load();
  return current;
}

/**
 * Undo history for the dials. A slider drag fires a change per pixel, so
 * consecutive edits to the SAME dial within `COALESCE_MS` fold into one
 * step: Ctrl+Z takes the whole drag back, not one notch of it.
 */
const COALESCE_MS = 800;
const undoStack: RouterTuning[] = [];
const redoStack: RouterTuning[] = [];
let lastEditKey: string | undefined;
let lastEditAt = 0;

function commit(next: RouterTuning) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage is a convenience; the live value is what matters.
  }
  for (const listener of listeners) {
    listener();
  }
}

export function setRouterTuning(patch: Partial<RouterTuning>) {
  load();
  const keys = Object.keys(patch).sort().join("+");
  const now = Date.now();
  if (keys !== lastEditKey || now - lastEditAt > COALESCE_MS) {
    undoStack.push(current);
    if (undoStack.length > 200) {
      undoStack.shift();
    }
  }
  lastEditKey = keys;
  lastEditAt = now;
  redoStack.length = 0;
  commit(sanitize({ ...current, ...patch }));
}

export function resetRouterTuning() {
  setRouterTuning({ ...DEFAULT_ROUTER_TUNING });
}

export function canUndoRouterTuning(): boolean {
  return undoStack.length > 0;
}

export function canRedoRouterTuning(): boolean {
  return redoStack.length > 0;
}

/** Steps the dials back one edit; false when there is nothing to undo. */
export function undoRouterTuning(): boolean {
  const previous = undoStack.pop();
  if (!previous) {
    return false;
  }
  redoStack.push(current);
  lastEditKey = undefined;
  commit(previous);
  return true;
}

export function redoRouterTuning(): boolean {
  const next = redoStack.pop();
  if (!next) {
    return false;
  }
  undoStack.push(current);
  lastEditKey = undefined;
  commit(next);
  return true;
}

export function isDefaultRouterTuning(): boolean {
  return routerTuningKey(getRouterTuning()) === routerTuningKey(DEFAULT_ROUTER_TUNING);
}

/**
 * Asks the board to throw every route away and solve again with the dials
 * as they stand. The dev menu's "Re-route all wires" key: the same wake-up
 * a dial change sends, for when a route looks stale.
 */
export function requestWireReroute() {
  for (const listener of listeners) {
    listener();
  }
}

/** Runs `listener` after every change; returns the unsubscribe. */
export function subscribeRouterTuning(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A string that changes whenever any dial does, for solve signatures. */
export function routerTuningKey(tuning: RouterTuning): string {
  return ROUTER_TUNING_FIELDS.map((field) => String(tuning[field.key])).join(",");
}
