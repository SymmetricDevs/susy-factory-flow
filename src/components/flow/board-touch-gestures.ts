"use client";

import { useEffect } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { isCompactViewport } from "@/lib/compact-view";
import { readWorkspaceViewSnapshot } from "@/lib/workspace-view";
import { BOARD_MIN_ZOOM, boardMaxZoom } from "./board-camera";
import { getPanelPull, type PanelSide } from "./panel-pull";

/**
 * The board's own touch gestures: the two a finger expects and React Flow does
 * not provide.
 *
 * **Double tap to zoom, and double tap and slide to keep zooming.** Every map on
 * a phone does this, and pinching is a two-handed move when you are holding the
 * phone in one. Both anchor on the point that was tapped, so the thing you were
 * looking at stays under your finger.
 *
 * **A swipe in from the side opens that drawer.** The 24px tab down the edge was
 * the only way in, which meant hitting a 24px target with a thumb; now the outer
 * third of the board answers, and the drawer follows the finger from wherever the
 * swipe began. React Flow will have started panning by the time the swipe is
 * unambiguous, so the viewport is put back where it was when the finger landed —
 * the board must not creep sideways every time a drawer is opened.
 *
 * Listeners are native and in the capture phase: React Flow's pan lives on the
 * pane below, and the only way to take a gesture off it mid-flight is to stop the
 * event before it gets there. `touchmove` is non-passive for the same reason.
 */

/** Two taps closer together than this, on nearly the same spot, are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 40;
/** A tap is a touch that neither travelled nor lingered. */
const TAP_MS = 250;
const TAP_SLOP = 12;

/** One double tap: 1.7x, which is a clear step without losing your place. */
const DOUBLE_TAP_ZOOM_FACTOR = 1.7;
/** Sliding this far doubles (up) or halves (down) the zoom. */
const SLIDE_ZOOM_DISTANCE = 180;

/**
 * How much of the board's width answers a swipe from either edge: a thumb's width
 * at the very edge, down the whole height.
 *
 * A third of the board was far too much — it swallowed drags aimed at the canvas
 * from anywhere near the sides. The height is what makes this findable, not the
 * width: there is no wrong place to start down the edge, only a wrong distance in
 * from it.
 */
const EDGE_ZONE = 36;
/** Sideways travel before an edge swipe is a drawer and not a pan. */
const EDGE_CLAIM_DISTANCE = 26;

/** Anything here owns the touch itself; the board keeps out of it. */
const GESTURE_EXEMPT_SELECTOR =
  ".react-flow__node, .react-flow__edge, [data-board-toolbar], [data-resource-handle], button, input, select, textarea, a";

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Only the viewport half of the instance is used, so the node types are free. */
type ViewportInstance = Pick<
  ReactFlowInstance<never, never>,
  "getViewport" | "setViewport"
>;

