"use client";

import { useStore, useStoreApi, ViewportPortal } from "@xyflow/react";
import { memo, useEffect, useMemo, useState } from "react";
import { BOARD_GRID } from "@/lib/board-grid";
import type { CanvasGrainLayer } from "./canvas-themes";

/**
 * The paper under the factory: the dot / line / cross patterns, the two
 * rulings the stock React Flow Background cannot draw (a notepad's lines, a
 * graph grid with a heavier line every five cells) and the grain below them.
 *
 * THESE LIVE IN FLOW SPACE. Each layer is a div inside the viewport (through
 * React Flow's ViewportPortal), under the wires and the board floors, wearing
 * its tile as a repeating CSS `background-image` sized in FLOW pixels. The
 * viewport's own transform scales the tile with the zoom and the scroll
 * camera (scroll-camera.tsx) pans it with everything else, so a pan writes
 * NOTHING here: no React, no style, no invalidation. Only a zoom re-renders
 * the tile, which is exactly when its geometry changes.
 *
 * THE LAYER COVERS THE VIEW PLUS A MARGIN, NOT THE WORLD. A first cut made
 * each layer two million flow pixels square; its tile coordinates then sat
 * around a million, past what the GPU's single-precision floats hold to a
 * fraction of a pixel, and the dots jiggled against the cards on every
 * frame. `useCoveredRect` keeps the layer's edges within a screen or two of
 * the camera, snapped to whole tiles so the pattern's phase never moves, and
 * only rewrites its box when the view leaves the covered area - a write every
 * few screens of travel, not one per frame.
 *
 * HISTORY (2026-09-07). The stock Background writes the viewport offset into
 * an SVG pattern's x/y every pan frame and repaints the whole layer. The
 * first replacement kept full-size SVG patterns OUTSIDE the viewport and
 * slid them by `translate3d(tx mod tile)` per frame; Firefox re-rasterized
 * those SVGs every frame (about 30 fps of a 4K pan). The second drew the
 * same tiles as CSS backgrounds, still slid per frame; cheap to raster, but
 * the per-frame transform write still cost Firefox a display list rebuild
 * (about 6 ms). In flow space there is no per-frame write.
 *
 * The geometry is transcribed from the library component so the ink is
 * pixel-identical at every zoom: tile = gap, the dot radius is size / 2, the
 * cross arm is size (all flow pixels now, which the zoom scales exactly as
 * the old `× zoom` did), and the stock's `offset × zoom || 1 + dimension / 2`
 * half-cell shift is kept as the background position, its one SCREEN pixel
 * converted to flow pixels through the zoom.
 */

/** How far past the visible edge a layer extends, in screens. */
const COVER_MARGIN_SCREENS = 1;

