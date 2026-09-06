import type {
  ClogLock,
  ClogLockIndex,
  ClogLockVent,
  FactoryProject,
  ResourceKey,
  ThroughputResult,
} from "@/lib/model/types";
import { solveEquationsCore } from "@/lib/solver/equations-core";
import { getPoolProject } from "@/lib/solver/pool-mode";

/**
 * Clog locks: machines frozen at 0% because their surpluses have nowhere to
 * go and every escape route runs through another jammed member.
 *
 * The death spiral's mirror image. A spiral STARVES: the loop loses material
 * every lap, winds down, and every card sits empty. A clog lock CHOKES: the
 * loop makes MORE of some good than it can swallow, the spare piles up until
 * every buffer is full, and then nobody can run because nobody has room. In
 * game the line freezes with every slot stuffed - full inputs, full outputs,
 * no progress arrow - and pulling a stack out by hand buys seconds before it
 * jams again. The solver's zeros are that end state, reached instantly.
 *
 * Detection is a proof, not a guess: the board is re-solved once with every
 * wired output port allowed to shed surplus at a cost (the vent solve in
 * equations-core). Machines that come alive in that world were stopped by
 * nothing but the surplus, and the vents the solve could not avoid name the
 * exact wires a drawer or trash can would rescue. A starving ring stays dead
 * in the vented world too, so the two detectors can never claim the same
 * machines.
 */

const DEAD_EPSILON = 1e-4;
const REVIVED_EPSILON = 1e-3;

export type { ClogLock, ClogLockIndex, ClogLockVent };

const EMPTY_INDEX: ClogLockIndex = { byNode: new Map(), byEdge: new Map(), locks: [] };

// Keyed on object identity like the death-spiral index: the solver hands out
// a fresh result per solve, so a stale index cannot outlive its numbers.
const cache = new WeakMap<
  FactoryProject,
  { result: ThroughputResult | undefined; index: ClogLockIndex }
>();

export function findClogLocks(
  project: FactoryProject,
  result: ThroughputResult | undefined,
): ClogLockIndex {
  // Books solved off the main thread bring their own diagnosis (the solve
  // worker runs `attachClogLocks`); a placeholder wearing an older plan's
  // books wears its index too, which is as honest as the books themselves
  // and never freezes the tab on a proof it already has.
  if (result?.clogLocks) {
    return result.clogLocks;
  }
  const cached = cache.get(project);
  if (cached && cached.result === result) {
    return cached.index;
  }
  const index = build(project, result);
  cache.set(project, { result, index });
  return index;
}

/**
 * Runs the diagnosis where the books were solved and stores it on them, so
 * the board never re-proves a clog lock on the main thread. The mutation is
 * on a result no one has seen yet, before it leaves the worker.
 */
export function attachClogLocks(project: FactoryProject, result: ThroughputResult): void {
  result.clogLocks = build(project, result);
}

