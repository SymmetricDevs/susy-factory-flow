"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getUiScale } from "@/lib/ui-scale";

/**
 * "What makes it" / "What uses it", for a finger.
 *
 * The two questions every resource on screen answers. A mouse asks them with its
 * two buttons and a keyboard with R and U; a finger has neither, so it presses
 * and holds, and this is what it gets. One implementation, because the board's
 * port rows and the items column both need it and a menu that behaved differently
 * in the two places would be two menus.
 *
 * The gesture has two endings, and people try both: hold until the menu appears
 * and slide onto an item, letting go there to choose it; or let go first and tap.
 */

export type BrowseMode = "recipes" | "uses";

/**
 * How long a finger has to rest before the menu opens. Long enough not to fire on
 * the way into a drag, short enough not to feel broken.
 */
export const BROWSE_PRESS_MS = 450;

/** Past this much movement the finger is dragging, not pressing. */
export const BROWSE_PRESS_SLOP = 10;

/** How long after a menu closes a tap is still that menu's tap, not a new one. */
const REOPEN_GRACE_MS = 400;

/** Marks the menu's own elements, for handlers that must ignore their own menu. */
export const BROWSE_MENU_ATTRIBUTE = "data-browse-menu";

let lastPickAt = 0;

/**
 * One gesture, one answer.
 *
 * A menu is dismissed by the same release that chooses from it, and both that
 * release and the synthesised click trailing it can find a live menu to act on —
 * in development React's double-mounting can even leave two of them listening.
 * Two answers from one tap meant the second overwrote the first, so the wrong half
 * of the menu won.
 *
 * Module-level because only one of these can be open at a time anywhere.
 */
function claimPick(): boolean {
  const now = performance.now();
  if (now - lastPickAt < REOPEN_GRACE_MS) {
    return false;
  }
  lastPickAt = now;
  return true;
}

/**
 * The press gesture and the menu it opens.
 *
 * The caller keeps its own click, right-click and keyboard handling — those differ
 * between a port row and a list row — and spreads `pressHandlers` alongside them.
 */
export function useBrowseMenu({
  name,
  onPick,
  onPressBecomesMenu,
}: {
  /** What the menu is about, shown as its title. */
  name: string;
  onPick: (mode: BrowseMode) => void;
  /** Runs when the press turns into a menu, before it opens. */
  onPressBecomesMenu?: (point: { x: number; y: number }) => void;
}) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | undefined>(undefined);
  // Lit from the moment a finger lands, so the press is visibly registering rather
  // than the row sitting there while you wonder whether it heard you.
  const [isPressing, setPressing] = useState(false);
  const pressRef = useRef<{ x: number; y: number; touch: boolean; timer?: number; dragged: boolean }>(
    { x: 0, y: 0, touch: false, dragged: false },
  );
  const closedAtRef = useRef(0);

  const cancelPress = () => {
    window.clearTimeout(pressRef.current.timer);
    pressRef.current.timer = undefined;
  };

  useEffect(() => cancelPress, []);

  const closeMenu = () => {
    // When, so the tap that closed it cannot be the tap that reopens it: choosing
    // an item ends with a synthesised click on whatever is underneath, and
    // underneath is the row.
    closedAtRef.current = performance.now();
    setMenuAt(undefined);
    setPressing(false);
  };

  const pressHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (isFromBrowseMenu(event)) {
        return;
      }
      const touch = event.pointerType !== "mouse";
      pressRef.current = { x: event.clientX, y: event.clientY, touch, dragged: false };
      if (!touch) {
        return;
      }

      setPressing(true);
      const point = { x: event.clientX, y: event.clientY };
      pressRef.current.timer = window.setTimeout(() => {
        pressRef.current.timer = undefined;
        onPressBecomesMenu?.(point);
        setMenuAt(point);
      }, BROWSE_PRESS_MS);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > BROWSE_PRESS_SLOP) {
        press.dragged = true;
        // Moving off before the menu opens is a drag, so the press stands down —
        // but a press that already opened the menu keeps its light on while the
        // finger travels onto an item.
        cancelPress();
        setPressing(false);
      }
    },
    onPointerUp: () => {
      cancelPress();
      setPressing(false);
    },
    onPointerCancel: () => {
      cancelPress();
      setPressing(false);
    },
  };

  return {
    pressHandlers,
    /** True while a finger is on it, and while its menu is open. */
    isPressing: isPressing || menuAt !== undefined,
    /** Whether this gesture travelled far enough to be a drag rather than a tap. */
    wasDragged: () => pressRef.current.dragged,
    /** Whether the press that is ending came from a finger. */
    wasTouch: () => pressRef.current.touch,
    /**
     * Whether the menu has only just closed, so the click now arriving is the
     * trailing half of the tap that chose from it rather than a new one. Callers
     * with their own click action ask this before running it.
     */
    isSettling: () => performance.now() - closedAtRef.current < REOPEN_GRACE_MS,
    /** Open it from a tap, unless the tap is the echo of the one that closed it. */
    openFromTap: (point: { x: number; y: number }) => {
      if (pressRef.current.dragged || performance.now() - closedAtRef.current < REOPEN_GRACE_MS) {
        return false;
      }
      setMenuAt((current) => current ?? point);
      return true;
    },
    menu:
      menuAt && typeof document !== "undefined"
        ? createPortal(
            <BrowseMenu
              at={menuAt}
              name={name}
              onPick={(mode) => {
                closeMenu();
                onPick(mode);
              }}
              onDismiss={closeMenu}
            />,
            document.body,
          )
        : null,
  };
}

