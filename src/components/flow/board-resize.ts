/**
 * The live frame of a board being resized.
 *
 * Dragging the TOP or LEFT edge moves the frame's origin, and member
 * positions are relative to it, so the members must shift back by the same
 * step on the same frame or the board visibly tears. Both halves live in the
 * board's React Flow node state, which the frame component does not own, so
 * the frame publishes its draft here and the board applies it (the same
 * imperative hand-off the hop map and the wire drag use). Nothing is written
 * to the plan until the pointer comes up: one undo entry, and no store churn
 * per pointer move.
 */

export interface BoardResizeDraft {
  boardId: string;
  /** The frame's new position, in its own parent's space. */
  position: { x: number; y: number };
  size: { width: number; height: number };
}

type Applier = (draft: BoardResizeDraft | undefined) => void;

let applier: Applier | undefined;

/** The board registers the one applier; it owns the node state. */
export function registerBoardResize(next: Applier | undefined) {
  applier = next;
}

/** Push a frame mid-drag, or `undefined` to hand control back. */
export function publishBoardResizeDraft(draft: BoardResizeDraft | undefined) {
  applier?.(draft);
}
