import { z } from "zod";

export const EASINGS = ["linear", "smooth", "ease-in", "ease-out", "cut"] as const;
export const TRACKS = ["camera", "tilt", "cursor", "action", "marker"] as const;
export type Track = (typeof TRACKS)[number];
export type Easing = (typeof EASINGS)[number];
const number = z.number().finite();
const base = {
  id: z.string().min(1).max(100),
  time: number.min(0).max(3600),
  label: z.string().max(160),
  easing: z.enum(EASINGS),
  enabled: z.boolean(),
};
export const cameraSchema = z.object({ cx: number, cy: number, zoom: number.min(0.05).max(10) });
const tiltSchema = z.object({
  pitch: number.min(-45).max(45),
  yaw: number.min(-45).max(45),
  roll: number.min(-180).max(180),
  scale: number.min(0.25).max(3),
  perspective: number.min(400).max(4000),
});
const cursorSchema = z.object({
  x: number.min(0).max(1),
  y: number.min(0).max(1),
  visible: z.boolean(),
});
export const ACTIONS = [
  "click",
  "double-click",
  "right-click",
  "scroll",
  "type",
  "undo",
  "redo",
] as const;
const keySchema = z.discriminatedUnion("track", [
  z.object({ ...base, track: z.literal("camera"), value: cameraSchema }),
  z.object({ ...base, track: z.literal("tilt"), value: tiltSchema }),
  z.object({ ...base, track: z.literal("cursor"), value: cursorSchema }),
  z.object({
    ...base,
    track: z.literal("action"),
    value: z.object({
      kind: z.enum(ACTIONS),
      selector: z.string().max(2000),
      x: number.min(0).max(1),
      y: number.min(0).max(1),
      text: z.string().max(10000),
      deltaX: number.min(-100000).max(100000),
      deltaY: number.min(-100000).max(100000),
    }),
  }),
  z.object({
    ...base,
    track: z.literal("marker"),
    value: z.object({ note: z.string().max(2000) }),
  }),
]);
export type Keyframe = z.infer<typeof keySchema>;
export type Camera = z.infer<typeof cameraSchema>;
export type Tilt = z.infer<typeof tiltSchema>;
export type Cursor = z.infer<typeof cursorSchema>;
export type Action = Extract<Keyframe, { track: "action" }>;
export const sequenceSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(160),
    duration: number.min(1).max(3600),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    keys: z.array(keySchema).max(5000),
    muted: z.array(z.enum(TRACKS)),
    shots: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().max(160),
          camera: cameraSchema,
          tilt: tiltSchema,
        }),
      )
      .max(200),
  })
  .superRefine((sequence, ctx) => {
    if (new Set(sequence.keys.map((key) => key.id)).size !== sequence.keys.length)
      ctx.addIssue({ code: "custom", message: "Keyframe IDs must be unique" });
    if (sequence.keys.some((key) => key.time > sequence.duration))
      ctx.addIssue({ code: "custom", message: "Keyframes must fit inside the sequence" });
  });
export type Sequence = z.infer<typeof sequenceSchema>;
export const FLAT_TILT: Tilt = { pitch: 0, yaw: 0, roll: 0, scale: 1, perspective: 1600 };
export const newSequence = (): Sequence => ({
  version: 1,
  name: "Untitled sequence",
  duration: 30,
  fps: 30,
  keys: [],
  muted: [],
  shots: [],
});
export const uid = () => crypto.randomUUID();
export function ease(t: number, easing: Easing) {
  t = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "cut":
      return t >= 1 ? 1 : 0;
    case "smooth":
      return t * t * (3 - 2 * t);
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - (1 - t) ** 3;
    default:
      return t;
  }
}

/** Easing belongs to the arriving key. Equal-time keys resolve in document order. */
type TrackValues = { camera: Camera; tilt: Tilt; cursor: Cursor };
export function sampleTrack<T extends keyof TrackValues>(
  sequence: Sequence,
  track: T,
  time: number,
): TrackValues[T] | undefined {
  if (sequence.muted.includes(track)) return undefined;
  const keys = sequence.keys
    .filter((key) => key.track === track && key.enabled)
    .sort((a, b) => a.time - b.time);
  if (!keys.length) return undefined;
  let left = keys[0];
  let right = left;
  for (const key of keys) {
    if (key.time <= time) left = key;
    else {
      right = key;
      break;
    }
    right = left;
  }
  const t =
    right.time > left.time ? ease((time - left.time) / (right.time - left.time), right.easing) : 0;
  const a = left.value as Record<string, number | boolean>;
  const b = right.value as Record<string, number | boolean>;
  const result: Record<string, number | boolean> = {};
  for (const field of Object.keys(a)) {
    const av = a[field],
      bv = b[field];
    result[field] =
      typeof av === "number" && typeof bv === "number"
        ? field === "zoom"
          ? Math.exp(Math.log(av) + (Math.log(bv) - Math.log(av)) * t)
          : av + (bv - av) * t
        : t >= 1
          ? bv
          : av;
  }
  return result as TrackValues[T];
}

/** Half-open interval prevents replay on pause/resume and includes zero on a fresh run. */
export function actionsBetween(sequence: Sequence, previous: number, time: number): Action[] {
  if (sequence.muted.includes("action")) return [];
  return sequence.keys
    .filter(
      (key): key is Action =>
        key.track === "action" && key.enabled && key.time > previous && key.time <= time,
    )
    .sort((a, b) => a.time - b.time);
}
export function snapTime(time: number, fps: number, duration: number) {
  return Math.max(0, Math.min(duration, Math.round(time * fps) / fps));
}
export function moveKeys(sequence: Sequence, ids: string[], delta: number): Sequence {
  const selected = sequence.keys.filter((key) => ids.includes(key.id));
  if (!selected.length) return sequence;
  delta = Math.max(
    -Math.min(...selected.map((key) => key.time)),
    Math.min(sequence.duration - Math.max(...selected.map((key) => key.time)), delta),
  );
  return {
    ...sequence,
    keys: sequence.keys.map((key) =>
      ids.includes(key.id) ? { ...key, time: key.time + delta } : key,
    ),
  };
}
export function parseSequence(text: string): Sequence {
  if (text.length > 5_000_000) throw new Error("Sequence file is too large (5 MB maximum).");
  return sequenceSchema.parse(JSON.parse(text));
}
