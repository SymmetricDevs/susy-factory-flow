import { describe, expect, it } from "vitest";
import { parseEuT } from "./eu-shorthand";

describe("parseEuT", () => {
  it("reads plain numbers and the k / M / G / T shorthand", () => {
    expect(parseEuT("512")).toBe(512);
    expect(parseEuT("14.3k")).toBe(14_300);
    expect(parseEuT("2M")).toBe(2_000_000);
    expect(parseEuT("1.5G")).toBe(1_500_000_000);
    expect(parseEuT("3T")).toBe(3e12);
  });

  it("is easy about case, spaces, commas and a trailing EU/t", () => {
    expect(parseEuT(" 14.3 K ")).toBe(14_300);
    expect(parseEuT("2m")).toBe(2_000_000);
    expect(parseEuT("1,000")).toBe(1000);
    expect(parseEuT("32 EU/t")).toBe(32);
    expect(parseEuT("2M EU/t")).toBe(2_000_000);
    expect(parseEuT("2M eu")).toBe(2_000_000);
  });

  it("gives nothing for anything else", () => {
    expect(parseEuT("")).toBeUndefined();
    expect(parseEuT("lots")).toBeUndefined();
    expect(parseEuT("-5")).toBeUndefined();
    expect(parseEuT("1.2.3k")).toBeUndefined();
  });
});
