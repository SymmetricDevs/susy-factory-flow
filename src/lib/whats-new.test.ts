// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/version", () => ({ APP_VERSION: "1.46.0" }));
vi.mock("@/lib/changelog", () => ({
  CHANGELOG: [
    { version: "1.46.0", date: "2026-08-10", headline: "c", notes: [] },
    { version: "1.45.0", date: "2026-08-10", headline: "b", notes: [] },
    { version: "1.44.0", date: "2026-08-09", headline: "a", notes: [], warning: "setups differ" },
  ],
}));

const { compareVersions, markVersionSeen, markVersionSeenAndNotify, unseenEntries } =
  await import("@/lib/whats-new");

const KEY = "gtnh-factory-flow.last-seen-version.v1";

describe("compareVersions", () => {
  it("orders by number, not by string", () => {
    // The reason this is not localeCompare: "1.9.0" sorts ABOVE "1.10.0" as
    // text, so a tenth minor release would silently show nobody anything.
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.46.0", "1.46.0")).toBe(0);
    expect(compareVersions("1.44.0", "1.45.0")).toBeLessThan(0);
    expect(compareVersions("1.46", "1.46.0")).toBe(0);
  });
});

describe("unseenEntries", () => {
  beforeEach(() => window.localStorage.clear());

  it("says nothing on a first visit, and remembers where they came in", () => {
    // Someone new has no idea what any of it used to do, so a list of changes
    // is noise in front of the thing they came for.
    expect(unseenEntries()).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBe("1.46.0");
  });

  it("returns only what shipped since they last looked", () => {
    window.localStorage.setItem(KEY, "1.44.0");
    expect(unseenEntries().map((entry) => entry.version)).toEqual(["1.46.0", "1.45.0"]);
  });

  it("says nothing when they are already current", () => {
    window.localStorage.setItem(KEY, "1.46.0");
    expect(unseenEntries()).toEqual([]);
  });

  it("says nothing to somebody ahead of this bundle", () => {
    // A tab on the new version and a stamp from a newer one: possible while a
    // deploy is rolling out across servers, and showing a negative diff would
    // be nonsense.
    window.localStorage.setItem(KEY, "1.47.0");
    expect(unseenEntries()).toEqual([]);
  });

  it("only marks seen when asked", () => {
    window.localStorage.setItem(KEY, "1.44.0");
    expect(unseenEntries()).toHaveLength(2);
    // Asking does not stamp: the dot stays until the notes are opened.
    expect(window.localStorage.getItem(KEY)).toBe("1.44.0");
    markVersionSeen();
    expect(unseenEntries()).toEqual([]);
  });

  it("stamps and tells its subscribers when the notes are opened", () => {
    window.localStorage.setItem(KEY, "1.44.0");
    markVersionSeenAndNotify();
    expect(window.localStorage.getItem(KEY)).toBe("1.46.0");
    expect(unseenEntries()).toEqual([]);
  });
});
