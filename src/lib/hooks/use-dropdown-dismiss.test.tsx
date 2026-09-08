// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FADE_GRACE, FADE_RANGE, useDropdownDismiss } from "./use-dropdown-dismiss";

vi.mock("@/lib/board-camera-signal", () => ({
  subscribeBoardCameraMove: () => () => {},
}));

/**
 * The shape every toolbar fold-out has: a small `relative` wrapper holding
 * the button, with the menu an `absolute` child hanging under it. A wrapper's
 * bounding box does not cover an absolutely positioned child, so jsdom is
 * told the same boxes a browser reports: the wrapper is the button alone.
 */
function Foldout({ onClose }: { onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(true, { refs: [rootRef], onClose, fade: true });
  return (
    <div ref={rootRef} data-testid="wrapper">
      <button type="button">Open</button>
      <div data-testid="menu">
        <button type="button">Row 1</button>
        <button type="button" data-testid="last-row">
          Row 8
        </button>
      </div>
    </div>
  );
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function move(x: number, y: number, target: Element = document.body) {
  const event = new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}

describe("useDropdownDismiss fade", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps a menu open while the mouse walks down it, past the button's own box", () => {
    const onClose = vi.fn();
    const view = render(<Foldout onClose={onClose} />);
    const wrapper = view.getByTestId("wrapper");
    const menu = view.getByTestId("menu");
    // A 32px button at the top right; a 300px menu hanging under it.
    wrapper.getBoundingClientRect = () => rect(1000, 10, 32, 32);
    menu.getBoundingClientRect = () => rect(800, 48, 232, 300);
    const menuBottom = 48 + 300;
    expect(menuBottom - 42).toBeGreaterThan(FADE_GRACE + FADE_RANGE);

    // Straight down through the menu to its bottom row, with the pointer
    // over the menu the whole way.
    for (let y = 40; y < menuBottom; y += 20) {
      move(900, y, view.getByTestId("last-row"));
    }
    expect(onClose).not.toHaveBeenCalled();
    expect(menu.style.opacity).toBe("");

    // Just beside the menu's own edge is still inside the grace band, even
    // though it is far below the button.
    move(800 - FADE_GRACE + 1, menuBottom - 10);
    expect(onClose).not.toHaveBeenCalled();
    expect(wrapper.style.opacity).toBe("");
  });

  it("still fades and closes once the mouse leaves the whole menu", () => {
    const onClose = vi.fn();
    const view = render(<Foldout onClose={onClose} />);
    const wrapper = view.getByTestId("wrapper");
    const menu = view.getByTestId("menu");
    wrapper.getBoundingClientRect = () => rect(1000, 10, 32, 32);
    menu.getBoundingClientRect = () => rect(800, 48, 232, 300);

    move(800 - FADE_GRACE - FADE_RANGE / 2, 200);
    expect(onClose).not.toHaveBeenCalled();
    expect(Number(wrapper.style.opacity)).toBeLessThan(1);

    move(800 - FADE_GRACE - FADE_RANGE - 1, 200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
