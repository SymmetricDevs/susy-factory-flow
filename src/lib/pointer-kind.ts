"use client";

/**
 * What last touched the screen, for the handlers that have to tell a finger from
 * a mouse.
 *
 * Every tap fires a full set of synthesised MOUSE events after its touch ones
 * (mousemove, mousedown, mouseup, click, and on some engines a `pointerdown`
 * claiming to be a mouse), so handlers that answer both answer twice, the
 * second time wrongly.
 *
 * Two questions, because neither alone is enough. The KIND is right for hover,
 * where there is nothing to time from. The TIME is right for clicks, because the
 * synthesised ones claim to be a mouse and only their timing gives them away.
 */

let lastPointerWasTouch = false;
let lastTouchAt = 0;
let watching = false;

function watch(): void {
  if (watching || typeof window === "undefined") {
    return;
  }
  watching = true;

  const remember = (event: PointerEvent) => {
    const touch = event.pointerType !== "mouse";
    lastPointerWasTouch = touch;
    if (touch) {
      lastTouchAt = performance.now();
    }
  };
  const stamp = () => {
    lastPointerWasTouch = true;
    lastTouchAt = performance.now();
  };
  const options = { capture: true, passive: true } as const;

  // Pointer events for the kind; touch events for the time, because they are the
  // ones a synthesised mouse event cannot imitate.
  window.addEventListener("pointerdown", remember, options);
  window.addEventListener("pointermove", remember, options);
  window.addEventListener("touchstart", stamp, options);
  window.addEventListener("touchmove", stamp, options);
  window.addEventListener("touchend", stamp, options);
}

/** Whether the last thing to move or press was a finger rather than a mouse. */
export function isTouchPointer(): boolean {
  watch();
  return lastPointerWasTouch;
}

/**
 * Whether a finger was on the screen just now, so a mouse event arriving here is
 * the browser's synthesised echo of it, not a real click.
 */
export function isEchoOfTouch(withinMs = 700): boolean {
  watch();
  return performance.now() - lastTouchAt < withinMs;
}
