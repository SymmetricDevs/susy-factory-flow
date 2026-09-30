/**
 * Dragging a wire is a MODE, not just a gesture.
 *
 * While a wire is out, the board answers only "where does this land" (the
 * green/red wash on every card, the pipe snapping to its slot). Everything
 * else that answers the pointer (edge highlights, edge labels, per-slot
 * hover scopes, the hop map) stays quiet, or the board argues with itself.
 *
 * The flag is read imperatively inside event handlers, never subscribed to:
 * a value every node and edge subscribes to rebuilds the whole board twice
 * per gesture, the cost src/components/flow/CLAUDE.md's hover rules exist to avoid. Purely
 * visual suppression rides on the `factory-flow-board--wiring` class, so CSS
 * does that half for free.
 */
let wiringConnection = false;
const wiringListeners = new Set<(active: boolean) => void>();

export function isWiringConnection(): boolean {
  return wiringConnection;
}

export function setWiringConnection(active: boolean): void {
  if (wiringConnection === active) {
    return;
  }
  wiringConnection = active;
  for (const listener of wiringListeners) {
    listener(active);
  }
}

/**
 * For the ONE component that must mount per wire gesture (the void-drop
 * ghost). Everything else keeps reading the flag imperatively - a value the
 * whole board subscribed to would rebuild it twice per gesture.
 */
export function onWiringConnectionChange(listener: (active: boolean) => void): () => void {
  wiringListeners.add(listener);
  return () => {
    wiringListeners.delete(listener);
  };
}

/**
 * When the last wire gesture ended. A drop on a pocket card is a mouseup,
 * and mouseups pair into double-clicks: without this, wiring a pocket could
 * count as "open the pocket" and yank the viewer inside mid-thought. Both
 * double-click paths (the card's own and React Flow's) check this window.
 */
let lastWireDropAt = 0;

export function markWireDrop(): void {
  lastWireDropAt = Date.now();
}

export function wasRecentWireDrop(withinMs = 500): boolean {
  return Date.now() - lastWireDropAt < withinMs;
}

export const WIRING_BOARD_CLASS = "factory-flow-board--wiring";
