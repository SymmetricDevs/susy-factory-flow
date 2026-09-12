import { describe, expect, it } from "vitest";
import { getRecipeMaximumVoltageTier, getRunVoltageTier, getVoltageTierForEuT } from "./tiers";

describe("GT voltage tiers", () => {
  it("selects the first tier that can cover a recipe EU/t", () => {
    expect(getVoltageTierForEuT(0)).toBe("ULV");
    expect(getVoltageTierForEuT(8)).toBe("ULV");
    expect(getVoltageTierForEuT(16)).toBe("LV");
    expect(getVoltageTierForEuT(32)).toBe("LV");
    expect(getVoltageTierForEuT(33)).toBe("MV");
    expect(getVoltageTierForEuT(512)).toBe("HV");
    expect(getVoltageTierForEuT(2048)).toBe("EV");
    expect(getVoltageTierForEuT(8192)).toBe("IV");
  });
});

describe("the run tier stops at the family's last real machine", () => {
  const canner = { eut: 1, minimumTier: "LV", maximumTier: "ZPM" };
  it("clamps a stored tier above the maximum to the maximum", () => {
    expect(getRunVoltageTier(canner, "UV")).toBe("ZPM");
    expect(getRunVoltageTier(canner, "UMV")).toBe("ZPM");
    expect(getRunVoltageTier(canner, "HV")).toBe("HV");
  });
  it("keeps the floor, and leaves recipes without a maximum alone", () => {
    expect(getRunVoltageTier(canner, "ULV")).toBe("LV");
    expect(getRunVoltageTier({ eut: 120, minimumTier: "MV" }, "UV")).toBe("UV");
    expect(getRecipeMaximumVoltageTier({ maximumTier: "nonsense" })).toBeUndefined();
  });
});
