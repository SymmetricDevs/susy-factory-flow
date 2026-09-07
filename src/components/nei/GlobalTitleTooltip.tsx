"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getUiScale } from "@/lib/ui-scale";
import { isTouchPointer } from "@/lib/pointer-kind";
import { TOOLTIP_PANEL_CLASS } from "./tooltip-style";

/**
 * Every browser `title` attribute in the app, rendered as the planner's own
 * tooltip instead of the browser's.
 *
 * One delegated listener, mounted once: on hover it finds the nearest
 * `[title]`, MOVES the text into `data-tip-title` (so the native popup can
 * never render - an attribute that is gone cannot be shown), and paints the
 * same words in the Minecraft panel every other tooltip here uses. React
 * putting the attribute back on a re-render is fine: the next hover strips
 * it again before the browser's ~1s delay elapses.
 *
 * Precedence with the rich tooltips (MinecraftTooltip):
 * - An element that IS a rich root keeps its rich panel; its `title` was a
 *   duplicate and is stripped without replacement.
 * - A titled element INSIDE a rich area gets stamped `data-tooltip-stop`,
 *   which the rich wrapper already yields to - so hovering a button inside a
 *   card swaps the card's story for the button's own line, one panel at a
 *   time, never two.
 */
const STORED = "data-tip-title";

export function GlobalTitleTooltip() {
  const [tip, setTip] = useState<{ lines: string[]; x: number; y: number } | undefined>();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const pendingRef = useRef<{ lines: string[]; x: number; y: number } | undefined>(undefined);
  const pointerRef = useRef<{ x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    const hide = () => {
      pendingRef.current = undefined;
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
      }
      setTip((current) => (current === undefined ? current : undefined));
    };

    const flush = () => {
      frameRef.current = undefined;
      const next = pendingRef.current;
      if (!next) {
        return;
      }
      setTip((current) =>
        current &&
        current.lines === next.lines &&
        Math.abs(current.x - next.x) < 2 &&
        Math.abs(current.y - next.y) < 2
          ? current
          : next,
      );
    };

    const resolveAt = (target: Element | null, clientX: number, clientY: number, buttons: number) => {
      if (isTouchPointer()) {
        hide();
        return;
      }
      const titled = target?.closest?.(`[title], [${STORED}]`) ?? null;
      if (!titled) {
        hide();
        return;
      }

      // Strip the native attribute the moment it is seen. Do this even for
      // rich roots: their panel already says it, and the browser's box on
      // top of ours is exactly the doubling this component exists to end.
      const native = titled.getAttribute("title");
      if (native !== null) {
        titled.removeAttribute("title");
        if (native.trim() && !titled.hasAttribute("data-tooltip-root")) {
          titled.setAttribute(STORED, native);
          titled.setAttribute("data-tooltip-stop", "");
        }
      }
      if (titled.hasAttribute("data-tooltip-root")) {
        hide();
        return;
      }
      const text = titled.getAttribute(STORED);
      if (!text || buttons !== 0) {
        hide();
        return;
      }

      const lines = text.split("\n");
      const panelWidth = panelRef.current?.offsetWidth ?? 260;
      const panelHeight = panelRef.current?.offsetHeight ?? 60;
      // The panel is a body portal wearing .ui-zoom, so its left/top and its
      // offset size are shell pixels: the pointer and the window (real
      // pixels) are brought across by the interface scale (ui-scale.ts).
      const scale = getUiScale();
      pendingRef.current = {
        lines,
        x: Math.max(4, Math.min(clientX / scale + 12, window.innerWidth / scale - panelWidth - 8)),
        y: Math.max(4, Math.min(clientY / scale + 12, window.innerHeight / scale - panelHeight - 8)),
      };
      if (frameRef.current === undefined) {
        frameRef.current = window.requestAnimationFrame(flush);
      }
    };
    const onMove = (event: globalThis.MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      resolveAt(event.target as Element | null, event.clientX, event.clientY, event.buttons);
    };
    // A wheel or scroll never hides a tip by itself (Jack, 2026-09-07): a
    // frame later, once the page has settled, the tip is re-read from
    // whatever is under the pointer - the same thing keeps it, something
    // else scrolled in re-targets it, and where the document cannot say
    // (no elementFromPoint) the tip stays.
    let settleFrame: number | undefined;
    const recheckAfterScroll = () => {
      if (settleFrame !== undefined) {
        return;
      }
      settleFrame = window.requestAnimationFrame(() => {
        settleFrame = undefined;
        const pointer = pointerRef.current;
        if (!pointer || typeof document.elementFromPoint !== "function") {
          return;
        }
        resolveAt(document.elementFromPoint(pointer.x, pointer.y), pointer.x, pointer.y, 0);
      });
    };

    const options = { capture: true, passive: true } as const;
    document.addEventListener("mousemove", onMove, options);
    window.addEventListener("wheel", recheckAfterScroll, options);
    window.addEventListener("scroll", recheckAfterScroll, options);
    window.addEventListener("pointerdown", hide, options);
    window.addEventListener("pointercancel", hide, options);
    window.addEventListener("resize", hide, options);
    window.addEventListener("blur", hide, options);
    document.documentElement.addEventListener("mouseleave", hide);
    return () => {
      document.removeEventListener("mousemove", onMove, options);
      window.removeEventListener("wheel", recheckAfterScroll, options);
      window.removeEventListener("scroll", recheckAfterScroll, options);
      if (settleFrame !== undefined) {
        window.cancelAnimationFrame(settleFrame);
      }
      window.removeEventListener("pointerdown", hide, options);
      window.removeEventListener("pointercancel", hide, options);
      window.removeEventListener("resize", hide, options);
      window.removeEventListener("blur", hide, options);
      document.documentElement.removeEventListener("mouseleave", hide);
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  if (!tip || typeof document === "undefined") {
    return null;
  }

  // Same skin as MinecraftTooltip's plain-lines panel, so a converted title
  // is indistinguishable from a tooltip somebody wrote by hand.
  return createPortal(
    <div
      ref={panelRef}
      data-minecraft-tooltip="true"
      className={`${TOOLTIP_PANEL_CLASS} ui-zoom max-w-[340px] px-2 py-1 font-mono text-[16px] leading-[19px]`}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.lines.map((line, index) => (
        <div key={`${line}-${index}`} className={index === 0 ? "text-fg" : "text-fg-subtle"}>
          {line}
        </div>
      ))}
    </div>,
    document.body,
  );
}