function build(project: FactoryProject, result: ThroughputResult | undefined): ClogLockIndex {
  if (!result) {
    return EMPTY_INDEX;
  }
  // Pool mode: the graph the solve ran on, pools and all.
  project = getPoolProject(project);
  // SOLVE MODE has no clog locks: machines at zero there are "not needed by
  // any typed amount", never "frozen by their own surplus" - and the vent
  // solve would burn a real LP diagnosing a build that is not on screen.
  // Silenced at the detector so notices, wire tints and verdicts all agree.
  if (project.solveMode) {
    return EMPTY_INDEX;
  }

  // The vent solve costs a real LP, so it only runs when the board shows the
  // symptom: an enabled machine at a dead stop. Healthy boards skip it.
  const frozen = new Set<string>();
  for (const node of project.nodes) {
    if (node.enabled === false) {
      continue;
    }
    const report = result.nodes[node.id];
    if (report && report.status !== "missing-recipe" && report.utilization <= DEAD_EPSILON) {
      frozen.add(node.id);
    }
  }
  if (frozen.size === 0) {
    return EMPTY_INDEX;
  }

  let vented = solveEquationsCore(project, result.nodes, undefined, undefined, {
    ventOutputs: true,
  });
  if (vented.status !== "optimal") {
    return EMPTY_INDEX;
  }

  // Revived: frozen in the books, running once surplus may leave. Stopped by
  // nothing but the jam.
  const reviveFrom = (world: typeof vented): Set<string> => {
    const alive = new Set<string>();
    for (const id of frozen) {
      if ((world.utilization.get(id) ?? 0) > REVIVED_EPSILON) {
        alive.add(id);
      }
    }
    return alive;
  };
  let revived = reviveFrom(vented);
  if (revived.size === 0) {
    return EMPTY_INDEX;
  }

  // A surplus is only "spare" when its takers are RUNNING and still cannot
  // swallow it. A port whose every taker is dead even in the vented world -
  // where nothing is ever clogged, so a zero can only mean no power, a bare
  // slot, or starvation through a chain of the same - is not choking on a
  // surplus: it is waiting on a machine the player has not finished. Those
  // vents are withdrawn and the world re-solved, and since withdrawing one
  // can kill the machine behind it (its only outlet was the dead taker),
  // the sweep repeats until nothing more falls. What survives is a jam the
  // running machines hold on each other, the only thing a drawer fixes.
  const storageIds = new Set((project.storages ?? []).map((storage) => storage.id));
  const outgoingBy = new Map<string, FactoryProject["edges"]>();
  for (const edge of project.edges) {
    outgoingBy.set(edge.source, [...(outgoingBy.get(edge.source) ?? []), edge]);
  }
  const machineTakers = (nodeId: string, resourceKey: ResourceKey): Set<string> => {
    const takers = new Set<string>();
    const seen = new Set<string>();
    const walk = (id: string, key: ResourceKey | undefined) => {
      for (const edge of outgoingBy.get(id) ?? []) {
        if (key !== undefined && `${edge.resourceKind}:${edge.resourceId}` !== key) {
          continue;
        }
        if (storageIds.has(edge.target)) {
          // A drawer passes the question on to whoever draws from it.
          if (!seen.has(edge.target)) {
            seen.add(edge.target);
            walk(edge.target, undefined);
          }
        } else {
          takers.add(edge.target);
        }
      }
    };
    walk(nodeId, resourceKey);
    return takers;
  };
  let ventable: Set<string> | undefined;
  for (let sweep = 0; sweep < 64; sweep += 1) {
    const withdrawn: string[] = [];
    for (const [nodeId, byKey] of vented.ventPerSecond ?? []) {
      for (const key of byKey.keys()) {
        const takers = machineTakers(nodeId, key);
        if (takers.size === 0) {
          continue;
        }
        let anyAlive = false;
        for (const taker of takers) {
          if ((vented.utilization.get(taker) ?? 0) > REVIVED_EPSILON) {
            anyAlive = true;
            break;
          }
        }
        if (!anyAlive) {
          withdrawn.push(`${nodeId}|${key}`);
        }
      }
    }
    if (withdrawn.length === 0) {
      break;
    }
    if (ventable === undefined) {
      ventable = new Set<string>();
      for (const node of project.nodes) {
        const report = result.nodes[node.id];
        for (const key of Object.keys(report?.outputs ?? {})) {
          ventable.add(`${node.id}|${key}`);
        }
      }
    }
    for (const port of withdrawn) {
      ventable.delete(port);
    }
    const narrowed = solveEquationsCore(project, result.nodes, undefined, undefined, {
      ventOutputs: true,
      ventPorts: ventable,
    });
    if (narrowed.status !== "optimal") {
      return EMPTY_INDEX;
    }
    vented = narrowed;
    revived = reviveFrom(vented);
    if (revived.size === 0) {
      return EMPTY_INDEX;
    }
  }

  // The full-throttle solve vents EVERY ratio mismatch on the line, but most
  // of those are consequences, not causes: once the true jam has its drawer
  // the machine behind them just throttles, an ordinary clog. So each
  // candidate is withheld in turn (smallest first) and the board re-solved
  // with every revived machine required to keep running; a candidate the
  // board runs without is not part of the lock and is dropped. What survives
  // is the minimal set of wires that genuinely need a drawer.
  {
    const candidates = [...(vented.ventPerSecond?.entries() ?? [])]
      .filter(([nodeId]) => revived.has(nodeId))
      .flatMap(([nodeId, byKey]) => [...byKey.entries()].map(([key, perSecond]) => ({
        port: `${nodeId}|${key}`,
        perSecond,
      })))
      .sort((left, right) => left.perSecond - right.perSecond);
    const keep = new Set(candidates.map((candidate) => candidate.port));
    const mustRun = [...revived];
    for (const candidate of candidates) {
      if (keep.size <= 1) {
        break;
      }
      keep.delete(candidate.port);
      const probe = solveEquationsCore(project, result.nodes, undefined, undefined, {
        ventOutputs: true,
        ventPorts: keep,
        requireRunning: mustRun,
      });
      if (probe.status !== "optimal") {
        keep.add(candidate.port);
      }
    }
    // Re-solve on the minimal set so the reported rates belong to the fix
    // the copy actually recommends.
    const minimal = solveEquationsCore(project, result.nodes, undefined, undefined, {
      ventOutputs: true,
      ventPorts: keep,
      requireRunning: mustRun,
    });
    if (minimal.status === "optimal") {
      vented = minimal;
    }
  }

  // One lock per connected group of revived machines, drawers riding along
  // as pass-through hops, exactly as the death spiral walks its rings.
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let bucket = adjacency.get(a);
    if (!bucket) {
      bucket = new Set();
      adjacency.set(a, bucket);
    }
    bucket.add(b);
  };
  const inGraph = (id: string) => revived.has(id) || storageIds.has(id);
  for (const edge of project.edges) {
    if (inGraph(edge.source) && inGraph(edge.target)) {
      link(edge.source, edge.target);
      link(edge.target, edge.source);
    }
  }

  const byNode = new Map<string, ClogLock>();
  const byEdge = new Map<string, ClogLock>();
  const locks: ClogLock[] = [];
  const visited = new Set<string>();
  for (const seed of revived) {
    if (visited.has(seed)) {
      continue;
    }
    const component = new Set<string>();
    const queue = [seed];
    visited.add(seed);
    while (queue.length > 0) {
      const id = queue.pop()!;
      component.add(id);
      for (const next of adjacency.get(id) ?? []) {
        // Drawers connect members but never pull outsiders in: only walk on
        // through a drawer when a revived machine sits on its far side.
        if (!visited.has(next) && inGraph(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    const machineIds = [...component].filter((id) => revived.has(id)).sort();
    if (machineIds.length === 0) {
      continue;
    }
    // Drawers count as members when they sit between two members, so the
    // group and its "Show me" hold together across pass-through tanks.
    const memberSet = new Set(machineIds);
    const passThrough = new Set<string>();
    for (const edge of project.edges) {
      if (memberSet.has(edge.source) && storageIds.has(edge.target) && component.has(edge.target)) {
        passThrough.add(edge.target);
      }
      if (memberSet.has(edge.target) && storageIds.has(edge.source) && component.has(edge.source)) {
        passThrough.add(edge.source);
      }
    }

    const nodeById = new Map(project.nodes.map((entry) => [entry.id, entry]));
    const recipeById = new Map(project.recipes.map((entry) => [entry.id, entry]));
    const vents: ClogLockVent[] = [];
    for (const id of machineIds) {
      const byKey = vented.ventPerSecond?.get(id);
      if (!byKey) {
        continue;
      }
      const recipe = recipeById.get(nodeById.get(id)?.recipeId ?? "");
      const machineName = recipe?.name ?? recipe?.machineType ?? "a machine";
      for (const [resourceKey, perSecond] of byKey) {
        const resourceName =
          result.nodes[id]?.outputs[resourceKey]?.displayName ?? resourceKey.split(":").pop()!;
        vents.push({ nodeId: id, machineName, resourceKey, resourceName, perSecond });
      }
    }
    vents.sort((left, right) => right.perSecond - left.perSecond);
    // No vent inside the group means the jam is not this group's own doing
    // (its surplus problem lives elsewhere on the board); stay silent rather
    // than mark cards with no fix to offer.
    if (vents.length === 0) {
      continue;
    }

    // Only the vent sites and their surplus wires get marked. A jam can hold
    // half a board, and flashing every member painted whole plans blue with
    // nothing to point at; the drawer goes on THESE wires, so these carry
    // the light. Order follows the vents (worst surplus first), never the
    // node ids - "Show me" walks this list, and it must land on the machine
    // the notice is talking about.
    const ventNodeIds = [...new Set(vents.map((vent) => vent.nodeId))];
    const ventPorts = new Set(vents.map((vent) => `${vent.nodeId}|${vent.resourceKey}`));
    const edgeIds: string[] = [];
    for (const edge of project.edges) {
      if (ventPorts.has(`${edge.source}|${edge.resourceKind}:${edge.resourceId}`)) {
        edgeIds.push(edge.id);
      }
    }

    const lock: ClogLock = {
      id: machineIds[0]!,
      nodeIds: [...machineIds, ...passThrough].sort(),
      machineIds,
      ventNodeIds,
      edgeIds,
      vents,
    };
    locks.push(lock);
    for (const id of lock.nodeIds) {
      byNode.set(id, lock);
    }
    for (const id of edgeIds) {
      byEdge.set(id, lock);
    }
  }

  locks.sort((left, right) => right.machineIds.length - left.machineIds.length);
  return { byNode, byEdge, locks };
}

/**
 * The card-level story, split by role. A vent site speaks in the first
 * person: YOUR spare has nowhere to go, here is the rate, wire it to a
 * drawer. A victim says why it is at 0% and names the machine to go fix,
 * because "clog lock" on twenty cards with one generic sentence left the
 * player knowing the disease but not the address.
 */
export function describeClogLockForNode(
  lock: ClogLock,
  nodeId: string,
): { title: string; detail: string } {
  const own = lock.vents.filter((vent) => vent.nodeId === nodeId);
  if (own.length > 0) {
    const list = own
      .map((vent) => `${vent.resourceName} (about ${formatRate(vent.perSecond)}/s)`)
      .join(" and ");
    return {
      title: `Spare ${own[0]!.resourceName} has nowhere to go`,
      detail: `${list} needs a home. Wire it to a drawer or a trash can and the ${lock.machineIds.length} frozen machines run.`,
    };
  }
  const vent = lock.vents[0]!;
  return {
    title: "Frozen by a clog lock",
    detail: `The line's spare ${vent.resourceName} has nowhere to go, and the jam holds all ${lock.machineIds.length} machines at 0%. Fix it at ${vent.machineName}: wire ${vent.resourceName} to a drawer there.`,
  };
}

function formatRate(perSecond: number): string {
  if (perSecond >= 10) {
    return Math.round(perSecond).toString();
  }
  return perSecond.toFixed(perSecond >= 1 ? 1 : 2);
}

/** One place turns numbers into copy, like describeDeathSpiral next door. */
export function describeClogLock(lock: ClogLock): {
  title: string;
  /** One line, for the board notice. The long version lives on the cards. */
  short: string;
  what: string;
  why: string;
  fix: string;
} {
  const count = lock.machineIds.length;
  const vent = lock.vents[0]!;
  // Every surplus in THIS lock, by name and rate - these are the necessary
  // ones, proven by the necessity probes, so the list is the whole fix.
  const list = lock.vents
    .map((entry) => `${entry.resourceName} (about ${formatRate(entry.perSecond)}/s)`)
    .join(", ");
  const spares =
    lock.vents.length === 1 ? `spare ${vent.resourceName}` : `spare ${vent.resourceName} and ${lock.vents.length - 1} more`;

  return {
    title: count === 1 ? "This machine is choking on its own surplus" : "These machines are choking on a surplus",
    short:
      count === 1
        ? `A machine stopped because its ${spares} has nowhere to go.`
        : `${count} machines stopped because ${spares} has nowhere to go.`,
    what: `${count === 1 ? "One machine" : `${count} machines`} sit at 0% with everything they need. The line makes more ${vent.resourceName} than it uses, and the spare has no drawer, no trash can and no consumer with room.`,
    why: "In game the spare piles up until every chest and slot on the line is full, and then nothing can run because nothing has room. Full inputs, full outputs, no progress: the opposite of starving. Taking a stack out by hand restarts it for a few seconds before it jams the same way again.",
    fix: `Give ${list} somewhere to go: a drawer or a trash can on each blue wire. That is the whole list for this jam; any other clogged card just paces down once these can leave.`,
  };
}
