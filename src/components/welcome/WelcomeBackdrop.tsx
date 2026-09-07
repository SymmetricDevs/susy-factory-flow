"use client";

import { useEffect, useRef } from "react";
import { getUiScale } from "@/lib/ui-scale";

/**
 * The Welcome page's backdrop: the pack's most-used items drifting through
 * the corners over a field of ASCII texture, with the middle, where the
 * words are, left clear.
 *
 * Two layers on one canvas. Underneath, a grid of monospace glyphs, denser
 * towards the corners (a vignette in reverse), a few cells re-rolling each
 * tick so it shimmers like a terminal at rest. On top, item sprites from the
 * game, TINTED to the board's palette so they read as one texture rather
 * than a pile of pictures, rising slowly at three depths (small, dim and
 * slow at the back), swaying a little, fading in at the bottom and out at
 * the top. Now and then one wakes up: it swells slightly and shows its true
 * colours for a couple of seconds before sinking back into the tint.
 *
 * Everything is scaled by the vignette weight, so nothing crosses the words.
 * One still frame under reduced motion; stops while the tab is hidden.
 */

const CELL_W = 11;
const CELL_H = 16;
const GLYPHS = "··········::::----++||==##░░▒▓";
const ACCENT_CHANCE = 0.08;
const TICK_MS = 110;
const CHURN = 0.006;
const DPR_CAP = 2;

const TINTS = ["#22d3ee", "#93a4bb", "#f59e0b", "#60a5fa", "#93a4bb", "#c084fc"];
/** How many sprites drift at once, given enough distinct icons. */
const DRIFTER_COUNT = 36;
/** A drifter wakes up about this often, in seconds, across the whole field. */
const WAKE_EVERY = 2.2;
const WAKE_SECONDS = 2.6;

interface Cell {
  glyph: string;
  accent: boolean;
  /** 0 in the middle, 1 in the corners. */
  weight: number;
}

interface Sprite {
  image: HTMLImageElement;
  /** The tinted silhouette, one per tint, made on demand. */
  tinted: Map<string, HTMLCanvasElement>;
}

interface Drifter {
  sprite: Sprite;
  tint: string;
  x: number;
  y: number;
  size: number;
  /** Pixels per second, upwards. */
  speed: number;
  /** Sway phase and width. */
  phase: number;
  sway: number;
  /** 0 asleep; counts down from WAKE_SECONDS while awake. */
  awake: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function rollGlyph(weight: number): string {
  // Density follows the vignette: the middle is almost all blank, and the
  // field is sparser than it was on its own now that the items are over it.
  if (Math.random() > weight * 0.5) {
    return " ";
  }
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

/** The sprite as a flat silhouette in one colour, its alpha kept. */
function tintedSprite(sprite: Sprite, tint: string): HTMLCanvasElement {
  const seen = sprite.tinted.get(tint);
  if (seen) {
    return seen;
  }
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite.image, 0, 0, size, size);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, size, size);
  }
  sprite.tinted.set(tint, canvas);
  return canvas;
}

/**
 * Where a drifter is born: somewhere the vignette is strong, weighted so the
 * middle band is hardly ever picked. Tries a few spots and keeps the one
 * furthest out.
 */
function spawnPoint(width: number, height: number): { x: number; y: number; weight: number } {
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(cx, cy);
  let best = { x: 0, y: 0, weight: -1 };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const x = rand(0, width);
    const y = rand(0, height);
    const weight = smoothstep(0.42, 1.0, Math.hypot(x - cx, y - cy) / reach);
    if (weight > best.weight) {
      best = { x, y, weight };
    }
  }
  return best;
}

function makeDrifter(sprites: Sprite[], width: number, height: number, fresh: boolean): Drifter {
  const depth = Math.random();
  const point = spawnPoint(width, height);
  return {
    sprite: sprites[Math.floor(Math.random() * sprites.length)],
    tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    x: point.x,
    // A fresh one starts under the bottom edge and rises in; the first cast
    // is scattered over the whole stage so the page does not open empty.
    y: fresh ? height + rand(20, 120) : point.y,
    size: 22 + depth * 34,
    speed: 6 + depth * 14,
    phase: rand(0, Math.PI * 2),
    sway: rand(4, 14),
    awake: 0,
  };
}

