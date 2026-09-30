/**
 * "The camera moved": one signal every dropdown in the app listens for, so a
 * pan or zoom by ANY means (pane drag, wheel, WASD, pinch, camera fly) closes
 * whatever menu was floating over the board. React Flow reports drags through
 * onMoveStart; the app's own camera controls write the viewport directly, so
 * they must announce here themselves.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function emitBoardCameraMove(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeBoardCameraMove(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
