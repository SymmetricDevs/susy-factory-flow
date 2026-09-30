"use client";

import { useEffect, type RefObject } from "react";

/**
 * Every animation on the board that BREATHES, by keyframe name.
 *
 * The board has one heartbeat: two marks pulsing at different moments read
 * as unrelated faults, pulsing together as one message. That takes one
 * PERIOD (`--board-pulse` in globals.css, every rule's duration) and one
 * PHASE, which this module provides: a CSS animation's clock starts when it
 * is applied, so a card scrolled into view, recycled by React Flow or newly
 * lit by a solve would otherwise start its own cycle.
 *
 * Add a keyframe here when you add a breathing state, and give it
 * `--board-pulse` as its duration. A pulse missing from this list still runs,
 * just out of step. One-shot flashes are deliberately absent: aligning them
 * to the clock would only delay their answer.
 */
export const BOARD_PULSE_ANIMATIONS = [
  // Hovered/selected resource: the glow wash on cards, and the shape-clipped
  // one drawers wear.
  "resource-breathe",
  "resource-breathe-led",
  // A card with a slot nobody wired: the dashed slot, the reason cell, the
  // ring, and the wash layer the cell and the board notice fade on.
  "unwired-port-breathe",
  "unwired-reason-breathe",
  "unwired-wash-breathe",
  "unwired-ring-breathe",
  // A ring of machines feeding each other with nothing coming in, and the
  // wires that close the loop.
  "dead-loop-breathe",
  "dead-loop-wire-breathe",
  // Its mirror: machines frozen because their own surplus filled every
  // escape route, and the wires the jam runs along.
  "clog-lock-breathe",
  "clog-lock-wire-breathe",
] as const;

const BOARD_PULSE_SET: ReadonlySet<string> = new Set(BOARD_PULSE_ANIMATIONS);

/**
 * `startTime = 0` pins an animation to the origin of the document timeline,
 * which every element on the page shares. Set it on every mark and they are all
 * at the same point of the same cycle, whenever each one arrived.
 *
 * `subtree` because a glow is often painted by a ::after, and a pseudo
 * element's animation is not on its element's own list.
 */
function pinToDocumentTimeline(element: Element, names: ReadonlySet<string>) {
  if (!element.getAnimations) {
    return;
  }
  for (const animation of element.getAnimations({ subtree: true })) {
    const name = (animation as Animation & { animationName?: string }).animationName;
    if (!name || !names.has(name)) {
      continue;
    }
    try {
      animation.startTime = 0;
    } catch {
      // A timeline that refuses the write is not worth a broken board; the
      // mark still shows, it just keeps its own phase.
    }
  }
}

/**
 * Puts every breathing mark on the board on one clock. Called once, from the
 * board root, not per card.
 *
 * `animationstart` BUBBLES, so the root hears every pulse that begins
 * beneath it, including the board's notices, which live outside any card.
 * Pinning does not restart an animation, so the handler cannot feed itself,
 * and it runs once per mark rather than per frame. The mount sweep covers
 * what was already running before the listener existed.
 */
export function useBoardPulseSync(ref: RefObject<Element | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    // One frame's grace: an animation does not exist on the element until
    // styles have been applied, and an effect can run before that. Without the
    // wait getAnimations() returns nothing and the mark stays adrift.
    const frame = requestAnimationFrame(() => {
      pinToDocumentTimeline(element, BOARD_PULSE_SET);
    });
    const onStart = (event: Event) => {
      const { animationName, target } = event as AnimationEvent;
      if (!BOARD_PULSE_SET.has(animationName) || !(target instanceof Element)) {
        return;
      }
      pinToDocumentTimeline(target, BOARD_PULSE_SET);
    };
    element.addEventListener("animationstart", onStart);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("animationstart", onStart);
    };
  }, [ref]);
}
