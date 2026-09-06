import { isRecipeInputConsumed, makeResourceKey } from "../model/resources";
import { applyRecipeInputOverrides } from "../model/recipe-input-overrides";
import { applyMachineHandlerToRecipe } from "../model/recipe-rules";
import { poolSideOf } from "../model/storage-role";
import type { FactoryProject, FactoryStorage, ResourceKey, ResourceKind } from "../model/types";
import { getRuntimeCalculationOutputs } from "./runtime-calculation";

/**
 * POOL MODE: one shared pool per resource, no wires needed.
 *
 * The board is read as a bill of machines rather than a drawing: whatever
 * any machine makes goes into its resource's pool, whatever any machine
 * needs comes out of it, and the surplus banks. The pool is realised as
 * ordinary drawers and ordinary wires inside the solve, so every rule the
 * books already have - conservation, fairness, recycle-before-import,
 * banking - applies unchanged. Nothing here is new physics.
 *
 * Per resource key, exactly one hidden drawer (`pool:<key>`):
 *
 * - every enabled machine OUTPUT of that resource wires INTO it, and every
 *   consumed machine INPUT wires OUT of it. The wires the player drew are
 *   DROPPED (Jack, 2026-09-05): they mean nothing in this mode, the board
 *   fades them out, and they come back untouched when the mode goes off;
 * - a player's SOURCE drawer of that resource wires into it too: the
 *   plan's declared import. A drawer's side is `poolSide` when set, else
 *   what its (now ignored) wires said it was for - see `poolSideOf`;
 * - a player's DRAIN drawer wires out of it: the plan's declared product,
 *   byproduct or trash.
 *
 * Roles then fall out of the wiring the way they do everywhere else. A pool
 * with feeders and takers is an overflow BUFFER, which passes on what its
 * takers pull and banks the rest (the visible +N/s surplus). A pool with
 * feeders only is a PRODUCT drain: what the plan puts out, the free
 * outputs rule for that one resource. A pool with takers and no feeder at
 * all is NOT created: a resource nobody makes and no source declares stays
 * short, and its takers say so - creating the drawer would make it a
 * SOURCE, which invents things from nothing.
 *
 * The hidden drawers and wires never reach the board. They ride the solve
 * result (edge and storage figures keyed by their ids) so the cards' rails
 * can read the pool's answer, and every diagnosis that walks the graph is
 * handed this expansion instead of the drawn one.
 */
export const POOL_STORAGE_PREFIX = "pool:";
export const POOL_EDGE_PREFIX = "pool-edge:";

export function isPoolStorageId(id: string): boolean {
  return id.startsWith(POOL_STORAGE_PREFIX);
}

export function isPoolEdgeId(id: string): boolean {
  return id.startsWith(POOL_EDGE_PREFIX);
}

interface PoolExpansion {
  project: FactoryProject;
  hiddenStorageIds: string[];
  hiddenEdgeIds: string[];
}

const expansionCache = new WeakMap<FactoryProject, PoolExpansion>();

/** The graph the solve and the diagnoses read: expanded in pool mode, the plan itself otherwise. */
export function getPoolProject(project: FactoryProject): FactoryProject {
  return project.poolMode ? expandPool(project).project : project;
}

