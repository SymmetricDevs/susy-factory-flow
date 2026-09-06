import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type SetupRules, type FactoryProject } from "@/lib/model/types";
import { getSetupRules } from "@/lib/model/setup-rules";
import { normalizeLoadedProject } from "@/lib/model/project-normalize";
import { calculateThroughput } from "./throughput";

/**
 * The board RULES are gone (2026-09-06): build and solve are closed setups,
 * pool mode imports and banks by itself, and loose cell wires is always on.
 * This exam pins that a plan saved under the old rules changes nothing -
 * the flags are ignored by the solve and dropped by the load funnel.
 */

const RECIPES = [
  {
    id: "smelt",
    name: "smelt",
    machineType: "Furnace",
    minimumTier: "LV",
    durationTicks: 20,
    eut: 30,
    inputs: [{ kind: "item" as const, id: "ore", amount: 2 }],
    outputs: [{ kind: "item" as const, id: "ingot", amount: 1 }],
  },
  {
    id: "press",
    name: "press",
    machineType: "Bender",
    minimumTier: "LV",
    durationTicks: 20,
    eut: 30,
    inputs: [{ kind: "item" as const, id: "ingot", amount: 1 }],
    outputs: [{ kind: "item" as const, id: "plate", amount: 1 }],
  },
];

function machine(id: string, recipeId: string, machineCount: number, x: number) {
  return {
    id,
    recipeId,
    machineCount,
    parallel: 1,
    overclockTier: "LV",
    enabled: true,
    position: { x, y: 0 },
  };
}

function board(rules: SetupRules | undefined): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "rules",
    name: "rules",
    setupRules: rules,
    recipes: RECIPES,
    nodes: [machine("smelter", "smelt", 1, 0), machine("presser", "press", 1, 300)],
    edges: [
      {
        id: "mid",
        source: "smelter",
        target: "presser",
        resourceKind: "item",
        resourceId: "ingot",
      },
    ],
    fuelProfiles: [],
  } as FactoryProject;
}

const solve = (project: FactoryProject) => calculateThroughput(project, { generatedAt: "fixed" });

describe("board rules are gone", () => {
  it("answers every plan the same way", () => {
    expect(getSetupRules({})).toEqual({ freeInputs: false, freeOutputs: false, looseCellWires: true });
    expect(getSetupRules({ setupRules: { freeInputs: true, freeOutputs: true, looseCellWires: false } })).toEqual(
      { freeInputs: false, freeOutputs: false, looseCellWires: true },
    );
    expect(getSetupRules({ assumeBoundaries: true })).toEqual({ freeInputs: false, freeOutputs: false, looseCellWires: true });
  });

  it("a half-wired chain reads zero whatever the stored rules say", () => {
    for (const rules of [undefined, { freeInputs: true, freeOutputs: true }, { freeInputs: true }]) {
      const result = solve(board(rules));
      expect(result.nodes["smelter"].utilization).toBeCloseTo(0);
      expect(result.nodes["presser"].utilization).toBeCloseTo(0);
    }
    const legacy = { ...board(undefined), assumeBoundaries: true } as FactoryProject;
    expect(solve(legacy).nodes["presser"].utilization).toBeCloseTo(0);
  });

  it("the load funnel drops both stored forms", () => {
    const loaded = normalizeLoadedProject({
      ...board({ freeInputs: true, looseCellWires: true }),
      assumeBoundaries: true,
    } as FactoryProject);
    expect(loaded.setupRules).toBeUndefined();
    expect(loaded.assumeBoundaries).toBeUndefined();
  });
});
