"use client";

import { useDropdownDismiss } from "@/lib/hooks/use-dropdown-dismiss";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getUiScale } from "@/lib/ui-scale";

/**
 * The library's one menu shape: a fixed portal at a viewport point, closed
 * by a press outside, Escape or a resize. Tiles, folders and grids all use
 * it, so every right click in the library looks the same.
 */

export const MENU_WIDTH = 220;

export function LibraryMenu({
  left,
  top,
  label,
  onClose,
  children,
}: {
  left: number;
  top: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useDropdownDismiss(true, { refs: [menuRef], onClose, fade: true, ignoreCameraMove: true });

  if (typeof document === "undefined") {
    return null;
  }

  // Kept on screen: a right click near the bottom edge would otherwise put
  // half the menu below the fold.
  // Shell pixels: a body portal wearing .ui-zoom positions in shell pixels, so
  // the real-pixel anchor and window are divided by the interface scale.
  const scale = getUiScale();
  const clampedLeft = Math.min(left / scale, window.innerWidth / scale - MENU_WIDTH - 8);
  const clampedTop = Math.min(top / scale, window.innerHeight / scale - 360);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={{ left: clampedLeft, top: Math.max(8, clampedTop), width: MENU_WIDTH }}
      className="ui-zoom fixed z-[100] max-h-[340px] overflow-y-auto border-2 border-[var(--mc-15)] bg-[var(--mc-47)] py-0.5 shadow-[6px_6px_0_rgba(0,0,0,0.45)]"
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 border-t border-[var(--mc-33)] px-2 pb-0.5 pt-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mc-ink-muted)]">
      {children}
    </div>
  );
}

export function MenuRule() {
  return <div className="my-1 border-t border-[var(--mc-33)]" />;
}

export function MenuItem({
  label,
  onClick,
  tone = "default",
  indent,
  checked,
  disabled,
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
  indent?: boolean;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex w-full items-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-left text-xs hover:bg-[var(--mc-61)] disabled:opacity-50",
        indent ? "pl-4" : "",
        tone === "danger" ? "text-red-400" : "text-[var(--mc-ink)]",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked ? <span className="text-cyan-300">✓</span> : null}
    </button>
  );
}

/**
 * Two clicks to fire: the first arms, the second does it. For the items
 * that lose something (delete, take down) without a native confirm.
 */
export function ArmedMenuItem({
  label,
  armedLabel,
  armed,
  onArm,
  onFire,
}: {
  label: string;
  armedLabel: string;
  armed: boolean;
  onArm: () => void;
  onFire: () => void;
}) {
  return (
    <MenuItem
      label={armed ? armedLabel : label}
      tone="danger"
      onClick={armed ? onFire : onArm}
    />
  );
}