export function expandPool(project: FactoryProject): PoolExpansion {
  if (!project.poolMode) {
    return { project, hiddenStorageIds: [], hiddenEdgeIds: [] };
  }
  const cached = expansionCache.get(project);
  if (cached) {
    return cached;
  }

  const recipesById = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  const storageIds = new Set((project.storages ?? []).map((storage) => storage.id));
  const wiredIn = new Set<string>();
  const wiredOut = new Set<string>();
  for (const edge of project.edges) {
    wiredIn.add(edge.target);
    wiredOut.add(edge.source);
  }

  interface PoolSide {
    kind: ResourceKind;
    resourceId: string;
    feeders: Array<{ id: string; storage: boolean }>;
    takers: Array<{ id: string; storage: boolean }>;
  }
  const pools = new Map<ResourceKey, PoolSide>();
  const poolFor = (kind: ResourceKind, resourceId: string): PoolSide => {
    const key = makeResourceKey(kind, resourceId);
    let pool = pools.get(key);
    if (!pool) {
      pool = { kind, resourceId, feeders: [], takers: [] };
      pools.set(key, pool);
    }
    return pool;
  };

  for (const node of project.nodes) {
    if (node.enabled === false) {
      continue;
    }
    const recipe = recipesById.get(node.recipeId);
    if (!recipe) {
      continue;
    }
    // The node's REAL ports (concrete oredict picks, handler and runtime
    // variants), exactly as closeBoundaries reads them: a pool wire on a
    // port the solve does not have is an edge the solve drops.
    const nodeRecipe = applyRecipeInputOverrides(recipe, node);
    const effectiveRecipe = applyMachineHandlerToRecipe(nodeRecipe, node);
    const outputs = getRuntimeCalculationOutputs(effectiveRecipe, node) ?? effectiveRecipe.outputs;
    const seenIn = new Set<ResourceKey>();
    for (const input of nodeRecipe.inputs) {
      if (!isRecipeInputConsumed(input) || (input.amount ?? 0) <= 0) {
        continue;
      }
      const key = makeResourceKey(input.kind, input.id);
      if (seenIn.has(key)) {
        continue;
      }
      seenIn.add(key);
      poolFor(input.kind, input.id).takers.push({ id: node.id, storage: false });
    }
    const seenOut = new Set<ResourceKey>();
    for (const output of outputs) {
      // EU is not pooled: unbanked power dissipates in game, and the power
      // sector already has its own wires and drawers for it.
      if ((output.amount ?? 0) <= 0 || output.kind === "power") {
        continue;
      }
      const key = makeResourceKey(output.kind, output.id);
      if (seenOut.has(key)) {
        continue;
      }
      seenOut.add(key);
      poolFor(output.kind, output.id).feeders.push({ id: node.id, storage: false });
    }
  }

  for (const storage of project.storages ?? []) {
    // WIRES DO NOT EXIST in pool mode, but the ones drawn before the switch
    // still say what a drawer was for (poolSideOf): fed only, a product;
    // drawn only, a source. A declared side wins; a buffer has no side.
    const side = poolSideOf(storage, wiredIn.has(storage.id), wiredOut.has(storage.id));
    if (side === "source") {
      poolFor(storage.kind, storage.resourceId).feeders.push({ id: storage.id, storage: true });
    } else if (side === "drain") {
      poolFor(storage.kind, storage.resourceId).takers.push({ id: storage.id, storage: true });
    }
  }

  const storages: FactoryStorage[] = [...(project.storages ?? [])];
  // The drawn wires are dropped whole: the pool is the only carrier here,
  // and a wire kept beside it would be a second route saying the same thing.
  const edges: FactoryProject["edges"] = [];
  const hiddenStorageIds: string[] = [];
  const hiddenEdgeIds: string[] = [];
  const keys = [...pools.keys()].sort();
  for (const key of keys) {
    const pool = pools.get(key)!;
    if (pool.feeders.length === 0) {
      // Nobody makes it and nobody declares it: stays short, by design.
      continue;
    }
    let poolId = `${POOL_STORAGE_PREFIX}${key}`;
    while (storageIds.has(poolId)) {
      poolId = `${poolId}:`;
    }
    storageIds.add(poolId);
    hiddenStorageIds.push(poolId);
    // With takers this is an overflow buffer; without, a PRODUCT drain:
    // what the plan puts out. Product rather than byproduct on purpose -
    // a byproduct asks for nothing, and a machine whose only outlet asks
    // for nothing reads "on demand" when it is really short of an input.
    storages.push({
      id: poolId,
      kind: pool.kind,
      resourceId: pool.resourceId,
      position: { x: 0, y: 0 },
    });
    for (const feeder of pool.feeders) {
      const id = `${POOL_EDGE_PREFIX}in:${feeder.id}:${key}`;
      hiddenEdgeIds.push(id);
      edges.push({
        id,
        source: feeder.id,
        target: poolId,
        resourceKind: pool.kind,
        resourceId: pool.resourceId,
      });
    }
    for (const taker of pool.takers) {
      const id = `${POOL_EDGE_PREFIX}out:${taker.id}:${key}`;
      hiddenEdgeIds.push(id);
      edges.push({
        id,
        source: poolId,
        target: taker.id,
        resourceKind: pool.kind,
        resourceId: pool.resourceId,
      });
    }
  }

  const expansion: PoolExpansion = {
    project: { ...project, storages, edges },
    hiddenStorageIds,
    hiddenEdgeIds,
  };
  expansionCache.set(project, expansion);
  // The expanded plan still says poolMode, and it is what the solver hands
  // on to every diagnosis: asking to expand it again must answer with
  // itself, never pool the pools.
  expansionCache.set(expansion.project, expansion);
  return expansion;
}
