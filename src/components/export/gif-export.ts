"use client";

import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type {
  EdgePulseFrameSpec,
  FlowExportCapture,
} from "@/lib/import-export/plan-image";
import { drawBorder, type CompositeLayout, type ExportBorder } from "@/lib/import-export/export-composite";
import { PULSE_STROKE } from "../flow/edge-pulse";

/**
 * The board as a looping GIF: one static photograph with the marching flow
 * dashes replayed over it frame by frame, using the live pulse canvas's
 * geometry, widths and speeds and the same occlusion rectangles.
 *
 * Each line's dash speed is nudged to a whole number of dash cycles per loop
 * so the loop wraps seamlessly (at most half a cycle over the loop). A line
 * slower than half a cycle rounds UP to one, never down to frozen.
 */

/** Discord renders embeds ~short; more width is file size, not legibility. */
export const GIF_MAX_WIDTH = 1280;
const GIF_FRAME_COUNT = 24;
const GIF_FRAME_DELAY_MS = 100;
const GIF_LOOP_SECONDS = (GIF_FRAME_COUNT * GIF_FRAME_DELAY_MS) / 1000;
/** What a transparent export sits on: GIF has no useful alpha to offer. */
const GIF_FALLBACK_BACKGROUND = "#141414";

export async function renderPlanGif(options: {
  boardBlob: Blob;
  footerBlob?: Blob;
  layout: CompositeLayout;
  capture: Pick<FlowExportCapture, "viewport" | "occlusionRects" | "occlusionDots" | "pulses">;
  background?: string;
  border?: ExportBorder;
  onProgress?: (frame: number, total: number) => void;
}): Promise<Blob> {
  const { boardBlob, footerBlob, layout, capture, background, border, onProgress } = options;
  const scale = Math.min(1, GIF_MAX_WIDTH / layout.boardWidth);
  const width = Math.max(1, Math.round(layout.boardWidth * scale));
  const height = Math.max(1, Math.round(layout.totalHeight * scale));
  const boardHeight = Math.max(1, Math.round(layout.boardHeight * scale));

  const [board, footer] = await Promise.all([
    createImageBitmap(boardBlob),
    footerBlob ? createImageBitmap(footerBlob) : Promise.resolve(undefined),
  ]);

  try {
    const base = makeCanvas(width, height);
    base.context.fillStyle = background ?? GIF_FALLBACK_BACKGROUND;
    base.context.fillRect(0, 0, width, height);
    base.context.imageSmoothingEnabled = true;
    base.context.imageSmoothingQuality = "high";
    base.context.drawImage(board, 0, 0, width, boardHeight);
    if (footer) {
      base.context.drawImage(footer, 0, boardHeight, width, height - boardHeight);
    }
    if (border) {
      // The frame sits UNDER the dash overlay, like everything else static.
      drawBorder(base.context, width, height, border, scale);
    }

    const pulses = capture.pulses;
    const frameCount = pulses.length === 0 ? 1 : GIF_FRAME_COUNT;
    const paths = pulses.map((pulse) => compileSafely(pulse));
    const cycles = pulses.map((pulse) => {
      const period = pulse.dash + pulse.gap;
      return period > 0 && pulse.velocity > 0
        ? Math.max(1, Math.round((pulse.velocity * GIF_LOOP_SECONDS) / period))
        : 0;
    });

    const { viewport, occlusionRects, occlusionDots } = capture;

    const overlay = makeCanvas(width, boardHeight);
    const frame = makeCanvas(width, height);
    const gif = GIFEncoder();
    let palette: ReturnType<typeof quantize> | undefined;

    for (let index = 0; index < frameCount; index += 1) {
      const timeSeconds = (index / frameCount) * GIF_LOOP_SECONDS;

      overlay.context.setTransform(1, 0, 0, 1, 0, 0);
      overlay.context.clearRect(0, 0, width, boardHeight);
      overlay.context.setTransform(scale, 0, 0, scale, 0, 0);
      overlay.context.translate(viewport.x, viewport.y);
      overlay.context.scale(viewport.zoom, viewport.zoom);
      overlay.context.strokeStyle = PULSE_STROKE;
      overlay.context.lineCap = "butt";
      overlay.context.lineJoin = "round";
      for (let pulseIndex = 0; pulseIndex < pulses.length; pulseIndex += 1) {
        const pulse = pulses[pulseIndex];
        const path = paths[pulseIndex];
        const cyclesPerLoop = cycles[pulseIndex];
        if (!path || cyclesPerLoop <= 0) {
          continue;
        }
        const period = pulse.dash + pulse.gap;
        const progress = (cyclesPerLoop * timeSeconds) / GIF_LOOP_SECONDS + pulse.phase;
        overlay.context.lineWidth = pulse.width;
        overlay.context.setLineDash([pulse.dash, pulse.gap]);
        overlay.context.lineDashOffset = -(progress % 1) * period;
        overlay.context.stroke(path);
      }
      // Punch out what the dashes are supposed to be behind: card windows,
      // rate chips, waypoint dots - the capture's own snapshot of them.
      overlay.context.globalCompositeOperation = "destination-out";
      for (const rect of occlusionRects) {
        overlay.context.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      }
      for (const dot of occlusionDots) {
        overlay.context.beginPath();
        overlay.context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        overlay.context.fill();
      }
      overlay.context.globalCompositeOperation = "source-over";

      frame.context.drawImage(base.canvas, 0, 0);
      frame.context.drawImage(overlay.canvas, 0, 0);

      const rgba = frame.context.getImageData(0, 0, width, height).data;
      palette ??= quantize(rgba, 256);
      const indexed = applyPalette(rgba, palette);
      gif.writeFrame(indexed, width, height, {
        palette,
        delay: frameCount === 1 ? 0 : GIF_FRAME_DELAY_MS,
      });

      onProgress?.(index + 1, frameCount);
      // A breath between frames keeps the dialog's spinner spinning.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    gif.finish();
    const bytes = gif.bytes();
    return new Blob([bytes.buffer as ArrayBuffer], { type: "image/gif" });
  } finally {
    board.close();
    footer?.close();
  }
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }
  return { canvas, context };
}

function compileSafely(pulse: EdgePulseFrameSpec): Path2D | undefined {
  if (!pulse.path) {
    return undefined;
  }
  try {
    return new Path2D(pulse.path);
  } catch {
    return undefined;
  }
}
