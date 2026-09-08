import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type FactoryEdge, type FactoryNode, type FactoryProject } from "./types";
import { canonicalizeResourceHandleId } from "./edge-identity";
import { calculateThroughput } from "@/lib/solver/throughput";
import { deriveNodeVerdict, findUnwiredNodeIds } from "@/components/flow/node-verdict";
import {
  expandSharedMachines,
  getSharedMachineHandlers,
  listSharedMachineGroups,
  parseSectionNodeId,
  sectionHandleId,
  sectionNodeId,
  sectionNodeView,
  splitSectionHandleId,
} from "./shared-machine";

/**
 * Shared machines: one card, several recipes, one machine. The exam pins
 * the addressing (section handles and solve ids), the expansion, and the
 * one thing the solver couples: the sections' time shares sum to one.
 */

function recipe(
  id: string,
  inputs: [string, number][],
  outputs: [string, number][],
  machineHandlers?: Array<{ id: string; label: string }>,
) {
  return {
    id,
    name: id,
    machineType: "reactor",
    minimumTier: "LV",
    durationTicks: 20,
    eut: 30,
    inputs: inputs.map(([itemId, amount]) => ({ kind: "item" as const, id: itemId, amount })),
    outputs: outputs.map(([itemId, amount]) => ({ kind: "item" as const, id: itemId, amount })),
    ...(machineHandlers
      ? {
          machineHandlers: machineHandlers.map((handler) => ({
            ...handler,
            machineType: "reactor",
            minimumTier: "LV",
          })),
        }
      : {}),
  };
}

function node(id: string, recipeId: string, extra?: Partial<FactoryNode>): FactoryNode {
  return {
    id,
    recipeId,
    machineCount: 1,
    parallel: 1,
    overclockTier: "LV",
    enabled: true,
    position: { x: 0, y: 0 },
    ...extra,
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  resourceId: string,
  handles?: { sourceHandle?: string; targetHandle?: string },
): FactoryEdge {
  return { id, source, target, resourceKind: "item", resourceId, ...handles };
}

function project(over: Partial<FactoryProject>): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "shared-exam",
    name: "shared-exam",
    recipes: [],
    nodes: [],
    edges: [],
    fuelProfiles: [],
    ...over,
  } as FactoryProject;
}

describe("section addressing", () => {
  it("prefixes handles and solve ids for sections past the first, and leaves section 0 bare", () => {
    expect(sectionHandleId(0, "input:item:oil")).toBe("input:item:oil");
    expect(sectionHandleId(2, "input:item:oil")).toBe("r2:input:item:oil");
    expect(splitSectionHandleId("r2:input:item:oil")).toEqual({ section: 2, handleId: "input:item:oil" });
    expect(splitSectionHandleId("input:item:oil")).toEqual({ section: 0, handleId: "input:item:oil" });
    expect(sectionNodeId("card", 0)).toBe("card");
    expect(sectionNodeId("card", 1)).toBe("card#r1");
    expect(parseSectionNodeId("card#r1")).toEqual({ nodeId: "card", section: 1 });
    expect(parseSectionNodeId("card")).toEqual({ nodeId: "card", section: 0 });
  });

  it("keeps the section prefix through canonicalization and only drops the slot index", () => {
    expect(canonicalizeResourceHandleId("r1:output:item:oil:3")).toBe("r1:output:item:oil");
    expect(canonicalizeResourceHandleId("output:item:oil:3")).toBe("output:item:oil");
  });

  it("views a section as its own node with the card's settings and its own recipe and picks", () => {
    const card = node("card", "a", {
      machineCount: 3,
      overclockTier: "HV",
      solvePin: 5,
      extraRecipes: [{ recipeId: "b", recipeInputOverrides: { "0": { kind: "item", id: "x", amount: 1 } } }],
    });
    const view = sectionNodeView(card, 1);
    expect(view.id).toBe("card#r1");
    expect(view.recipeId).toBe("b");
    expect(view.machineCount).toBe(3);
    expect(view.overclockTier).toBe("HV");
    expect(view.recipeInputOverrides?.["0"]?.id).toBe("x");
    expect(view.extraRecipes).toBeUndefined();
    expect(view.solvePin).toBeUndefined();
    expect(sectionNodeView(card, 0)).toBe(card);
  });
});

