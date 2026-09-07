/**
 * "The camera moved": one signal every dropdown in the app listens for, so a
 * pan or zoom by ANY hand - a drag on the pane, the wheel, WASD, a pinch, a
 * camera fly - closes whatever menu was floating over the board. React Flow
 * reports drags through onMoveStart; the app's own camera controls write the
 * viewport directly and announce here themselves, so the two doors meet.
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