export function WelcomeBackdrop({ icons }: { icons: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iconsRef = useRef(icons);
  iconsRef.current = icons;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = `12px ${getComputedStyle(document.body).fontFamily || "monospace"}`;

    let width = 0;
    let height = 0;
    let cols = 0;
    let cells: Cell[] = [];
    let live: number[] = [];
    let sprites: Sprite[] = [];
    let drifters: Drifter[] = [];
    let frame = 0;
    let last = 0;
    let running = false;
    let churnClock = 0;
    let wakeClock = 0;
    let disposed = false;

    // The glyph field is its own offscreen canvas, repainted a cell at a
    // time; every frame blits it and draws the drifters over it.
    const field = document.createElement("canvas");
    const fieldCtx = field.getContext("2d");

    const paintCell = (index: number) => {
      if (!fieldCtx) {
        return;
      }
      const cell = cells[index];
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * CELL_W;
      const y = row * CELL_H;
      fieldCtx.clearRect(x, y, CELL_W, CELL_H);
      if (cell.glyph === " ") {
        return;
      }
      const alpha = 0.05 + cell.weight * 0.26;
      fieldCtx.fillStyle = cell.accent
        ? `rgba(34, 211, 238, ${alpha})`
        : `rgba(147, 164, 187, ${alpha})`;
      fieldCtx.fillText(cell.glyph, x + CELL_W / 2, y + CELL_H / 2);
    };

    const vignetteAt = (x: number, y: number) => {
      const cx = width / 2;
      const cy = height / 2;
      return smoothstep(0.42, 1.0, Math.hypot(x - cx, y - cy) / Math.hypot(cx, cy));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(field, 0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      for (const drifter of drifters) {
        const weight = vignetteAt(drifter.x, drifter.y);
        // Fade in over the first 80px above the bottom edge, out over the
        // last 80px under the top, and never over the words.
        const edge =
          Math.min(1, (height - drifter.y) / 80) * Math.min(1, (drifter.y + 40) / 80);
        const alpha = weight * Math.max(0, edge);
        if (alpha <= 0.01) {
          continue;
        }
        const wake = drifter.awake > 0 ? Math.sin((drifter.awake / WAKE_SECONDS) * Math.PI) : 0;
        const size = drifter.size * (1 + wake * 0.25);
        const x = drifter.x + Math.sin(drifter.phase) * drifter.sway - size / 2;
        const y = drifter.y - size / 2;
        // The tint, then the true colours over it while awake.
        ctx.globalAlpha = alpha * 0.55 * (1 - wake * 0.6);
        ctx.drawImage(tintedSprite(drifter.sprite, drifter.tint), x, y, size, size);
        if (wake > 0) {
          ctx.globalAlpha = alpha * wake;
          ctx.drawImage(drifter.sprite.image, x, y, size, size);
        }
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      // The canvas lives in the zoomed shell: its drawing space is shell
      // pixels (the rect is real pixels, divided by the interface scale) and
      // the scale joins the device ratio so the raster stays crisp.
      const scale = getUiScale();
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1) * scale;
      width = Math.max(1, Math.round(box.width / scale));
      height = Math.max(1, Math.round(box.height / scale));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      field.width = Math.round(width * dpr);
      field.height = Math.round(height * dpr);
      if (fieldCtx) {
        fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fieldCtx.font = font;
        fieldCtx.textAlign = "center";
        fieldCtx.textBaseline = "middle";
      }
      cols = Math.ceil(width / CELL_W);
      const rows = Math.ceil(height / CELL_H);
      cells = [];
      live = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const weight = vignetteAt(col * CELL_W + CELL_W / 2, row * CELL_H + CELL_H / 2);
          if (weight > 0) {
            live.push(cells.length);
          }
          cells.push({
            glyph: rollGlyph(weight),
            accent: Math.random() < ACCENT_CHANCE,
            weight,
          });
        }
      }
      for (let index = 0; index < cells.length; index += 1) {
        paintCell(index);
      }
      if (sprites.length > 0) {
        drifters = Array.from({ length: DRIFTER_COUNT }, () =>
          makeDrifter(sprites, width, height, false),
        );
      }
      draw();
    };

    const tick = (now: number) => {
      if (!running) {
        return;
      }
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;

      churnClock += dt * 1000;
      if (churnClock >= TICK_MS) {
        churnClock = 0;
        const count = Math.max(1, Math.round(live.length * CHURN));
        for (let n = 0; n < count; n += 1) {
          const index = live[Math.floor(Math.random() * live.length)];
          const cell = cells[index];
          cell.glyph = rollGlyph(cell.weight);
          cell.accent = Math.random() < ACCENT_CHANCE;
          paintCell(index);
        }
      }

      wakeClock += dt;
      if (wakeClock >= WAKE_EVERY && drifters.length > 0) {
        wakeClock = 0;
        const pick = drifters[Math.floor(Math.random() * drifters.length)];
        if (pick.awake <= 0) {
          pick.awake = WAKE_SECONDS;
        }
      }

      for (let index = 0; index < drifters.length; index += 1) {
        const drifter = drifters[index];
        drifter.y -= drifter.speed * dt;
        drifter.phase += dt * 0.6;
        if (drifter.awake > 0) {
          drifter.awake = Math.max(0, drifter.awake - dt);
        }
        if (drifter.y < -60) {
          drifters[index] = makeDrifter(sprites, width, height, true);
        }
      }

      draw();
      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || reduceMotion) {
        return;
      }
      running = true;
      last = 0;
      frame = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    // The sprites arrive whenever the popular list does; until then the
    // field runs on its own.
    const loadSprites = (paths: string[]) => {
      const loaded: Sprite[] = [];
      let pending = paths.length;
      const settle = () => {
        pending -= 1;
        if (pending > 0 || disposed) {
          return;
        }
        sprites = loaded;
        if (sprites.length > 0 && width > 0) {
          drifters = Array.from({ length: DRIFTER_COUNT }, () =>
            makeDrifter(sprites, width, height, false),
          );
          if (reduceMotion) {
            draw();
          }
        }
      };
      for (const path of paths) {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          if (image.naturalWidth > 0) {
            loaded.push({ image, tinted: new Map() });
          }
          settle();
        };
        image.onerror = settle;
        image.src = path;
      }
      if (paths.length === 0) {
        settle();
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    loadSprites(iconsRef.current);
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) {
      start();
    }

    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // Re-run once when the icon list arrives, not on every re-render of the
    // page: the list itself is read through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icons.length > 0]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