describe("expansion", () => {
  it("stands each extra section up as a hidden node and re-points its wires, prefix stripped", () => {
    const proj = project({
      recipes: [recipe("a", [["oil", 1]], [["heavy", 1]]), recipe("b", [["berry", 1]], [["heavy", 1]])],
      nodes: [node("src", "a"), node("card", "a", { extraRecipes: [{ recipeId: "b" }] })],
      edges: [
        edge("e0", "src", "card", "oil", { targetHandle: "input:item:oil" }),
        edge("e1", "src", "card", "berry", { targetHandle: "r1:input:item:berry" }),
      ],
    });
    const expanded = expandSharedMachines(proj);
    expect(expanded.nodes.map((entry) => entry.id)).toEqual(["src", "card", "card#r1"]);
    expect(expanded.edges.find((entry) => entry.id === "e0")?.target).toBe("card");
    const moved = expanded.edges.find((entry) => entry.id === "e1")!;
    expect(moved.target).toBe("card#r1");
    expect(moved.targetHandle).toBe("input:item:berry");
    // Memoized on the plan object, and the expansion expands to itself.
    expect(expandSharedMachines(proj)).toBe(expanded);
    expect(expandSharedMachines(expanded)).toBe(expanded);
    expect(listSharedMachineGroups(expanded.nodes.map((entry) => entry.id)).get("card")).toEqual([
      "card",
      "card#r1",
    ]);
  });

  it("leaves a plan with no shared machine untouched", () => {
    const proj = project({ recipes: [recipe("a", [], [["x", 1]])], nodes: [node("n", "a")] });
    expect(expandSharedMachines(proj)).toBe(proj);
  });

  it("lists the machines that run every recipe on the card", () => {
    const a = recipe("a", [], [["x", 1]], [{ id: "lcr", label: "LCR" }, { id: "chem", label: "Chem" }]);
    const b = recipe("b", [], [["y", 1]], [{ id: "lcr", label: "LCR" }]);
    const lookup = new Map([["a", a], ["b", b]] as const);
    const handlers = getSharedMachineHandlers(node("card", "a", { extraRecipes: [{ recipeId: "b" }] }), lookup as never);
    expect(handlers.map((handler) => handler.id)).toEqual(["lcr"]);
  });
});

describe("the shared time row", () => {
  // One supply of 1 oil/s splits between a card's two sections that each eat
  // 1 oil/s at full speed: without the row each would run flat out on a
  // full supply. Here the supply is plenty (2/s) but the MACHINE is one, so
  // the two sections can only run a total of one machine's worth.
  const RECIPES = [
    recipe("well", [], [["oil", 2]]),
    recipe("heavy", [["oil", 1]], [["heavy", 1]]),
    recipe("light", [["oil", 1]], [["light", 1]]),
    recipe("sink-heavy", [["heavy", 1]], []),
    recipe("sink-light", [["light", 1]], []),
  ];
  const board = () =>
    project({
      recipes: RECIPES,
      nodes: [
        node("well", "well"),
        node("card", "heavy", { extraRecipes: [{ recipeId: "light" }] }),
        node("sh", "sink-heavy"),
        node("sl", "sink-light"),
      ],
      edges: [
        edge("w0", "well", "card", "oil", { sourceHandle: "output:item:oil", targetHandle: "input:item:oil" }),
        edge("w1", "well", "card", "oil", { sourceHandle: "output:item:oil", targetHandle: "r1:input:item:oil" }),
        edge("h", "card", "sh", "heavy", { sourceHandle: "output:item:heavy", targetHandle: "input:item:heavy" }),
        edge("l", "card", "sl", "light", { sourceHandle: "r1:output:item:light", targetHandle: "input:item:light" }),
      ],
    });

  it("caps the sections' shares of one machine at a total of one", () => {
    const result = calculateThroughput(board(), { generatedAt: "fixed" });
    const first = result.nodes["card"]!.utilization;
    const second = result.nodes["card#r1"]!.utilization;
    expect(first + second).toBeCloseTo(1, 4);
    // Fairness: two equal askers split the machine evenly.
    expect(first).toBeCloseTo(0.5, 3);
    expect(second).toBeCloseTo(0.5, 3);
    // Each section's wire carries its own flow under its own edge id.
    expect(result.edges["l"]!.transferredPerSecond).toBeCloseTo(0.5, 3);
  });

  it("lets a section run flat out when the other has nothing to do", () => {
    const proj = board();
    // Unwire the light section's product: it has nowhere to go, so the
    // heavy section gets the whole machine.
    proj.edges = proj.edges.filter((entry) => entry.id !== "l");
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["card"]!.utilization).toBeCloseTo(1, 4);
    expect(result.nodes["card#r1"]!.utilization).toBeCloseTo(0, 4);
  });

  it("reads a section held back by the machine as busy, naming the other recipe", () => {
    const proj = board();
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    const verdict = deriveNodeVerdict(proj, result, "card#r1");
    expect(verdict.kind).toBe("busy");
    expect(verdict.busy?.sharerName).toBe("heavy");
  });

  it("answers the unwired notice with the card, not the section", () => {
    const proj = board();
    proj.edges = proj.edges.filter((entry) => entry.id !== "l");
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    const unwired = findUnwiredNodeIds(proj, result);
    expect(unwired).toContain("card");
    expect(unwired.some((id) => id.includes("#r"))).toBe(false);
  });

  it("pins a solve-mode count on the whole card, sections sharing it", () => {
    const proj = board();
    proj.solveMode = true;
    proj.nodes = proj.nodes.map((entry) =>
      entry.id === "card" ? { ...entry, solvePin: 4 } : entry,
    );
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    const total =
      (result.nodes["card"]?.theoreticalMachinesRequired ?? 0) +
      (result.nodes["card#r1"]?.theoreticalMachinesRequired ?? 0);
    expect(total).toBeCloseTo(4, 3);
  });
});
