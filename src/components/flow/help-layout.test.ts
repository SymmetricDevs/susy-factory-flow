import { describe, expect, it } from "vitest";
import { helpColumnsFit } from "./help-layout";

describe("help column bounds", () => {
  const column = { left: 20, top: 20, right: 340, bottom: 400 };

  it("accepts separated columns inside the viewport", () => {
    expect(helpColumnsFit([column, { ...column, left: 360, right: 680 }], 800, 600)).toBe(true);
  });

  it("rejects vertical overflow from wrapped text", () => {
    expect(helpColumnsFit([{ ...column, bottom: 610 }], 800, 600)).toBe(false);
    expect(helpColumnsFit([{ ...column, top: -10 }], 800, 600)).toBe(false);
  });

  it("rejects overlapping top and bottom stacks", () => {
    expect(helpColumnsFit([column, { ...column, top: 390, bottom: 580 }], 800, 600)).toBe(false);
  });

  it("rejects columns extending past either side", () => {
    expect(helpColumnsFit([{ ...column, left: -1 }], 800, 600)).toBe(false);
    expect(helpColumnsFit([{ ...column, right: 810 }], 800, 600)).toBe(false);
  });
});
