import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type FactoryProject, type FactoryStorage } from "@/lib/model/types";
import { getStorageRoles } from "@/lib/model/storage-role";
import { calculateThroughput } from "./throughput";
import { expandPool, getPoolProject, isPoolStorageId } from "./pool-mode";
import { buildRailPorts, deriveNodeVerdict, findUnwiredNodeIds } from "@/components/flow/node-verdict";

/**
 * Pool mode's exam: a board with no wires at all, read as a bill of
 * machines. Whatever one makes, another may eat; what nobody makes stays
 * short; loose source and drain drawers are the declared imports and
 * products.
 */

function recipe(
  id: string,
  inputs: [string, number][],
  outputs: [string, number][],
  durationTicks = 20,
) {
  return {
    id,
    name: id,
    machineType: `${id} machine`,
    minimumTier: "LV",
    durationTicks,
    eut: 30,
    inputs: inputs.map(([itemId, amount]) => ({ kind: "item" as const, id: itemId, amount })),
    outputs: outputs.map(([itemId, amount]) => ({ kind: "item" as const, id: itemId, amount })),
  };
}

function node(id: string, recipeId: string, machineCount = 1) {
  return {
    id,
    recipeId,
    machineCount,
    parallel: 1,
    overclockTier: "LV",
    enabled: true,
    position: { x: 0, y: 0 },
  };
}

function drawer(id: string, resourceId: string, extra?: Partial<FactoryStorage>): FactoryStorage {
  return { id, kind: "item", resourceId, position: { x: 0, y: 0 }, ...extra };
}

function project(over: Partial<FactoryProject>): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "pool-exam",
    name: "pool-exam",
    recipes: [],
    nodes: [],
    edges: [],
    fuelProfiles: [],
    poolMode: true,
    ...over,
  } as FactoryProject;
}

const RECIPES = [
  recipe("quarry", [], [["cobble", 2]]),
  recipe("crush", [["cobble", 1]], [["gravel", 1]]),
  recipe("smelt", [["sand", 1]], [["glass", 1]]),
];

