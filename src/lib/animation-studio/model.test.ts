import { describe, expect, it, beforeEach } from "vitest";
import {
  actionsBetween,
  ease,
  moveKeys,
  newSequence,
  parseSequence,
  sampleTrack,
  snapTime,
  type Keyframe,
} from "./model";
import { useAnimationStudio } from "./store";

const camera = (
  id: string,
  time: number,
  cx: number,
  zoom = 1,
  easing: Keyframe["easing"] = "linear",
): Keyframe => ({
  id,
  time,
  label: id,
  track: "camera",
  easing,
  enabled: true,
  value: { cx, cy: 0, zoom },
});
const action = (id: string, time: number): Keyframe => ({
  id,
  time,
  label: id,
  track: "action",
  easing: "linear",
  enabled: true,
  value: { kind: "click", selector: "#button", x: 0, y: 0, text: "", deltaX: 0, deltaY: 0 },
});

describe("animation sampling", () => {
  it("uses arriving easing and logarithmic zoom with stable endpoints", () => {
    const sequence = { ...newSequence(), keys: [camera("b", 10, 100, 4), camera("a", 0, 0)] };
    expect(sampleTrack(sequence, "camera", 5)).toEqual({ cx: 50, cy: 0, zoom: 2 });
    expect(sampleTrack(sequence, "camera", -1)?.cx).toBe(0);
    expect(sampleTrack(sequence, "camera", 20)?.cx).toBe(100);
    expect(
      sampleTrack(
        { ...sequence, keys: [camera("a", 0, 0), camera("b", 10, 100, 4, "ease-in")] },
        "camera",
        5,
      )?.cx,
    ).toBe(12.5);
  });
  it("holds before an instant cut and switches exactly at its time", () => {
    const sequence = { ...newSequence(), keys: [camera("a", 0, 0), camera("b", 5, 100, 1, "cut")] };
    expect(sampleTrack(sequence, "camera", 4.999)?.cx).toBe(0);
    expect(sampleTrack(sequence, "camera", 5)?.cx).toBe(100);
  });
  it("resolves equal times in document order, and ignores disabled or muted keys", () => {
    const sequence = {
      ...newSequence(),
      keys: [camera("a", 0, 1), camera("b", 0, 2), { ...camera("c", 2, 3), enabled: false }],
    };
    expect(sampleTrack(sequence, "camera", 3)?.cx).toBe(2);
    expect(sampleTrack({ ...sequence, muted: ["camera"] }, "camera", 0)).toBeUndefined();
    expect(sampleTrack(sequence, "tilt", 0)).toBeUndefined();
  });
  it("steps cursor visibility at its key, not halfway through the move", () => {
    const sequence = {
      ...newSequence(),
      keys: [
        {
          id: "a",
          track: "cursor",
          label: "a",
          time: 0,
          enabled: true,
          easing: "linear",
          value: { x: 0, y: 0, visible: true },
        },
        {
          id: "b",
          track: "cursor",
          label: "b",
          time: 2,
          enabled: true,
          easing: "linear",
          value: { x: 1, y: 1, visible: false },
        },
      ] as Keyframe[],
    };
    expect(sampleTrack(sequence, "cursor", 1)).toEqual({ x: 0.5, y: 0.5, visible: true });
    expect(sampleTrack(sequence, "cursor", 2)?.visible).toBe(false);
  });
  it("crosses actions exactly once, including zero and dropped frames", () => {
    const sequence = { ...newSequence(), keys: [action("b", 2), action("a", 0), action("c", 2)] };
    expect(actionsBetween(sequence, -1, 0).map((k) => k.id)).toEqual(["a"]);
    expect(actionsBetween(sequence, 0, 3).map((k) => k.id)).toEqual(["b", "c"]);
    expect(actionsBetween(sequence, 3, 4)).toEqual([]);
    expect(actionsBetween(sequence, 3, 0)).toEqual([]);
    expect(actionsBetween({ ...sequence, muted: ["action"] }, -1, 4)).toEqual([]);
  });
  it("clamps group drags as a unit, preserving spacing", () => {
    const sequence = {
      ...newSequence(),
      keys: [camera("a", 2, 0), camera("b", 5, 0), camera("c", 6, 0)],
    };
    expect(moveKeys(sequence, ["a", "b"], -10).keys.map((k) => k.time)).toEqual([0, 3, 6]);
    expect(moveKeys(sequence, ["a", "b"], 100).keys.map((k) => k.time)).toEqual([27, 30, 6]);
    expect(snapTime(1.02, 24, 30)).toBe(1);
    expect(ease(-1, "smooth")).toBe(0);
  });
  it("rejects corrupt imports instead of silently accepting dangerous values", () => {
    expect(parseSequence(JSON.stringify(newSequence()))).toEqual(newSequence());
    for (const doc of [
      { ...newSequence(), duration: -1 },
      { ...newSequence(), keys: [camera("a", 31, 0)] },
      { ...newSequence(), keys: [camera("a", 0, 0, 0)] },
      { ...newSequence(), keys: [camera("a", 0, 0), camera("a", 2, 0)] },
      { ...newSequence(), version: 2 },
    ])
      expect(() => parseSequence(JSON.stringify(doc))).toThrow();
  });
});

describe("timeline history", () => {
  beforeEach(() => useAnimationStudio.getState().load(newSequence()));
  it("undoes and redoes whole transactions, then drops a diverged redo branch", () => {
    const state = useAnimationStudio.getState();
    state.edit({ ...newSequence(), keys: [camera("a", 1, 0)] });
    state.edit({ ...newSequence(), keys: [camera("a", 3, 0)] });
    state.undo();
    expect(useAnimationStudio.getState().sequence.keys[0].time).toBe(1);
    state.redo();
    expect(useAnimationStudio.getState().sequence.keys[0].time).toBe(3);
    state.undo();
    state.edit({ ...newSequence(), name: "Different" });
    expect(useAnimationStudio.getState().future).toEqual([]);
  });
  it("editing and closing cancel playback and clamp playhead after undo", () => {
    const state = useAnimationStudio.getState();
    state.edit({ ...newSequence(), duration: 60 });
    useAnimationStudio.setState({ playing: true, time: 50 });
    state.undo();
    expect(useAnimationStudio.getState()).toMatchObject({ playing: false, time: 30 });
    useAnimationStudio.setState({ playing: true });
    state.setEnabled(false);
    expect(useAnimationStudio.getState().playing).toBe(false);
  });
});
