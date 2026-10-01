import { useEffect, useRef } from "react";
import { useUpdateNodeInternals } from "@xyflow/react";

/**
 * React Flow measures a card's handles when the card MOUNTS and whenever its
 * box resizes. Our cards can swap which ports they render at an unchanged
 * size: a custom rate node adopting a resource replaces its two `custom-any`
 * sockets with the real one, a machine's chosen handler or oredict
 * alternative renames a port. React Flow then still holds bounds for handle
 * ids that no longer exist and silently drops every edge naming a new id
 * ("Couldn't create edge for source handle id"): the wire is in the project,
 * the solver counts it, and the board draws nothing until the next reload.
 *
 * So re-measure whenever the rendered id set changes. The mount measurement
 * is already correct, so the first run is skipped: a board of 200 cards must
 * not pay 200 extra measures on load.
 */
export function useRenderedHandles(nodeId: string, handleIds: readonly string[]): void {
  const updateNodeInternals = useUpdateNodeInternals();
  const key = handleIds.join("|");
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) {
      return;
    }
    lastKey.current = key;
    updateNodeInternals(nodeId);
  }, [key, nodeId, updateNodeInternals]);
}
