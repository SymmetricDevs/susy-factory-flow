import type { FactoryProject, ResourceKey } from "@/lib/model/types";
import { makeResourceKey } from "@/lib/model/resources";
import { getStorageRoles } from "@/lib/model/storage-role";
import { collectTrashNodeIds } from "@/lib/model/trash";
import { calculateThroughput } from "@/lib/solver/throughput";
import { getCompatibleOutputFlow, getEdgeTargetDemandKey } from "@/lib/solver/equilibrium";

/**
 * The truth machine: a tick simulation of the board with virtual machines and
 * finite virtual buffers, run until the rates stop moving. It answers "what
 * does the game literally do with this board?" for tests, independently of
 * the solver.
 *
 * It reuses the app's machine math (nameplate op rates and per-op amounts
 * from `calculateThroughput`'s node results), so overclocks, parallels,
 * machine effects and chanced outputs (as expected values) match the planner.
 * What it adds is buffers: a machine crafts in WHOLE operations, holds small
 * input and output hoppers, stalls when the output hopper is full and starves
 * when the input hopper is empty, which is how clogs and shortages propagate
 * in game.
 *
 * Modelling choices:
 * - Every input hopper starts PRIMED with one craft's worth, the simulator's
 *   version of the player kick-starting a loop. A loop that conserves its
 *   goods keeps circulating them; a lossy loop burns the prime and dies.
 * - A SOURCE drawer supplies without limit; PRODUCT/BYPRODUCT drawers and
 *   trash absorb without limit; an overflow BUFFER is a very large chest; a
 *   STRICT buffer holds nothing (pure relay - material moves through it only
 *   when the far side has room that same tick).
 * - Contended transfers split by equal shares with re-offer, matching the
 *   solver's fairness rule.
 */

export interface SimulationResult {
  /** Long-run operations per second, per machine node. */
  opsPerSecond: Record<string, number>;
  /** opsPerSecond over the machine's nameplate rate, clamped to [0, 1]. */
  utilization: Record<string, number>;
  /** Long-run resource per second carried by each wire. */
  edgeFlowPerSecond: Record<string, number>;
  /** True when the two halves of the measuring window agreed within tolerance. */
  settled: boolean;
  simulatedSeconds: number;
  /** Why each idle machine was idle at the final tick: the first starved
   * input or the first full output, for reading a dead board's story. */
  stalls: Record<string, string>;
}

export interface SimulationOptions {
  /** Seconds of warmup before measuring begins. */
  warmupSeconds?: number;
  /** Seconds measured; the window's two halves must agree to count as settled. */
  measureSeconds?: number;
  /** Input/output hopper size, in whole crafts. Two matches a GT bus queue. */
  hopperCrafts?: number;
  /** Crafts of material seeded into every input hopper: the player priming
   * the loops. A conserving ring circulates exactly what it was primed with,
   * so its level is prime-dependent BY GAME PHYSICS; the equations report
   * the ceiling a sufficient prime reaches. */
  primeCrafts?: number;
  /** Relative disagreement between window halves that still counts as settled. */
  settleTolerance?: number;
}

const TICKS_PER_SECOND = 20;

interface Hopper {
  amount: number;
  capacity: number;
}

interface SimMachine {
  id: string;
  opsPerTick: number;
  /** Per-op consumption by resource key. */
  eats: Map<ResourceKey, number>;
  /** Per-op production by resource key. */
  makes: Map<ResourceKey, number>;
  inputs: Map<ResourceKey, Hopper>;
  outputs: Map<ResourceKey, Hopper>;
  /** Progress of the op in flight, in ops; NaN when idle. */
  progress: number;
  /** Finished ops waiting for output room (the machine is CLOGGED). */
  pendingEmit: boolean;
  completedOps: number;
}

interface SimEndpoint {
  kind: "machine-out" | "machine-in" | "source" | "sink" | "chest";
  machine?: SimMachine;
  chest?: Hopper;
}

