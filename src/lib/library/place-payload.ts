"use client";

import { snapPositionToGrid } from "@/lib/board-grid";
import { useFactoryStore, type BoardClipboardPayload } from "@/store/factory-store";
import { leaveLibrary } from "./library-tab";

/**
 * Stamp a fetched payload (a saved board, or a setup loaded as one) onto
 * the board, centred on the current view. Returns the pasted top-level ids.
 * Placed from the library, the library steps aside so what arrived is the
 * thing on screen.
 */
export function placePayload(payload: BoardClipboardPayload): string[] {
  const state = useFactoryStore.getState();
  const centre = payloadCentre(payload) ?? { x: 0, y: 0 };
  const viewCentre = state.flowViewportCenter ?? { x: 0, y: 0 };
  const offset = snapPositionToGrid({
    x: viewCentre.x - centre.x,
    y: viewCentre.y - centre.y,
  });
  const pastedIds = state.pasteBoardItems(payload, offset);
  if (pastedIds.length > 0) {
    leaveLibrary();
    // Arrives selected, ready to drag into place: same handoff as paste.
    state.setPendingBoardSelection(pastedIds);
    // And the camera closes in on it. It lands centred on the view, but a
    // board being read from far out would show what arrived as a speck, and
    // a board zoomed right in would only show a corner of it.
    state.frameBoardNodes(pastedIds);
  }
  return pastedIds;
}

/** Centre of what the payload shows at its own top level. */
function payloadCentre(payload: BoardClipboardPayload): { x: number; y: number } | undefined {
  const capturedPockets = new Set(payload.pockets.map((pocket) => pocket.id));
  const atRoot = (pocketId?: string) => pocketId === undefined || !capturedPockets.has(pocketId);
  const positions = [
    ...payload.nodes.filter((node) => atRoot(node.pocketId)).map((node) => node.position),
    ...payload.storages
      .filter((storage) => atRoot(storage.pocketId))
      .map((storage) => storage.position),
    ...payload.annotations
      .filter((annotation) => atRoot(annotation.pocketId))
      .map((annotation) => annotation.position),
    ...payload.pockets
      .filter((pocket) => atRoot(pocket.parentPocketId))
      .map((pocket) => pocket.position),
  ];
  if (positions.length === 0) {
    return undefined;
  }

  return {
    x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
    y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
  };
}