export function useBoardTouchGestures({
  boardRef,
  instanceRef,
  enabled,
}: {
  boardRef: React.RefObject<HTMLDivElement | null>;
  instanceRef: React.RefObject<ViewportInstance | null>;
  /** Off while a tool owns the pointer: painting, annotating, deleting. */
  enabled: boolean;
}) {
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !enabled) {
      return undefined;
    }

    /** The gesture in flight. */
    let touch:
      | {
          x: number;
          y: number;
          startedAt: number;
          viewport: Viewport;
          /** Which drawer this could open, if the finger started at an edge. */
          edge?: PanelSide;
          claimed?: "drawer" | "zoom";
          travelled: number;
          /** Second tap of a double tap: a slide from here zooms. */
          repeat: boolean;
          multi: boolean;
        }
      | undefined;
    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    const viewportNow = (): Viewport | undefined => instanceRef.current?.getViewport();

    /** Zoom to `zoom`, keeping the board point under (px, py) where it is. */
    const zoomAround = (from: Viewport, zoom: number, px: number, py: number, duration = 0) => {
      const instance = instanceRef.current;
      if (!instance) {
        return;
      }
      const next = Math.min(boardMaxZoom(), Math.max(BOARD_MIN_ZOOM, zoom));
      const ratio = next / from.zoom;
      void instance.setViewport(
        {
          x: px - (px - from.x) * ratio,
          y: py - (py - from.y) * ratio,
          zoom: next,
        },
        duration ? { duration } : undefined,
      );
    };

    const edgeFor = (clientX: number, rect: DOMRect): PanelSide | undefined => {
      if (!isCompactViewport()) {
        return undefined;
      }
      const workspace = readWorkspaceViewSnapshot();
      // A drawer that is already open owns every swipe itself — that is how it
      // gets thrown back out.
      if (workspace.leftPanelOpen || workspace.rightPanelOpen) {
        return undefined;
      }

      if (clientX - rect.left <= EDGE_ZONE) {
        return "left";
      }
      if (rect.right - clientX <= EDGE_ZONE) {
        return "right";
      }
      return undefined;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        // Pinch, or a second finger mid-gesture: the board's own handlers own
        // both, and whatever this one had claimed is abandoned.
        if (touch) {
          touch.multi = true;
        }
        return;
      }

      const point = event.touches[0];
      const viewport = viewportNow();
      if (!point || !viewport) {
        return;
      }
      if ((point.target as Element | null)?.closest?.(GESTURE_EXEMPT_SELECTOR)) {
        touch = undefined;
        return;
      }

      const now = event.timeStamp;
      const repeat =
        now - lastTapAt < DOUBLE_TAP_MS &&
        Math.hypot(point.clientX - lastTapX, point.clientY - lastTapY) < DOUBLE_TAP_SLOP;

      touch = {
        x: point.clientX,
        y: point.clientY,
        startedAt: now,
        viewport,
        edge: repeat ? undefined : edgeFor(point.clientX, board.getBoundingClientRect()),
        travelled: 0,
        repeat,
        multi: false,
      };

      // The second tap of a double tap must not also pan the board while the
      // finger decides whether it is going to slide.
      if (repeat) {
        event.stopPropagation();
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      const point = event.touches[0];
      if (!touch || touch.multi || !point || event.touches.length > 1) {
        return;
      }

      const dx = point.clientX - touch.x;
      const dy = point.clientY - touch.y;
      touch.travelled = Math.max(touch.travelled, Math.hypot(dx, dy));

      if (touch.claimed === "zoom") {
        event.preventDefault();
        event.stopPropagation();
        // Up zooms in, down zooms out — the same direction the wheel takes on a
        // desktop, so the board answers a finger and a mouse the same way.
        zoomAround(
          touch.viewport,
          touch.viewport.zoom * Math.pow(2, -dy / SLIDE_ZOOM_DISTANCE),
          touch.x,
          touch.y,
        );
        return;
      }

      if (touch.repeat && Math.abs(dy) > TAP_SLOP) {
        touch.claimed = "zoom";
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (touch.claimed === "drawer") {
        event.preventDefault();
        event.stopPropagation();
        const inward = touch.edge === "left" ? dx : -dx;
        getPanelPull(touch.edge as PanelSide)?.move(Math.max(0, inward));
        return;
      }

      if (!touch.edge) {
        return;
      }

      const inward = touch.edge === "left" ? dx : -dx;
      if (inward > EDGE_CLAIM_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.4) {
        const pull = getPanelPull(touch.edge);
        if (!pull) {
          touch.edge = undefined;
          return;
        }

        touch.claimed = "drawer";
        // React Flow has been panning since the finger landed. Put the board back
        // where it was: opening a drawer is not a pan, and a board that shifts
        // every time reads as the swipe having gone wrong.
        void instanceRef.current?.setViewport(touch.viewport);
        pull.start();
        pull.move(inward);
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const current = touch;
      touch = undefined;
      if (!current || current.multi) {
        return;
      }

      if (current.claimed === "drawer") {
        const pull = getPanelPull(current.edge as PanelSide);
        pull?.end(current.travelled);
        event.stopPropagation();
        return;
      }

      if (current.claimed === "zoom") {
        event.stopPropagation();
        return;
      }

      const quick = event.timeStamp - current.startedAt < TAP_MS && current.travelled < TAP_SLOP;
      if (!quick) {
        return;
      }

      if (current.repeat) {
        // A double tap that never slid: one step in, on the spot tapped.
        lastTapAt = 0;
        zoomAround(
          current.viewport,
          current.viewport.zoom * DOUBLE_TAP_ZOOM_FACTOR,
          current.x,
          current.y,
          180,
        );
        event.stopPropagation();
        return;
      }

      lastTapAt = event.timeStamp;
      lastTapX = current.x;
      lastTapY = current.y;
    };

    board.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    board.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    board.addEventListener("touchend", handleTouchEnd, { capture: true });
    board.addEventListener("touchcancel", handleTouchEnd, { capture: true });
    return () => {
      board.removeEventListener("touchstart", handleTouchStart, { capture: true });
      board.removeEventListener("touchmove", handleTouchMove, { capture: true });
      board.removeEventListener("touchend", handleTouchEnd, { capture: true });
      board.removeEventListener("touchcancel", handleTouchEnd, { capture: true });
    };
  }, [boardRef, instanceRef, enabled]);
}
