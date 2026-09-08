import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/model/types";
import { pickRecipeRefMatch, recipeContentRef, scoreRecipeRefCandidate } from "./recipe-ref-match";

function slot(kind: "item" | "fluid", id: string, amount: number) {
  return { kind, id, amount };
}

function recipe(
  id: string,
  inputs: Array<ReturnType<typeof slot> & { consumed?: boolean }>,
  outputs: Array<ReturnType<typeof slot>>,
  extras: Partial<Recipe> = {},
): Recipe {
  return {
    id,
    name: `Blast Furnace: ${outputs[0]?.id ?? "nothing"}`,
    kind: "gregtech_machine",
    category: "gregtech",
    machineType: "Blast Furnace",
    minimumTier: "LV",
    durationTicks: 500,
    eut: 120,
    inputs,
    outputs,
    source: { datasetVersionId: "old", recipeMap: "Blast Furnace", exporter: "gtnh-oracle" },
    ...extras,
  } as Recipe;
}

const IRON_DUST = slot("item", "gregtech:dust.iron", 1);
const COAL_DUST = slot("item", "gregtech:dust.coal", 1);
const CAST_IRON = slot("item", "gregtech:dust.castiron", 1);
const CIRCUIT = { ...slot("item", "gregtech:circuit@11", 1), consumed: false };
const OXYGEN = slot("fluid", "oxygen", 1000);
const STEEL = slot("item", "gregtech:ingot.steel", 1);
const ASHES = slot("item", "gregtech:dust.ashes", 1);
const CO2 = slot("fluid", "carbondioxide", 1000);

/** The plan's recipe, exported under an id the dataset no longer lists. */
const exported = recipe("old:steel-from-dust", [IRON_DUST, COAL_DUST, CIRCUIT, OXYGEN], [STEEL, ASHES, CO2]);

/** The same recipe under this build's id, and its same-named neighbours. */
const sameRecipe = recipe("new:steel-from-dust", [OXYGEN, CIRCUIT, COAL_DUST, IRON_DUST], [ASHES, CO2, STEEL]);
const castIronRecipe = recipe("new:steel-from-cast-iron", [CAST_IRON, CIRCUIT, OXYGEN], [STEEL, ASHES], {
  durationTicks: 100,
});
const slowRecipe = recipe("new:steel-slow", [IRON_DUST, COAL_DUST, CIRCUIT], [STEEL, ASHES], {
  durationTicks: 3000,
  eut: 1920,
});

describe("finding a recipe again after its id changed", () => {
  it("picks the recipe with the same content, whatever order its slots come in", () => {
    const match = pickRecipeRefMatch(recipeContentRef(exported), [
      castIronRecipe,
      slowRecipe,
      sameRecipe,
    ]);
    expect(match?.candidate.id).toBe("new:steel-from-dust");
    expect(match?.exact).toBe(true);
  });

  it("never hands back a same-named recipe that takes other inputs", () => {
    // Before content matching, the first search hit sharing the name and
    // making the same output won: a plan's iron-dust steel furnace came
    // back as the cast-iron one.
    const match = pickRecipeRefMatch(recipeContentRef(exported), [castIronRecipe, slowRecipe]);
    expect(match?.score ?? 0).toBeLessThan(300);
  });

  it("still finds the recipe when only its timing changed between builds", () => {
    const retimed = recipe("new:steel-retimed", [IRON_DUST, COAL_DUST, CIRCUIT, OXYGEN], [STEEL, ASHES, CO2], {
      durationTicks: 480,
    });
    const match = pickRecipeRefMatch(recipeContentRef(exported), [castIronRecipe, retimed]);
    expect(match?.candidate.id).toBe("new:steel-retimed");
    expect(match?.exact).toBe(false);
    expect(match?.score).toBeGreaterThanOrEqual(300);
  });

  it("does not need the name to agree when the content does", () => {
    const renamed = { ...sameRecipe, name: "Blast Furnace: Steel Ingot (renamed)" };
    expect(scoreRecipeRefCandidate(recipeContentRef(exported), renamed)).toBeGreaterThanOrEqual(400);
  });

  it("refuses a candidate that no longer makes what the plan wires off it", () => {
    const noAshes = recipe("new:steel-no-ashes", [IRON_DUST, COAL_DUST, CIRCUIT, OXYGEN], [STEEL, CO2]);
    expect(scoreRecipeRefCandidate(recipeContentRef(exported), noAshes)).toBe(0);
  });

  it("refuses a candidate from another machine's map", () => {
    const elsewhere = recipe("new:arc", [IRON_DUST, COAL_DUST, CIRCUIT, OXYGEN], [STEEL, ASHES, CO2], {
      machineType: "Arc Furnace",
      source: { datasetVersionId: "new", recipeMap: "Arc Furnace", exporter: "gtnh-oracle" },
    });
    expect(scoreRecipeRefCandidate(recipeContentRef(exported), elsewhere)).toBe(0);
  });

  it("skips the ref's own id and breaks ties toward the earliest candidate", () => {
    const self = recipe("old:steel-from-dust", [IRON_DUST, COAL_DUST, CIRCUIT, OXYGEN], [STEEL, ASHES, CO2]);
    const twinA = { ...sameRecipe, id: "new:twin-a" };
    const twinB = { ...sameRecipe, id: "new:twin-b" };
    const match = pickRecipeRefMatch(recipeContentRef(exported), [self, twinA, twinB]);
    expect(match?.candidate.id).toBe("new:twin-a");
  });

  it("ignores non-consumed slots, which the exporter may list or not", () => {
    const withoutCircuit = recipe("new:steel-bare", [IRON_DUST, COAL_DUST, OXYGEN], [STEEL, ASHES, CO2]);
    expect(scoreRecipeRefCandidate(recipeContentRef(exported), withoutCircuit)).toBeGreaterThanOrEqual(400);
  });
});
