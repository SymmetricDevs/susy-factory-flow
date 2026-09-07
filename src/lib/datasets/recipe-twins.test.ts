import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/model/types";
import type { RecipeSummary } from "./types";
import { buildRecipeTwinClauses, flattenRecipeTwins, isSameRecipeContent } from "./recipe-twins";

const ingot = { kind: "item" as const, id: "item:iron_ingot", displayName: "Iron Ingot", amount: 1 };
const plate = { kind: "item" as const, id: "item:iron_plate", displayName: "Iron Plate", amount: 1 };
const circuit = {
  kind: "item" as const,
  id: "item:programmed_circuit",
  displayName: "Programmed Circuit",
  amount: 0,
  consumed: false,
};

const bender: Recipe = {
  id: "recipe:bender:plate",
  name: "Iron Plate",
  machineType: "Bender",
  minimumTier: "LV",
  durationTicks: 40,
  eut: 24,
  inputs: [ingot, circuit],
  outputs: [plate],
  source: { recipeMap: "Bender" },
  machineHandlers: [
    { id: "bender", label: "Bender", machineType: "Bender", minimumTier: "LV", kind: "single" },
  ],
};

const summary = (overrides: Partial<RecipeSummary>): RecipeSummary => ({
  id: "recipe:x",
  name: "Iron Plate",
  recipeMap: "Forge Hammer",
  machineType: "Forge Hammer",
  minimumTier: "LV",
  durationTicks: 20,
  eut: 16,
  inputs: [{ ...ingot, amount: 3 }],
  outputs: [{ ...plate, amount: 2 }],
  slots: [],
  ...overrides,
});

describe("recipe twins", () => {
  it("asks ONLY for the consumed inputs and every output, the oredict slot as its first face", () => {
    const oredict = {
      kind: "item" as const,
      id: "oredict:ingotIron",
      displayName: "Any Iron Ingot",
      amount: 1,
      alternatives: [ingot, { ...ingot, id: "item:wrought_iron_ingot" }],
    };
    const clauses = buildRecipeTwinClauses({ ...bender, inputs: [oredict, circuit] }, {});
    expect(clauses).toEqual([
      { role: "takes", kind: "item", id: "item:iron_ingot" },
      { role: "makes", kind: "item", id: "item:iron_plate" },
    ]);
  });

  it("has no twins to ask about without a consumed input or an output", () => {
    expect(buildRecipeTwinClauses({ ...bender, inputs: [circuit] }, {})).toBeUndefined();
    expect(buildRecipeTwinClauses({ ...bender, outputs: [] }, {})).toBeUndefined();
  });

  it("knows the card's own recipe by content, not only by id", () => {
    expect(isSameRecipeContent(bender, summary({ id: bender.id }))).toBe(true);
    expect(
      isSameRecipeContent(
        bender,
        summary({
          id: "recipe:rebuilt-id",
          recipeMap: "Bender",
          durationTicks: 40,
          eut: 24,
          inputs: [ingot, circuit],
          outputs: [plate],
        }),
      ),
    ).toBe(true);
    // Same map, different circuit: a real alternative, not the same recipe.
    expect(
      isSameRecipeContent(
        bender,
        summary({ recipeMap: "Bender", durationTicks: 40, eut: 24, inputs: [ingot], outputs: [plate] }),
      ),
    ).toBe(false);
    expect(isSameRecipeContent(bender, summary({}))).toBe(false);
  });

  it("lists one row per machine of every twin, the card's own recipe left out", () => {
    const hammer = summary({
      id: "recipe:hammer",
      machineHandlers: [
        { id: "forge-hammer", label: "Forge Hammer", machineType: "Forge Hammer", minimumTier: "LV", kind: "single" },
        { id: "industrial-forge-hammer", label: "Industrial Forge Hammer", machineType: "Industrial Forge Hammer", minimumTier: "HV", kind: "multiblock" },
      ],
    });
    const rows = flattenRecipeTwins(bender, [summary({ id: bender.id }), hammer]);
    expect(rows.map((row) => `${row.recipe.id}:${row.handler.id}`)).toEqual([
      "recipe:hammer:forge-hammer",
      "recipe:hammer:industrial-forge-hammer",
    ]);
  });
});
