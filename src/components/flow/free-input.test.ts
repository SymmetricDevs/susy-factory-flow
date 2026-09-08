import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type FactoryProject } from "@/lib/model/types";
import { isFreeRecipeInput, isRecipeInputConsumed } from "@/lib/model";
import { calculateThroughput } from "@/lib/solver/throughput";
import { buildRailPorts, deriveNodeVerdict, findUnwiredNodeIds } from "./node-verdict";

/**
 * "IT'S FREE! Place Lava on Side": the Rock Breaker's placeholder input.
 * The game wants lava touching the machine, not a stack fed in, so the slot
 * is never supplied, never wired and never a bare-slot mark - but the card
 * still draws it so the player knows to set the lava down.
 */
const FREE = "gregtech:gt.metaitem.02@32765";

function project(): FactoryProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "free-input-exam",
    name: "free-input-exam",
    recipes: [
      {
        id: "rockbreak",
        name: "Rock Breaker: Cobblestone",
        machineType: "Rock Breaker",
        minimumTier: "LV",
        durationTicks: 16,
        eut: 30,
        inputs: [
          { kind: "item", id: FREE, amount: 1, displayName: "IT'S FREE! Place Lava on Side" },
        ],
        outputs: [{ kind: "item", id: "minecraft:cobblestone", amount: 1 }],
      },
    ],
    nodes: [
      {
        id: "rb",
        recipeId: "rockbreak",
        machineCount: 1,
        parallel: 1,
        overclockTier: "LV",
        enabled: true,
        position: { x: 0, y: 0 },
      },
    ],
    storages: [{ id: "d", kind: "item", resourceId: "minecraft:cobblestone", position: { x: 0, y: 0 } }],
    edges: [
      { id: "e1", source: "rb", target: "d", resourceKind: "item", resourceId: "minecraft:cobblestone" },
    ],
    fuelProfiles: [],
  } as FactoryProject;
}

describe("free-in-the-game inputs", () => {
  it("are never consumed", () => {
    expect(isFreeRecipeInput({ kind: "item", id: FREE })).toBe(true);
    expect(isFreeRecipeInput({ kind: "fluid", id: FREE })).toBe(false);
    expect(isRecipeInputConsumed({ kind: "item", id: FREE })).toBe(false);
    expect(isRecipeInputConsumed({ kind: "item", id: "minecraft:cobblestone" })).toBe(true);
  });

  it("let the machine run with nothing wired to the slot", () => {
    const proj = project();
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    expect(result.nodes["rb"]!.utilization).toBeCloseTo(1, 4);
    expect(Object.keys(result.nodes["rb"]!.inputs)).toEqual([]);
    expect(findUnwiredNodeIds(proj, result)).toEqual([]);
    expect(deriveNodeVerdict(proj, result, "rb").kind).toBe("balanced");
  });

  it("still sit on the card as an inert greyed row", () => {
    const proj = project();
    const result = calculateThroughput(proj, { generatedAt: "fixed" });
    const verdict = deriveNodeVerdict(proj, result, "rb");
    const rails = buildRailPorts(proj, result, "rb", proj.recipes[0]!, verdict);
    expect(rails.inputs).toHaveLength(1);
    const port = rails.inputs[0]!;
    expect(port.free).toBe(true);
    expect(port.displayName).toBe("IT'S FREE! Place Lava on Side");
    expect(port.unsupplied).toBe(false);
    expect(port.nameplatePerSecond).toBe(0);
    expect(port.currentPerSecond).toBe(0);
    expect(rails.outputs).toHaveLength(1);
  });
});
