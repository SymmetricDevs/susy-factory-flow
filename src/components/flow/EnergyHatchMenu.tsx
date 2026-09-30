"use client";

import { useDropdownDismiss } from "@/lib/hooks/use-dropdown-dismiss";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getUiScale } from "@/lib/ui-scale";
import { Zap } from "lucide-react";

import { ResourceIcon } from "@/components/nei/ResourceIcon";
import {
  type EnergyHatchCatalogEntry,
} from "./use-energy-hatch-catalog";

/**
 * The hatch's art at a hard size, zoomed INTO the sprite. The rendered
 * machine sprites are 256px canvases whose block fills only the middle ~45%,
 * so the image is drawn at 220% of the window and the margin cropped away -
 * the block itself fills the box. Sized with a class on the window and
 * percentages on the img. The oversized image must not flex-shrink: Firefox
 * otherwise narrows it to the window, unlike Chromium's image minimum size.
 */
export function EnergyHatchArt({
  entry,
  boxClass,
}: {
  entry?: EnergyHatchCatalogEntry;
  boxClass: string;
}) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden ${boxClass}`}
    >
      {entry?.iconPath ? (
        <img
          src={entry.iconPath}
          alt={entry.displayName}
          draggable={false}
          className="minecraft-pixel-art h-[220%] w-[220%] shrink-0 max-w-none object-contain"
        />
      ) : entry?.iconAtlas ? (
        <ResourceIcon
          resource={{ kind: "item", amount: 1, ...entry }}
          bare
          tooltip={false}
          showAmount={false}
          showConsumedState={false}
        />
      ) : (
        <Zap className="h-[55%] w-[55%] opacity-60" />
      )}
    </span>
  );
}

/**
 * The floating shell both dropdowns share: a fixed body portal at tooltip
 * depth (the only layer above the marching-dash canvas and neighbouring
 * cards), anchored under its chip, closed by Escape, any press outside, or
 * any scroll outside - a fixed panel over a moving board must never be left
 * stranded where the chip used to be.
 */
export function MenuShell({
  anchor,
  align = "right",
  width,
  maxHeight,
  onClose,
  children,
}: {
  /**
   * The chip's right edge and its top and bottom, in screen coordinates;
   * `hangsFrom` is the card, which counts as over the menu for the fade.
   */
  anchor: { x: number; top: number; bottom: number; hangsFrom?: Element };
  align?: "left" | "right";
  width: number;
  maxHeight: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // The one dropdown rule (use-dropdown-dismiss.ts). The anchor button is
  // "inside": it runs its own toggle, and closing here first would make that
  // toggle reopen the menu instead.
  useDropdownDismiss(true, {
    refs: [panelRef],
    onClose,
    insideSelector: "[data-hatch-menu-anchor]",
    fade: true,
    fadeKeep: () => anchor.hangsFrom,
  });

  // Prefer opening UPWARD (the card stays visible for the hover-preview),
  // but flip downward when the chip is too close to the top of the screen -
  // a menu must never run off the viewport. Height caps to the chosen side.
  // The anchor rect and the window are real px; width and maxHeight are
  // shell px, and so are the fixed offsets of this zoomed box. Everything is
  // brought to shell px here.
  const scale = getUiScale();
  const shell = (px: number) => px / scale;
  const spaceAbove = shell(anchor.top) - 16;
  const spaceBelow = shell(window.innerHeight - anchor.bottom) - 16;
  const opensUp = spaceAbove >= Math.min(maxHeight, 260) || spaceAbove >= spaceBelow;

  return createPortal(
    <div
      ref={panelRef}
      // "nowheel" stops React Flow from zooming the canvas when scrolling the
      // list: its native wheel handler runs before React's synthetic one.
      className="ui-zoom nodrag nowheel fixed z-[9999] flex flex-col overflow-hidden border-2 border-[var(--mc-15)] bg-[var(--mc-78)] p-1.5 shadow-[inset_2px_2px_0_var(--mc-100),inset_-2px_-2px_0_var(--mc-33),4px_4px_0_rgba(0,0,0,0.35)]"
      style={{
        width: Math.min(width, shell(window.innerWidth) - 16),
        left: Math.max(8, Math.min(shell(anchor.x) - (align === "right" ? width : 0), shell(window.innerWidth) - width - 8)),
        ...(opensUp
          ? {
              bottom: shell(window.innerHeight - anchor.top) + 4,
              maxHeight: Math.min(maxHeight, spaceAbove),
            }
          : {
              top: shell(anchor.bottom) + 4,
              maxHeight: Math.min(maxHeight, spaceBelow),
            }),
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
