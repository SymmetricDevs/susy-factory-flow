import type { GridPoint } from "./grid-edge-router";

/** Proper crossings between segments of different wires (shared endpoints and T-touches excluded). */
export function geometricCrossings(routes: Map<string, { points: GridPoint[] }>): Map<string, number> {
  const segs: Array<{ id: string; a: GridPoint; b: GridPoint }> = [];
  for (const [id, r] of routes) for (let i = 0; i + 1 < r.points.length; i += 1) segs.push({ id, a: r.points[i], b: r.points[i + 1] });
  const per = new Map<string, number>();
  const cross = (o: GridPoint, a: GridPoint, b: GridPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  for (let i = 0; i < segs.length; i += 1) for (let j = i + 1; j < segs.length; j += 1) {
    const s = segs[i], t = segs[j];
    if (s.id === t.id) continue;
    const d1 = cross(s.a, s.b, t.a), d2 = cross(s.a, s.b, t.b), d3 = cross(t.a, t.b, s.a), d4 = cross(t.a, t.b, s.b);
    const eps = 0.5;
    if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
      per.set(s.id, (per.get(s.id) ?? 0) + 1); per.set(t.id, (per.get(t.id) ?? 0) + 1);
    }
  }
  return per;
}
export function totalCrossings(routes: Map<string, { points: GridPoint[] }>): number {
  let n = 0; for (const v of geometricCrossings(routes).values()) n += v; return n / 2;
}
