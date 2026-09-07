import { describe, expect, it } from "vitest";
import { buildTextSearchIndex, queryTextSearchIndex } from "@/lib/search";
import { matchSearchTokens, parseSearchQuery } from "@/lib/search";
import { getChoiceAlternativesByKey, getWildcardResource, withTankMapFace } from "./dataset-query";

describe("dataset query text search", () => {
  it("matches substrings inside tokens without matching across token boundaries", () => {
    const index = buildTextSearchIndex(["Hydrogen Sulfide"], [0]);
    const tokens = index.tokensByEntry[0] ?? [];

    const sulfide = parseSearchQuery("ulfide");
    expect(queryTextSearchIndex(index, sulfide) ?? [0]).toContain(0);
    expect(matchSearchTokens(sulfide, tokens)).toBeDefined();

    const crossBoundary = parseSearchQuery("nsu");
    expect(queryTextSearchIndex(index, crossBoundary) ?? [0]).not.toContain(0);
    expect(matchSearchTokens(crossBoundary, tokens)).toBeUndefined();
  });
});

describe("wildcard uses matching", () => {
  it("bridges damaged item ids to their any-damage wildcard", () => {
    expect(getWildcardResource({ kind: "item", id: "minecraft:log@1" })).toEqual({
      kind: "item",
      id: "minecraft:log@32767",
    });
  });

  it("bridges bare damage-0 item ids the same way", () => {
    // Regression: Oak Log ("minecraft:log", no "@") used to skip the wildcard
    // bridge entirely and lost every any-damage recipe (Coke Oven, Pyrolyse
    // Oven, Macerator, ...) from its uses listing.
    expect(getWildcardResource({ kind: "item", id: "minecraft:log" })).toEqual({
      kind: "item",
      id: "minecraft:log@32767",
    });
  });

  it("does not bridge wildcards or fluids", () => {
    expect(getWildcardResource({ kind: "item", id: "minecraft:log@32767" })).toBeUndefined();
    expect(getWildcardResource({ kind: "fluid", id: "water" })).toBeUndefined();
  });
});

describe("what an \"any of these\" placeholder stands for", () => {
  const catalog = () =>
    ({
      resources: [],
      resourceIndex: [
        {
          kind: "item",
          id: "oredict:circuitBasic",
          displayName: "Ore Dictionary: circuitBasic",
          alternatives: [
            { kind: "item", id: "gregtech:circuit@1", displayName: "Electronic Circuit" },
            { kind: "item", id: "dreamcraft:circuitlv", displayName: "Any LV Circuit" },
            { kind: "item", id: "gregtech:circuit@2", displayName: "Integrated Logic Circuit" },
          ],
        },
        {
          kind: "item",
          id: "oredict:circuitGood",
          displayName: "Ore Dictionary: circuitGood",
          alternatives: [
            { kind: "item", id: "dreamcraft:circuitlv", displayName: "Any LV Circuit" },
            { kind: "item", id: "gregtech:circuit@9", displayName: "Good Electronic Circuit" },
          ],
        },
      ],
    }) as unknown as Parameters<typeof getChoiceAlternativesByKey>[0];

  it("expands a stand-in into the real items of its group", () => {
    const byKey = getChoiceAlternativesByKey(catalog());

    expect(byKey.get("item:dreamcraft:circuitlv")?.map((entry) => entry.displayName)).toEqual([
      "Electronic Circuit",
      "Integrated Logic Circuit",
      "Good Electronic Circuit",
    ]);
  });

  it("never hands alternatives to a concrete item", () => {
    // Sharing an ore dictionary group is not the same as being accepted. The
    // Circuit Assembler recipe for an Electronic Circuit names a Vacuum Tube
    // and takes only that, despite sharing `circuitPrimitive` with the NAND
    // chip, so expanding concrete inputs invents recipes that do not exist.
    const byKey = getChoiceAlternativesByKey(catalog());

    expect(byKey.get("item:gregtech:circuit@1")).toBeUndefined();
    expect(byKey.get("item:gregtech:circuit@2")).toBeUndefined();
  });

  it("does not list one stand-in as another's member", () => {
    const byKey = getChoiceAlternativesByKey(catalog());

    expect(
      byKey.get("item:dreamcraft:circuitlv")?.some((entry) => /^Any /.test(entry.displayName ?? "")),
    ).toBe(false);
  });
});

describe("a placeholder that sits in two groups", () => {
  it("is offered the union, without duplicating a shared member", () => {
    const catalog = {
      resources: [],
      resourceIndex: [
        {
          kind: "item",
          id: "oredict:circuitBasic",
          alternatives: [
            { kind: "item", id: "any:lv", displayName: "Any LV Circuit" },
            { kind: "item", id: "gt:circuit.electronic", displayName: "Electronic Circuit" },
          ],
        },
        {
          kind: "item",
          id: "oredict:circuitTier1",
          alternatives: [
            { kind: "item", id: "any:lv", displayName: "Any LV Circuit" },
            { kind: "item", id: "gt:circuit.electronic", displayName: "Electronic Circuit" },
            { kind: "item", id: "gt:circuit.logic", displayName: "Integrated Logic Circuit" },
          ],
        },
      ],
    } as unknown as Parameters<typeof getChoiceAlternativesByKey>[0];

    const offered = getChoiceAlternativesByKey(catalog)
      .get("item:any:lv")
      ?.map((entry) => entry.displayName);

    expect(offered).toEqual(["Electronic Circuit", "Integrated Logic Circuit"]);
  });
});

describe("the Tank map's face", () => {
  const cell = { kind: "item" as const, id: "ic2:itemcellempty", displayName: "Empty Cell", iconPath: "cell.png" };
  const lvTank = {
    kind: "item" as const,
    id: "gregtech:gt.blockmachines@818",
    displayName: "Low Voltage Fluid Tank",
    iconPath: "tank.png",
    dominantColor: "#abc",
    modId: "gregtech",
  };

  it("wears the Low Voltage Fluid Tank, called Fluid Tank", () => {
    const icons = withTankMapFace({
      resources: [cell, lvTank] as never,
      recipeMapIcons: [{ recipeMap: "Tank", resource: cell }, { recipeMap: "Canner", resource: cell }],
    });
    expect(icons?.find((entry) => entry.recipeMap === "Tank")?.resource).toMatchObject({
      id: lvTank.id,
      displayName: "Fluid Tank",
      iconPath: "tank.png",
      modId: "gregtech",
    });
    expect(icons?.find((entry) => entry.recipeMap === "Canner")?.resource).toEqual(cell);
  });

  it("keeps the cell when the dataset has no fluid tank item", () => {
    const icons = [{ recipeMap: "Tank", resource: cell }];
    expect(withTankMapFace({ resources: [cell] as never, recipeMapIcons: icons })).toBe(icons);
  });
});