describe("pool mode", () => {
  it("feeds a consumer from a producer with no wire between them", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("q", "quarry"), node("c", "crush")],
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    // 2 cobble/s made, 1/s eaten: the crusher runs flat out and the quarry
    // too - a fed machine with somewhere to put its output never idles, and
    // the pool banks the spare cobble.
    expect(result.nodes["c"]!.utilization).toBeCloseTo(1, 4);
    expect(result.nodes["q"]!.utilization).toBeCloseTo(1, 4);
    const cobblePool = Object.values(result.storages).find(
      (entry) => isPoolStorageId(entry.storageId) && entry.resourceId === "cobble",
    );
    expect(cobblePool?.netPerSecond).toBeCloseTo(1, 4);
    expect(findUnwiredNodeIds(proj, result)).toEqual([]);
    expect(deriveNodeVerdict(proj, result, "c").kind).toBe("balanced");
  });

  it("is a plain unwired board with the mode off", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("q", "quarry"), node("c", "crush")],
      poolMode: undefined,
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["c"]!.utilization).toBeCloseTo(0, 4);
    expect(findUnwiredNodeIds(proj, result).sort()).toEqual(["c", "q"]);
  });

  it("splits a short pool fairly between two askers", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("q", "quarry"), node("c1", "crush", 2), node("c2", "crush", 2)],
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    // 2/s made, 4/s asked: half each.
    expect(result.nodes["c1"]!.utilization).toBeCloseTo(0.5, 3);
    expect(result.nodes["c2"]!.utilization).toBeCloseTo(0.5, 3);
    expect(deriveNodeVerdict(proj, result, "c1").kind).toBe("starved");
  });

  it("imports a resource nobody makes and lists it under inputs", () => {
    const proj = project({ recipes: RECIPES, nodes: [node("s", "smelt")] });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["s"]!.utilization).toBeCloseTo(1, 4);
    expect(findUnwiredNodeIds(proj, result)).toEqual([]);
    expect(deriveNodeVerdict(proj, result, "s").kind).toBe("balanced");
    const sand = result.externalInputs.find((entry) => entry.resourceId === "sand");
    expect(sand?.deficitPerSecond).toBeCloseTo(1, 4);
  });

  it("takes imports from a loose source drawer and products to a loose drain", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("s", "smelt")],
      storages: [
        drawer("sand-in", "sand", { poolSide: "source" }),
        drawer("glass-out", "glass", { poolSide: "drain" }),
      ],
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["s"]!.utilization).toBeCloseTo(1, 4);
    expect(result.storages["glass-out"]!.producedPerSecond).toBeCloseTo(1, 4);
    expect(result.storages["sand-in"]!.consumedPerSecond).toBeCloseTo(1, 4);
    const roles = getStorageRoles(proj);
    expect(roles.get("sand-in")).toBe("source");
    expect(roles.get("glass-out")).toBe("product");
    expect(deriveNodeVerdict(proj, result, "s").kind).toBe("balanced");
  });

  it("a loose drawer with no side declared is still idle", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("s", "smelt")],
      storages: [drawer("sand-in", "sand")],
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    // The pool imports the sand by itself; the drawer takes no part.
    expect(result.nodes["s"]!.utilization).toBeCloseTo(1, 4);
    expect(getStorageRoles(proj).get("sand-in")).toBe("idle");
    expect(result.storages["sand-in"]!.consumedPerSecond).toBeCloseTo(0, 4);
  });

  it("rails read the pool: the consumer's port is connected and fed", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("q", "quarry"), node("c", "crush")],
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    const verdict = deriveNodeVerdict(proj, result, "c");
    const rails = buildRailPorts(proj, result, "c", RECIPES[1]!, verdict);
    expect(rails.inputs[0]!.connected).toBe(true);
    expect(rails.inputs[0]!.unsupplied).toBe(false);
    expect(rails.inputs[0]!.currentPerSecond).toBeCloseTo(1, 4);
  });

  it("expands once: the expanded plan expands to itself", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("q", "quarry"), node("c", "crush")],
    });
    const expanded = getPoolProject(proj);
    expect(expanded).not.toBe(proj);
    expect(getPoolProject(expanded)).toBe(expanded);
    expect(expandPool(expanded).hiddenStorageIds).toEqual(expandPool(proj).hiddenStorageIds);
  });

  it("solve mode on top sizes the machines for a typed product", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("q", "quarry"), node("c", "crush")],
      storages: [drawer("gravel-out", "gravel", { poolSide: "drain", targetPerSecond: 4 })],
      solveMode: true,
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    // 4 gravel/s wants 4 crushers and 2 quarries.
    expect(result.nodes["c"]!.theoreticalMachinesRequired).toBeCloseTo(4, 3);
    expect(result.nodes["q"]!.theoreticalMachinesRequired).toBeCloseTo(2, 3);
  });

  it("ignores drawn wires: the pool is the only carrier", () => {
    // A wire that would starve the second crusher on a wired board (the
    // quarry wired to c1 alone) means nothing here: both drink from the pool.
    const proj = project({
      recipes: RECIPES,
      nodes: [node("q", "quarry"), node("c1", "crush"), node("c2", "crush")],
      edges: [{ id: "w", source: "q", target: "c1", resourceKind: "item", resourceId: "cobble" }],
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["c1"]!.utilization).toBeCloseTo(1, 4);
    expect(result.nodes["c2"]!.utilization).toBeCloseTo(1, 4);
    expect(result.edges["w"]).toBeUndefined();
    expect(getPoolProject(proj).edges.every((edge) => edge.id.startsWith("pool-edge:"))).toBe(true);
  });

  it("bridges a filled cell to its fluid at the Canner's ratio, from the fed side", () => {
    // A machine makes water CELLS, another drinks water FLUID: the pool
    // empties the cells for free at the stored litres-per-cell.
    const cell = {
      kind: "item" as const,
      id: "water_cell",
      amount: 1,
      displayName: "Water Cell",
      alternatives: [{ kind: "fluid" as const, id: "water", displayName: "Water", amount: 1000 }],
    };
    const proj = project({
      recipes: [
        { ...recipe("fill", [], [["x", 1]]), outputs: [cell] },
        { ...recipe("drink", [], [["steam", 1]]), inputs: [{ kind: "fluid", id: "water", amount: 500 }] },
      ],
      nodes: [node("f", "fill"), node("d", "drink")],
      poolCellRatios: { water_cell: 1000 },
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    // 1 cell/s = 1000 L/s made, 500 L/s drunk: the drinker runs full.
    expect(result.nodes["d"]!.utilization).toBeCloseTo(1, 4);
    expect(result.externalInputs.find((entry) => entry.resourceId === "water")).toBeUndefined();
    // The tank is a hidden helper: not in the result's nodes.
    expect(Object.keys(result.nodes).every((id) => !id.startsWith("pool-tank:"))).toBe(true);
  });

  it("does not bridge a pair without a ratio, and imports a form nobody makes", () => {
    const cell = {
      kind: "item" as const,
      id: "water_cell",
      amount: 1,
      displayName: "Water Cell",
      alternatives: [{ kind: "fluid" as const, id: "water", displayName: "Water", amount: 1000 }],
    };
    const noRatio = project({
      recipes: [
        { ...recipe("fill", [], [["x", 1]]), outputs: [cell] },
        { ...recipe("drink", [], [["steam", 1]]), inputs: [{ kind: "fluid", id: "water", amount: 500 }] },
      ],
      nodes: [node("f", "fill"), node("d", "drink")],
    });
    const result = calculateThroughput(noRatio, { generatedAt: "fixed" });
    // No ratio: the fluid is imported on its own, the cells ship as a product.
    expect(result.nodes["d"]!.utilization).toBeCloseTo(1, 4);
    expect(result.externalInputs.find((entry) => entry.resourceId === "water")?.deficitPerSecond).toBeCloseTo(500, 3);
    // Neither form made: both import, and no tank is built between them.
    const neither = project({
      recipes: [
        { ...recipe("eatcell", [], [["y", 1]]), inputs: [cell] },
        { ...recipe("drink", [], [["steam", 1]]), inputs: [{ kind: "fluid", id: "water", amount: 500 }] },
      ],
      nodes: [node("e", "eatcell"), node("d", "drink")],
      poolCellRatios: { water_cell: 1000 },
    });
    const expanded = expandPool(neither);
    expect(expanded.hiddenNodeIds).toEqual([]);
    const both = calculateThroughput(neither, { generatedAt: "fixed" });
    expect(both.nodes["e"]!.utilization).toBeCloseTo(1, 4);
    expect(both.nodes["d"]!.utilization).toBeCloseTo(1, 4);
  });

  it("reads a drawer's old wires as its side: fed was a product, drawn was a source", () => {
    const proj = project({
      recipes: RECIPES,
      nodes: [node("s", "smelt")],
      storages: [drawer("sand-in", "sand"), drawer("glass-out", "glass"), drawer("tank", "glass")],
      edges: [
        { id: "w1", source: "sand-in", target: "s", resourceKind: "item", resourceId: "sand" },
        { id: "w2", source: "s", target: "glass-out", resourceKind: "item", resourceId: "glass" },
        // A buffer (fed and drawn) has no side: the pool is the buffer now.
        { id: "w3", source: "s", target: "tank", resourceKind: "item", resourceId: "glass" },
        { id: "w4", source: "tank", target: "s", resourceKind: "item", resourceId: "glass" },
      ],
    });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["s"]!.utilization).toBeCloseTo(1, 4);
    const roles = getStorageRoles(proj);
    expect(roles.get("sand-in")).toBe("source");
    expect(roles.get("glass-out")).toBe("product");
    expect(roles.get("tank")).toBe("idle");
    expect(result.storages["glass-out"]!.producedPerSecond).toBeCloseTo(1, 4);
  });
});