/** One tile of SVG as a background image. */
function svgTile(tile: number, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">${body}</svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/**
 * Keeps `element`'s box over the visible flow rect plus a margin, snapped to
 * whole tiles. Subscribes to the store outside React; writes only when the
 * view has left the box it last wrote. The element arrives through state,
 * not a ref: the ViewportPortal mounts its children only once React Flow's
 * store knows the DOM node, which is after this component's first effect.
 */
function useCoveredRect(element: HTMLElement | null, tile: number) {
  const store = useStoreApi();
  useEffect(() => {
    if (!element || !(tile > 0)) {
      return;
    }
    let covered: { x0: number; y0: number; x1: number; y1: number } | undefined;
    const apply = () => {
      const { transform, width, height } = store.getState();
      const [tx, ty, zoom] = transform;
      if (!(zoom > 0) || !(width > 0) || !(height > 0)) {
        return;
      }
      const viewW = width / zoom;
      const viewH = height / zoom;
      const vx0 = -tx / zoom;
      const vy0 = -ty / zoom;
      const vx1 = vx0 + viewW;
      const vy1 = vy0 + viewH;
      if (
        covered &&
        vx0 >= covered.x0 &&
        vy0 >= covered.y0 &&
        vx1 <= covered.x1 &&
        vy1 <= covered.y1
      ) {
        return;
      }
      const marginX = viewW * COVER_MARGIN_SCREENS;
      const marginY = viewH * COVER_MARGIN_SCREENS;
      const x0 = Math.floor((vx0 - marginX) / tile) * tile;
      const y0 = Math.floor((vy0 - marginY) / tile) * tile;
      const x1 = Math.ceil((vx1 + marginX) / tile) * tile;
      const y1 = Math.ceil((vy1 + marginY) / tile) * tile;
      covered = { x0, y0, x1, y1 };
      const box = element.style;
      box.setProperty("left", `${x0}px`);
      box.setProperty("top", `${y0}px`);
      box.setProperty("width", `${x1 - x0}px`);
      box.setProperty("height", `${y1 - y0}px`);
    };
    apply();
    return store.subscribe((state, previous) => {
      if (
        state.transform !== previous.transform ||
        state.width !== previous.width ||
        state.height !== previous.height
      ) {
        apply();
      }
    });
  }, [element, store, tile]);
}

function layerStyle(
  tile: number,
  image: string,
  zIndex: number,
  offset = 0,
  opacity?: number,
): React.CSSProperties {
  return {
    // left/top/width/height are written by useCoveredRect.
    position: "absolute",
    pointerEvents: "none",
    zIndex,
    backgroundImage: image,
    backgroundSize: `${tile}px ${tile}px`,
    backgroundRepeat: "repeat",
    backgroundPosition: offset ? `${-offset}px ${-offset}px` : undefined,
    opacity,
  };
}

/* Under the board floors (-4, BoardFloors in FactoryFlow.tsx) and the wires
   (10): grain lowest, ruling inked over it. */
const GRAIN_Z = -12;
const RULING_Z = -11;

export const RuledBackground = memo(function RuledBackground({
  mode,
  color,
}: {
  mode: "ruled" | "graph";
  color: string;
}) {
  // A notepad rules every 2 cells; graph paper repeats its heavy line every
  // 5, with a fine line on each cell inside. Flow pixels: the zoom is the
  // viewport's business.
  const gap = (mode === "ruled" ? 2 : 5) * BOARD_GRID;
  const cell = BOARD_GRID;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useCoveredRect(element, gap);

  const image = useMemo(() => {
    if (mode === "graph") {
      const fine = [1, 2, 3, 4]
        .map(
          (step) =>
            `<line x1="${step * cell}" y1="0" x2="${step * cell}" y2="${gap}" stroke="${color}" stroke-opacity="0.4" stroke-width="1"/>` +
            `<line x1="0" y1="${step * cell}" x2="${gap}" y2="${step * cell}" stroke="${color}" stroke-opacity="0.4" stroke-width="1"/>`,
        )
        .join("");
      return svgTile(
        gap,
        `${fine}<line x1="0.5" y1="0" x2="0.5" y2="${gap}" stroke="${color}" stroke-width="1.5"/><line x1="0" y1="0.5" x2="${gap}" y2="0.5" stroke="${color}" stroke-width="1.5"/>`,
      );
    }
    return svgTile(
      gap,
      `<line x1="0" y1="0.5" x2="${gap}" y2="0.5" stroke="${color}" stroke-width="1"/>`,
    );
  }, [mode, gap, cell, color]);

  return (
    // NOT the stock react-flow__background class: that class carries the
    // library's own dark background-color, the very layer the themed board
    // has to show through. board-ruling is the glance fade's handle: zoomed
    // out the ruling sinks away with the rest of the near view (globals.css,
    // the LOD rules).
    <ViewportPortal>
      <div
        ref={setElement}
        className="board-ruling"
        style={layerStyle(gap, image, RULING_Z)}
        aria-hidden
      />
    </ViewportPortal>
  );
});

/**
 * The stock dot / line / cross patterns, in flow space (see the module note).
 * Wears `board-ruling` so the glance fade rules in globals.css keep applying.
 */
export const TiledBackground = memo(function TiledBackground({
  variant,
  gap,
  size,
  color,
}: {
  variant: "dots" | "lines" | "cross";
  gap: number;
  size: number;
  color: string;
}) {
  // The stock's half-cell shift is `1 + dimension / 2` SCREEN pixels; the one
  // screen pixel is the only part that needs the zoom.
  const zoom = useStore((state) => state.transform[2]);
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  const tile = gap || 1;
  const dimension = variant === "cross" ? size : tile;
  const patternOffset = 1 / (zoom || 1) + dimension / 2;
  useCoveredRect(element, tile);

  const image = useMemo(() => {
    if (variant === "dots") {
      return svgTile(
        tile,
        `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}"/>`,
      );
    }
    const d = `M${dimension / 2} 0 V${variant === "cross" ? dimension : tile} M0 ${
      variant === "cross" ? dimension / 2 : tile / 2
    } H${dimension}`;
    return svgTile(tile, `<path d="${d}" stroke="${color}" fill="none" stroke-width="1"/>`);
  }, [variant, tile, size, dimension, color]);

  return (
    <ViewportPortal>
      <div
        ref={setElement}
        className="board-ruling"
        style={layerStyle(tile, image, RULING_Z, patternOffset)}
        aria-hidden
      />
    </ViewportPortal>
  );
});

/**
 * The paper's tooth: each grain layer is a tileable noise image, sized in
 * flow pixels so it grows under the zoom like paper under a loupe. Zoomed far
 * out the tile shrinks toward per-pixel fizz, so the whole layer fades below
 * 0.5 zoom and is gone by 0.2 — tooth is a close-up reading.
 */
export const GrainBackground = memo(function GrainBackground({
  layers,
}: {
  layers: CanvasGrainLayer[];
}) {
  const zoom = useStore((state) => state.transform[2]);
  const fade = Math.max(0, Math.min(1, (zoom - 0.2) / 0.3));
  if (fade <= 0) {
    return null;
  }

  return (
    // Mounted BEFORE the ruling component so the lines stay inked over the
    // paper, not under it; the z-index says the same.
    <ViewportPortal>
      {layers.map((layer, index) => (
        <GrainLayer key={index} layer={layer} opacity={fade * (layer.opacity ?? 1)} />
      ))}
    </ViewportPortal>
  );
});

function GrainLayer({ layer, opacity }: { layer: CanvasGrainLayer; opacity: number }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useCoveredRect(element, layer.size);
  return (
    <div
      ref={setElement}
      style={layerStyle(layer.size, `url("${layer.uri}")`, GRAIN_Z, 0, opacity)}
      aria-hidden
    />
  );
}
