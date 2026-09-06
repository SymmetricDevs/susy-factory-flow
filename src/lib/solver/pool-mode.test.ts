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

  it("leaves a resource nobody makes honestly short", () => {
    const proj = project({ recipes: RECIPES, nodes: [node("s", "smelt")] });
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["s"]!.utilization).toBeCloseTo(0, 4);
    const verdict = deriveNodeVerdict(proj, result, "s");
    expect(verdict.kind).toBe("unwired");
    expect(verdict.bare?.inputs.map((slot) => slot.displayName)).toEqual(["sand"]);
    // Its glass has a pool to go to, so the output side is never bare.
    expect(verdict.bare?.outputs).toEqual([]);
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
    expect(result.nodes["s"]!.utilization).toBeCloseTo(0, 4);
    expect(getStorageRoles(proj).get("sand-in")).toBe("idle");
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
