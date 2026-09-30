import type { FactoryProject, FactoryStorage, StorageBufferMode } from "./types";

/**
 * What a drawer IS. The board draws each role as a different shape.
 *
 * Read off the WIRING (not chosen):
 * - `source`  nothing feeds it, so it invents its resource: the plan's
 *             declared import.
 * - `buffer`  fed and drawn from: the one role INSIDE the system. How it
 *             treats a surplus is its StorageBufferMode.
 * - `idle`    unwired. Rare (`pruneOrphanStorages` sweeps a drawer when its
 *             last wire goes), but a drawer mid-drag needs a name.
 *
 * A CHOICE once nothing draws from the drawer (see StorageDrainMode):
 * - `product`    pulls its feeder flat out.
 * - `byproduct`  asks for nothing and catches what is left over.
 * - `trash`      asks for nothing and VOIDS what arrives: un-clogs its
 *                feeder, and what it eats never appears in the books.
 */
export type StorageRole = "source" | "buffer" | "product" | "byproduct" | "trash" | "idle";

/** The ones that sit ON the boundary rather than inside it. */
export function isBoundaryRole(role: StorageRole): boolean {
  return role === "source" || role === "product" || role === "byproduct" || role === "trash";
}

/** The ends of a drain: all accept freely, only the product asks. */
export function isDrainRole(role: StorageRole): boolean {
  return role === "product" || role === "byproduct" || role === "trash";
}

/**
 * Every drawer's role in one pass over the edges. Built whole because callers
 * need most of the map at once; per drawer it would be O(storages x edges)
 * on the hot path.
 */
export function getStorageRoles(project: FactoryProject): Map<string, StorageRole> {
  const roles = new Map<string, StorageRole>();
  const storages = project.storages ?? [];
  if (storages.length === 0) {
    return roles;
  }

  const hasIn = new Set<string>();
  const hasOut = new Set<string>();
  const ids = new Set(storages.map((storage) => storage.id));
  for (const edge of project.edges) {
    if (ids.has(edge.target)) {
      hasIn.add(edge.target);
    }
    if (ids.has(edge.source)) {
      hasOut.add(edge.source);
    }
  }

  for (const storage of storages) {
    roles.set(storage.id, storageRoleFor(storage, hasIn.has(storage.id), hasOut.has(storage.id), project.poolMode === true));
  }
  return roles;
}

/**
 * One drawer's role from what is wired to it. In POOL MODE a drawer with no
 * wires still has a job if it says which side of the pool it sits on: the
 * pool expansion wires it in, and the card should wear that role before
 * the solve has run. Shared with the card, which reads its own wires.
 */
export function storageRoleFor(
  storage: Pick<FactoryStorage, "drainMode" | "poolSide" | "targetPerSecond">,
  fed: boolean,
  drawn: boolean,
  poolMode: boolean,
): StorageRole {
  const drainRole = (): StorageRole =>
    storage.drainMode === "byproduct" ? "byproduct" : storage.drainMode === "trash" ? "trash" : "product";
  if (poolMode) {
    const side = poolSideOf(storage, fed, drawn);
    return side === "source" ? "source" : side === "drain" ? drainRole() : "idle";
  }
  if (fed) {
    return drawn ? "buffer" : drainRole();
  }
  if (drawn) {
    return "source";
  }
  // Unwired, but declared in pool mode: it stays the product (or source) it
  // was made as, a lingering drawer rather than a blank one, until a wire
  // says otherwise.
  if ((storage.targetPerSecond ?? 0) < 0) return "source";
  if (storage.poolSide === "drain") {
    return drainRole();
  }
  if (storage.poolSide === "source") {
    return "source";
  }
  return "idle";
}

/**
 * Which side of the POOL a drawer sits on. Pool mode ignores wires, but saved
 * wires still say what the drawer was FOR: fed only, a drain (product); drawn
 * only, a source. A negative target or declared `poolSide` wins. A buffer
 * (both) or a drawer with neither has no side (the pool is the buffer) and
 * stays idle.
 */
export function poolSideOf(
  storage: Pick<FactoryStorage, "poolSide" | "targetPerSecond">,
  fed: boolean,
  drawn: boolean,
): "source" | "drain" | undefined {
  if ((storage.targetPerSecond ?? 0) < 0) return "source";
  if (storage.poolSide) {
    return storage.poolSide;
  }
  if (fed && !drawn) {
    return "drain";
  }
  if (drawn && !fed) {
    return "source";
  }
  return undefined;
}

/**
 * A drawer's name as the rest of the UI should say it: the item, then its
 * role. Never a flat "(buffer)": a source is the opposite of a buffer.
 */
export function describeStorage(
  storage: { displayName?: string; resourceId: string },
  role: StorageRole | undefined,
): string {
  const name = storage.displayName ?? storage.resourceId;
  return role && role !== "idle" ? `${name} (${role})` : name;
}

/** One drawer's role. Prefer `getStorageRoles` when asking about several. */
export function getStorageRole(project: FactoryProject, storageId: string): StorageRole {
  return getStorageRoles(project).get(storageId) ?? "idle";
}

/** Solve balances intermediate drawers unless storage/ratio behavior was explicitly chosen. */
export function effectiveBufferMode(storage: Pick<FactoryStorage, "bufferMode">, solveMode: boolean): StorageBufferMode {
  return storage.bufferMode ?? (solveMode ? "strict" : "overflow");
}
