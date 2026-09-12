/**
 * Framing the board: where the camera has to sit to put a set of cards on
 * screen.
 *
 * Two things make this more than a bounding box.
 *
 * The first is that the cards a camera move is asked to frame are usually the
 * ones that have only just arrived - a setup opening, a pocket landing - and
 * the board culls everything off screen, so those cards have never been
 * rendered and carry no measured size at all. Framing them by their measured
 * sizes frames their top-left CORNERS: a single card would fill the window at
 * maximum zoom. An unmeasured card therefore falls back to what the grid says
 * a card of its type is. The estimate is deliberately a touch generous, so the
 * error always leans towards showing slightly too much rather than cutting a
 * card off.
 *
 * The second is the zoom cap. Fitting is also what happens when there is ONE
 * small card to look at, and blowing a lone drawer up to fill the window reads
 * as a bug rather than as focus.
 */

import {
  RECIPE_NODE_WIDTH,
  STORAGE_NODE_HEIGHT,
  STORAGE_NODE_WIDTH,
  TRASH_NODE_HEIGHT,
  TRASH_NODE_WIDTH,
  cells,
} from "@/lib/board-grid";
import { boardZoomScale } from "@/lib/ui-scale";

/**
 * How far the board may zoom out, and in. The board itself is held to these,
 * so a framing move can never show more than panning could.
 *
 * The floor is low enough that framing actually reaches: a factory some twenty
 * thousand cells wide still fits on one screen. It used to stop at 0.15, which
 * is roughly a forty-card chain - open a bigger setup than that and the camera
 * would land in the middle of it with the whole thing still off the edges,
 * which is the exact complaint framing exists to answer. Cards are already
 * drawn in the cheap glance view below NODE_GLANCE_ENTER_ZOOM (see
 * node-detail.ts), so the extra range costs nothing per card.
 */
export const BOARD_MIN_ZOOM = 0.05;
export const BOARD_MAX_ZOOM = 1.8;

/**
 * The ceiling as the board actually applies it: the 1:1 number times the
 * interface size (ui-scale.ts). The floor is left alone; the point of the
 * floor is reaching a whole factory, which is the same size at any setting.
 */
export function boardMaxZoom(): number {
  return BOARD_MAX_ZOOM * boardZoomScale();
}

/** Long enough to read as travel rather than a cut, short enough not to wait. */
export const BOARD_CAMERA_DURATION = 420;

/** Slack left around framed cards, as a fraction of the framed size. */
export const BOARD_CAMERA_PADDING = 0.2;

/**
 * Framing never zooms in past 1:1. Arriving at a setup magnified would be a
 * worse landing than arriving at it small.
 */
export const BOARD_CAMERA_MAX_ZOOM = 1;

/** The framing cap at the interface size: 1:1 at the setting's 100%. */
export function boardCameraMaxZoom(): number {
  return BOARD_CAMERA_MAX_ZOOM * boardZoomScale();
}

/** A rectangle in board space. */
export interface BoardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardSize {
  width: number;
  height: number;
}

/** The little a camera move needs to know about a card. */
export interface CameraCard {
  id: string;
  type?: string;
  position: { x: number; y: number };
  /** Set on annotations, which carry their own size in the project. */
  width?: number;
  height?: number;
}

/**
 * A recipe card and a pocket card are the same width by construction and both
 * grow downwards with their port rails. Fourteen cells is a card with a machine
 * strip and four rows either side - bigger than most, which is the safe way to
 * be wrong.
 */
const ESTIMATED_TALL_CARD: CardSize = { width: RECIPE_NODE_WIDTH, height: cells(14) };

/** What a card of each type measures before it has ever been rendered. */
export function estimatedCardSize(type: string | undefined): CardSize {
  switch (type) {
    case "storageNode":
      return { width: STORAGE_NODE_WIDTH, height: STORAGE_NODE_HEIGHT };
    case "trashNode":
      return { width: TRASH_NODE_WIDTH, height: TRASH_NODE_HEIGHT };
    default:
      return ESTIMATED_TALL_CARD;
  }
}

/**
 * The box a card occupies. `measured` wins when the board has rendered the card
 * at least once; a zero in either is treated as absent, because that is exactly
 * what an unmeasured card reports.
 */
export function cardRect(card: CameraCard, measured?: Partial<CardSize>): BoardRect {
  const estimate = estimatedCardSize(card.type);
  return {
    x: card.position.x,
    y: card.position.y,
    width: measured?.width || card.width || estimate.width,
    height: measured?.height || card.height || estimate.height,
  };
}

/** The box every one of `cards` sits inside. Undefined when there are none. */
export function framingRect(
  cards: readonly CameraCard[],
  measuredById?: ReadonlyMap<string, Partial<CardSize> | undefined>,
): BoardRect | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const card of cards) {
    const rect = cardRect(card, measuredById?.get(card.id));
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }

  if (left === Number.POSITIVE_INFINITY) {
    return undefined;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The point a framing move centres on. */
export function rectCentre(rect: BoardRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * The zoom that puts `rect` inside a viewport of `size` with slack around it.
 *
 * Clamped both ways: a factory wider than the screen zooms out only as far as
 * the board's own floor, and a single small card is not blown up to fill the
 * window.
 */
export function zoomForRect(
  rect: BoardRect,
  size: CardSize,
  options: { padding: number; minZoom: number; maxZoom: number },
): number {
  const { padding, minZoom, maxZoom } = options;
  const needsWidth = rect.width * (1 + padding);
  const needsHeight = rect.height * (1 + padding);
  const zoom = Math.min(
    needsWidth > 0 ? size.width / needsWidth : maxZoom,
    needsHeight > 0 ? size.height / needsHeight : maxZoom,
  );
  return Math.min(Math.max(zoom, minZoom), maxZoom);
}