interface SimEdge {
  id: string;
  /** The hopper key on each side: a wire's own resource id may differ from
   * the port it lands on (oredict overrides, effective resources), so each
   * side is resolved with the solver's own matching helpers. */
  fromKey: ResourceKey;
  toKey: ResourceKey;
  from: SimEndpoint;
  to: SimEndpoint;
  moved: number;
}

/** Equal shares with re-offer: the solver's fairness rule, reused verbatim. */
function fairShares(total: number, wants: number[]): number[] {
  const shares = wants.map(() => 0);
  let remaining = total;
  let hungry = wants.map((want, index) => ({ want, index })).filter((w) => w.want > 0);
  while (remaining > 1e-12 && hungry.length > 0) {
    const per = remaining / hungry.length;
    const stillHungry: typeof hungry = [];
    for (const h of hungry) {
      const take = Math.min(h.want - shares[h.index]!, per);
      shares[h.index] = shares[h.index]! + take;
      remaining -= take;
      if (shares[h.index]! < h.want - 1e-12) {
        stillHungry.push(h);
      }
    }
    if (stillHungry.length === hungry.length && per <= 1e-15) {
      break;
    }
    hungry = stillHungry;
  }
  return shares;
}

export function simulateSteadyState(
  project: FactoryProject,
  options: SimulationOptions = {},
): SimulationResult {
  const warmupSeconds = options.warmupSeconds ?? 600;
  const measureSeconds = options.measureSeconds ?? 600;
  const hopperCrafts = options.hopperCrafts ?? 2;
  const primeCrafts = Math.min(options.primeCrafts ?? 1, hopperCrafts);
  const settleTolerance = options.settleTolerance ?? 0.02;

  // Nameplates from the planner's own machine math - one source of truth.
  const nameplates = calculateThroughput(project, { generatedAt: "simulator" });

  const machines = new Map<string, SimMachine>();
  for (const node of project.nodes) {
    const report = nameplates.nodes[node.id];
    if (!report || !node.enabled || report.status === "missing-recipe") {
      continue;
    }
    const opsPerSecond = report.operationRatePerSecond;
    if (!(opsPerSecond > 0)) {
      continue;
    }
    const eats = new Map<ResourceKey, number>();
    const makes = new Map<ResourceKey, number>();
    const inputs = new Map<ResourceKey, Hopper>();
    const outputs = new Map<ResourceKey, Hopper>();
    for (const [key, flow] of Object.entries(report.inputs)) {
      const perOp = flow.amountPerSecond / opsPerSecond;
      eats.set(key as ResourceKey, perOp);
      // Primed with primeCrafts: the player's kick-start, see the header note.
      inputs.set(key as ResourceKey, { amount: perOp * primeCrafts, capacity: perOp * hopperCrafts });
    }
    for (const [key, flow] of Object.entries(report.outputs)) {
      const perOp = flow.amountPerSecond / opsPerSecond;
      makes.set(key as ResourceKey, perOp);
      outputs.set(key as ResourceKey, { amount: 0, capacity: perOp * hopperCrafts });
    }
    machines.set(node.id, {
      id: node.id,
      opsPerTick: opsPerSecond / TICKS_PER_SECOND,
      eats,
      makes,
      inputs,
      outputs,
      progress: Number.NaN,
      pendingEmit: false,
      completedOps: 0,
    });
  }

  const roles = getStorageRoles(project);
  const trashIds = collectTrashNodeIds(project);
  const chests = new Map<string, Hopper>();
  const storagesById = new Map((project.storages ?? []).map((s) => [s.id, s]));

  const endpoint = (
    nodeId: string,
    edge: FactoryProject["edges"][number],
    side: "from" | "to",
  ): { point: SimEndpoint; key: ResourceKey } | undefined => {
    const wireKey = makeResourceKey(edge.resourceKind, edge.resourceId);
    const machine = machines.get(nodeId);
    if (machine) {
      // The wire's id may not literally match the port's: resolve with the
      // solver's own matching (oredict membership, effective resources).
      if (side === "from") {
        const flow = getCompatibleOutputFlow(nameplates.nodes[nodeId], edge);
        const key = flow ? makeResourceKey(flow.kind, flow.resourceId) : wireKey;
        return machine.outputs.has(key)
          ? { point: { kind: "machine-out", machine }, key }
          : undefined;
      }
      const key = getEdgeTargetDemandKey(project, edge) ?? wireKey;
      return machine.inputs.has(key)
        ? { point: { kind: "machine-in", machine }, key }
        : undefined;
    }
    if (trashIds.has(nodeId)) {
      return { point: { kind: "sink" }, key: wireKey };
    }
    const storage = storagesById.get(nodeId);
    if (!storage) {
      return undefined;
    }
    const role = roles.get(nodeId);
    if (role === "source") {
      return { point: { kind: "source" }, key: wireKey };
    }
    if (role === "product" || role === "byproduct") {
      return { point: { kind: "sink" }, key: wireKey };
    }
    // A buffer: an overflow buffer is a very large chest, a strict one holds
    // nothing and only relays what the far side can take this tick.
    let chest = chests.get(nodeId);
    if (!chest) {
      const strict = storage.bufferMode === "strict";
      chest = { amount: 0, capacity: strict ? 0 : Number.POSITIVE_INFINITY };
      chests.set(nodeId, chest);
    }
    return { point: { kind: "chest", chest }, key: wireKey };
  };

  const edges: SimEdge[] = [];
  for (const edge of [...project.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const from = endpoint(edge.source, edge, "from");
    const to = endpoint(edge.target, edge, "to");
    if (!from || !to || from.point.kind === "sink" || to.point.kind === "source") {
      continue;
    }
    edges.push({
      id: edge.id,
      fromKey: from.key,
      toKey: to.key,
      from: from.point,
      to: to.point,
      moved: 0,
    });
  }

  // Transfers grouped by their supplying hopper, so contention splits fairly.
  const bySupplier = new Map<unknown, SimEdge[]>();
  for (const edge of edges) {
    const supplier =
      edge.from.kind === "machine-out"
        ? edge.from.machine!.outputs.get(edge.fromKey)
        : edge.from.kind === "chest"
          ? edge.from.chest
          : `source:${edge.id}`;
    const group = bySupplier.get(supplier);
    if (group) {
      group.push(edge);
    } else {
      bySupplier.set(supplier, [edge]);
    }
  }

  const roomAt = (edge: SimEdge): number => {
    if (edge.to.kind === "sink") {
      return Number.POSITIVE_INFINITY;
    }
    if (edge.to.kind === "chest") {
      const chest = edge.to.chest!;
      return chest.capacity - chest.amount;
    }
    const hopper = edge.to.machine!.inputs.get(edge.toKey)!;
    return hopper.capacity - hopper.amount;
  };

  const deposit = (edge: SimEdge, amount: number) => {
    if (amount <= 0) {
      return;
    }
    edge.moved += amount;
    if (edge.to.kind === "chest") {
      edge.to.chest!.amount += amount;
    } else if (edge.to.kind === "machine-in") {
      const hopper = edge.to.machine!.inputs.get(edge.toKey)!;
      hopper.amount += amount;
    }
  };

  const runTicks = (ticks: number) => {
    for (let tick = 0; tick < ticks; tick += 1) {
      // Transfer phase: every supplying hopper offers what it holds (sources
      // offer without limit), split across its wires by fair shares of the
      // room on the far side.
      for (const [supplier, group] of bySupplier) {
        const available =
          typeof supplier === "string"
            ? Number.POSITIVE_INFINITY
            : (supplier as Hopper).amount;
        if (available <= 0) {
          continue;
        }
        const wants = group.map((edge) => roomAt(edge));
        const finiteWants = wants.map((w) => (Number.isFinite(w) ? w : Number.MAX_SAFE_INTEGER));
        const shares = Number.isFinite(available)
          ? fairShares(available, finiteWants)
          : finiteWants;
        let movedTotal = 0;
        group.forEach((edge, index) => {
          const amount = Math.min(shares[index]!, wants[index]!);
          deposit(edge, amount);
          movedTotal += amount;
        });
        if (typeof supplier !== "string") {
          (supplier as Hopper).amount -= movedTotal;
        }
      }

      // Machine phase: finish ops (only when every output fits - a full
      // hopper is the clog), then start new ones (only when every input is
      // present - an empty hopper is the shortage).
      for (const machine of machines.values()) {
        let budget = machine.opsPerTick;
        while (budget > 0) {
          if (machine.pendingEmit) {
            let fits = true;
            for (const [key, perOp] of machine.makes) {
              const hopper = machine.outputs.get(key)!;
              if (hopper.amount + perOp > hopper.capacity + 1e-9) {
                fits = false;
                break;
              }
            }
            if (!fits) {
              break;
            }
            for (const [key, perOp] of machine.makes) {
              machine.outputs.get(key)!.amount += perOp;
            }
            machine.pendingEmit = false;
            machine.completedOps += 1;
          }
          if (Number.isNaN(machine.progress)) {
            let fed = true;
            for (const [key, perOp] of machine.eats) {
              if (machine.inputs.get(key)!.amount < perOp - 1e-9) {
                fed = false;
                break;
              }
            }
            if (!fed) {
              break;
            }
            for (const [key, perOp] of machine.eats) {
              machine.inputs.get(key)!.amount -= perOp;
            }
            machine.progress = 0;
          }
          const step = Math.min(budget, 1 - machine.progress);
          machine.progress += step;
          budget -= step;
          if (machine.progress >= 1 - 1e-9) {
            machine.progress = Number.NaN;
            machine.pendingEmit = true;
          }
        }
      }
    }
  };

  runTicks(Math.round(warmupSeconds * TICKS_PER_SECOND));

  const measureTicks = Math.round(measureSeconds * TICKS_PER_SECOND);
  const half = Math.floor(measureTicks / 2);

  const snapshotOps = () => new Map([...machines.values()].map((m) => [m.id, m.completedOps]));
  const snapshotMoved = () => new Map(edges.map((e) => [e.id, e.moved]));

  const opsAtStart = snapshotOps();
  const movedAtStart = snapshotMoved();
  runTicks(half);
  const opsAtHalf = snapshotOps();
  runTicks(measureTicks - half);
  const opsAtEnd = snapshotOps();
  const movedAtEnd = snapshotMoved();

  let settled = true;
  const opsPerSecond: Record<string, number> = {};
  const utilization: Record<string, number> = {};
  for (const machine of machines.values()) {
    const first = (opsAtHalf.get(machine.id)! - opsAtStart.get(machine.id)!) / (half / TICKS_PER_SECOND);
    const second =
      (opsAtEnd.get(machine.id)! - opsAtHalf.get(machine.id)!) /
      ((measureTicks - half) / TICKS_PER_SECOND);
    const rate = (first + second) / 2;
    const nameplate = machine.opsPerTick * TICKS_PER_SECOND;
    opsPerSecond[machine.id] = rate;
    utilization[machine.id] = Math.min(1, Math.max(0, rate / nameplate));
    const scale = Math.max(first, second, nameplate * 1e-6);
    if (Math.abs(first - second) > settleTolerance * scale) {
      settled = false;
    }
  }

  const edgeFlowPerSecond: Record<string, number> = {};
  for (const edge of edges) {
    edgeFlowPerSecond[edge.id] =
      (movedAtEnd.get(edge.id)! - (movedAtStart.get(edge.id) ?? 0)) / measureSeconds;
  }

  const stalls: Record<string, string> = {};
  for (const machine of machines.values()) {
    if (machine.pendingEmit) {
      for (const [key, perOp] of machine.makes) {
        const hopper = machine.outputs.get(key)!;
        if (hopper.amount + perOp > hopper.capacity + 1e-9) {
          stalls[machine.id] = `clogged: ${key} full`;
          break;
        }
      }
      continue;
    }
    if (Number.isNaN(machine.progress)) {
      for (const [key, perOp] of machine.eats) {
        if (machine.inputs.get(key)!.amount < perOp - 1e-9) {
          stalls[machine.id] = `starved: ${key} empty`;
          break;
        }
      }
    }
  }

  return {
    opsPerSecond,
    utilization,
    edgeFlowPerSecond,
    settled,
    simulatedSeconds: warmupSeconds + measureSeconds,
    stalls,
  };
}