/** Whether an event came out of a browse menu rather than the row under it. */
export function isFromBrowseMenu(event: { target: EventTarget | null }): boolean {
  return Boolean(
    (event.target as HTMLElement | null)?.closest?.(`[${BROWSE_MENU_ATTRIBUTE}]`),
  );
}

function BrowseMenu({
  at,
  name,
  onPick,
  onDismiss,
}: {
  at: { x: number; y: number };
  name: string;
  onPick: (mode: BrowseMode) => void;
  onDismiss: () => void;
}) {
  // Wide enough for "What makes it" on one line in this font: wrapped over two, a
  // button stops looking like a button.
  const width = 208;
  // Shell pixels: the menu is a body portal wearing .ui-zoom, so its left/top
  // and width are shell pixels, and the pointer and window (real pixels) come
  // across by the interface scale (ui-scale.ts).
  const scale = getUiScale();
  const left = Math.min(Math.max(8, at.x / scale - width / 2), window.innerWidth / scale - width - 8);
  const top = Math.min(at.y / scale + 12, window.innerHeight / scale - 148);
  // The finger that opened this menu is still on the screen, and its release fires
  // the compatibility mouse events every tap fires. The gesture that opened the
  // menu cannot also dismiss it.
  const [openedAt] = useState(() => performance.now());
  const settled = () => performance.now() - openedAt > 350;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef({ onPick, onDismiss, settled });
  useEffect(() => {
    actionsRef.current = { onPick, onDismiss, settled };
  });
  const pickedRef = useRef(false);
  const pick = (mode: BrowseMode) => {
    if (pickedRef.current || !claimPick()) {
      return;
    }
    pickedRef.current = true;
    actionsRef.current.onPick(mode);
  };

  const [slidOver, setSlidOver] = useState<BrowseMode | undefined>(undefined);
  useEffect(() => {
    const dismiss = () => actionsRef.current.onDismiss();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        actionsRef.current.onDismiss();
      }
    };
    // The next press anywhere but the menu. A window listener rather than a
    // handler on the shield below, so it fires wherever the press lands — the
    // shield is only there to keep that press off whatever is underneath.
    //
    // No `blur` listener, deliberately: in the capture phase that fires for every
    // element losing focus, and lifting the finger that opened this menu moves
    // focus, so the menu used to close itself on release.
    const dismissOnPress = (event: PointerEvent) => {
      const inside = Boolean(menuRef.current?.contains(event.target as HTMLElement | null));
      if (!actionsRef.current.settled() || inside) {
        return;
      }
      actionsRef.current.onDismiss();
    };

    // Carrying on from the press: the finger may still be down, so it can slide
    // onto an item and let go there. Touch events rather than pointer events —
    // this menu only ever opens from a finger.
    const modeUnder = (x: number, y: number): BrowseMode | undefined => {
      const element = document.elementFromPoint(x, y);
      const item = element?.closest?.<HTMLElement>("[data-browse-mode]");
      const mode = item?.dataset.browseMode;
      return mode === "recipes" || mode === "uses" ? mode : undefined;
    };
    const follow = (event: TouchEvent) => {
      const point = event.touches[0];
      if (point) {
        setSlidOver(modeUnder(point.clientX, point.clientY));
      }
    };
    const release = (event: TouchEvent) => {
      const point = event.changedTouches[0] ?? event.touches[0];
      const mode = point ? modeUnder(point.clientX, point.clientY) : undefined;
      setSlidOver(undefined);
      if (mode) {
        pick(mode);
      }
    };
    const options = { capture: true, passive: true } as const;

    window.addEventListener("pointerdown", dismissOnPress, options);
    window.addEventListener("wheel", dismiss, options);
    window.addEventListener("scroll", dismiss, options);
    window.addEventListener("resize", dismiss, options);
    window.addEventListener("keydown", dismissOnEscape, { capture: true });
    window.addEventListener("touchmove", follow, options);
    window.addEventListener("touchend", release, options);
    return () => {
      window.removeEventListener("pointerdown", dismissOnPress, options);
      window.removeEventListener("wheel", dismiss, options);
      window.removeEventListener("scroll", dismiss, options);
      window.removeEventListener("resize", dismiss, options);
      window.removeEventListener("keydown", dismissOnEscape, { capture: true });
      window.removeEventListener("touchmove", follow, options);
      window.removeEventListener("touchend", release, options);
    };
    // Attached once per menu. Everything they need lives in refs, because a
    // re-attach on every render let one release reach two listeners.
  }, []);

  // Buttons that look like buttons: the same bevel the board's own controls wear,
  // rather than two lines of text that happened to be tappable.
  const itemClass = (mode: BrowseMode) =>
    [
      "flex h-11 w-full items-center justify-center border-2 border-[var(--mc-15)] px-2 text-[13px] font-bold text-white",
      slidOver === mode
        ? "bg-[var(--mc-85)] shadow-[inset_2px_2px_0_var(--mc-100),inset_-2px_-2px_0_var(--mc-49)]"
        : "bg-[var(--mc-61)] shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25)] hover:brightness-110",
    ].join(" ");

  return (
    <>
      {/* A shield, not a button: it keeps the dismissing press off whatever is
          underneath, while the listener above is what actually dismisses. */}
      <div {...{ [BROWSE_MENU_ATTRIBUTE]: "" }} className="fixed inset-0 z-[79]" />
      <div
        ref={menuRef}
        {...{ [BROWSE_MENU_ATTRIBUTE]: "" }}
        style={{ left, top, width }}
        className="ui-zoom fixed z-[80] border-2 border-[var(--mc-15)] bg-[var(--mc-49)] p-1 font-mono shadow-[inset_2px_2px_0_var(--mc-85),inset_-2px_-2px_0_var(--mc-25),4px_4px_0_rgba(0,0,0,0.45)]"
      >
        <p className="truncate px-1 pb-1 text-[11px] font-bold text-[var(--mc-ink-muted)]">
          {name}
        </p>
        <div className="flex flex-col gap-1">
        <button
          type="button"
          data-browse-mode="recipes"
          onClick={() => pick("recipes")}
          className={itemClass("recipes")}
        >
          What makes it
        </button>
        <button
          type="button"
          data-browse-mode="uses"
          onClick={() => pick("uses")}
          className={itemClass("uses")}
        >
          What uses it
        </button>
        </div>
      </div>
    </>
  );
}
