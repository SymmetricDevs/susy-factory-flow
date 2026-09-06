import { describe, expect, it } from "vitest";
import type { MachineHandlerIconEntry } from "@/lib/datasets/types";
import { machineIconAtTier } from "./machine-icons";

const face = (id: string) => ({ kind: "item" as const, id, displayName: id, iconPath: `/${id}.png` });
const entry: MachineHandlerIconEntry = {
  familyId: "chemical-reactor",
  resource: face("basic"),
  tiers: [
    { tier: "LV", resource: face("basic") },
    { tier: "MV", resource: face("advanced") },
    { tier: "HV", resource: face("advanced-ii") },
    { tier: "EV", resource: face("advanced-iii") },
  ],
};

describe("machineIconAtTier", () => {
  it("wears the block of the card's own tier", () => {
    expect(machineIconAtTier(entry, "MV")?.id).toBe("advanced");
    expect(machineIconAtTier(entry, "HV")?.id).toBe("advanced-ii");
  });
  it("wears the highest variant not above the tier when there is no exact one", () => {
    expect(machineIconAtTier(entry, "IV")?.id).toBe("advanced-iii");
    expect(machineIconAtTier(entry, "UV")?.id).toBe("advanced-iii");
    // Every GT tier ranks, UMV included: a card past the ladder's top keeps
    // the top variant instead of falling to the bottom (a 2026-09-06 slip).
    expect(machineIconAtTier(entry, "UMV")?.id).toBe("advanced-iii");
    expect(machineIconAtTier(entry, "UXV")?.id).toBe("advanced-iii");
    expect(machineIconAtTier(entry, "MAX")?.id).toBe("advanced-iii");
  });
  it("falls to the lowest variant below the family's range, and to the face without a list", () => {
    expect(machineIconAtTier(entry, "ULV")?.id).toBe("basic");
    expect(machineIconAtTier({ familyId: "ebf", resource: face("ebf") }, "HV")?.id).toBe("ebf");
    expect(machineIconAtTier(undefined, "HV")).toBeUndefined();
  });
});
