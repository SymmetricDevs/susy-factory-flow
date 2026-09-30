/**
 * Opening the recipe book from a port, by keyboard and by long press.
 *
 * A port row answers three questions with the pointer — click for what makes
 * this, right click for what uses it, drag to wire it — and this carries the two
 * that need something more than the pointer:
 *
 * The keyboard needs to know which port the pointer is over, and the board is not
 * about to subscribe every card on it to a hover value: a value every port read
 * would rebuild the whole board twice per pointer crossing, which is the cost
 * CLAUDE.md's hover rules exist to avoid. So the pointed-at port is written
 * here from its own enter and leave handlers, and read imperatively by the one
 * keydown listener on the board.
 *
 * Touch has neither hover nor a right button, so it gets a menu on a long press —
 * which is `browse-menu.tsx`, shared with the items column.
 */

export type PortBrowseMode = "recipes" | "uses";

interface HoveredPort {
  nodeId: string;
  handleId: string;
  open: (mode: PortBrowseMode) => void;
}

let hovered: HoveredPort | undefined;

export function setHoveredPortBrowse(port: HoveredPort): void {
  hovered = port;
}

/**
 * Clear it, but only if it is still the port that set it. Pointer enter on the
 * next row can arrive before leave on the last one, and a blind clear would then
 * throw away the row the pointer is actually on.
 */
export function clearHoveredPortBrowse(nodeId: string, handleId: string): void {
  if (hovered?.nodeId === nodeId && hovered.handleId === handleId) {
    hovered = undefined;
  }
}

/** Returns whether there was a port to open, so the key can go unclaimed. */
export function browseHoveredPort(mode: PortBrowseMode): boolean {
  if (!hovered) {
    return false;
  }
  hovered.open(mode);
  return true;
}
