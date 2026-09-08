import { it } from "vitest";
import { totalCrossings } from "./router-crossings.local";
import { solveGridRoutes, type GridSolveStats, type GridObstacle, type GridRouteRequest, type GridEndpoint, type GridPoint } from "./grid-edge-router";

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perimeter(o: GridObstacle): GridEndpoint[] {
  const out: GridEndpoint[] = [];
  const cx = (o.left + o.right) / 2, cy = (o.top + o.bottom) / 2;
  for (let x = o.left + 40; x <= o.right - 40; x += 20) {
    const penalty = Math.abs(x - cx) * 0.25;
    out.push({ x, y: o.top, side: "top", penalty }, { x, y: o.bottom, side: "bottom", penalty });
  }
  for (let y = o.top + 40; y <= o.bottom - 40; y += 20) {
    const penalty = Math.abs(y - cy) * 0.25;
    out.push({ x: o.left, y, side: "left", penalty }, { x: o.right, y, side: "right", penalty });
  }
  return out;
}

export function synth(cards: number, wires: number, seed = 7) {
  const rand = mulberry(seed);
  const cols = Math.ceil(Math.sqrt(cards));
  const obstacles: GridObstacle[] = [];
  for (let i = 0; i < cards; i += 1) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * 560 + Math.floor(rand() * 4) * 20;
    const y = row * 380 + Math.floor(rand() * 4) * 20;
    obstacles.push({ id: `c${i}`, left: x, top: y, right: x + 440, bottom: y + 160 + Math.floor(rand() * 4) * 20 });
  }
  const requests: GridRouteRequest[] = [];
  for (let i = 0; i < wires; i += 1) {
    const a = Math.floor(rand() * cards);
    let b = Math.floor(rand() * cards);
    if (b === a) b = (a + 1) % cards;
    requests.push({
      edgeId: `e${i}`, order: i,
      sources: perimeter(obstacles[a]), targets: perimeter(obstacles[b]),
      strokeWidth: [4, 6, 8, 12][Math.floor(rand() * 4)],
      sourceCardId: obstacles[a].id, targetCardId: obstacles[b].id,
    } as GridRouteRequest);
  }
  return { obstacles, requests };
}

it("synthetic bench", { timeout: 300000 }, () => {
  for (const [cards, wires] of [[30, 40], [80, 120], [150, 220]] as const) {
    const { obstacles, requests } = synth(cards, wires);
    solveGridRoutes(obstacles, requests);
    const runs = 3;
    const t0 = performance.now();
    let solved!: ReturnType<typeof solveGridRoutes>;
    const stats: GridSolveStats = { crossings: 0, rerouted: 0, fallbacks: 0 };
    for (let i = 0; i < runs; i += 1) solved = solveGridRoutes(obstacles, requests, stats);
    const ms = (performance.now() - t0) / runs;
    const fallbacks = [...solved.values()].filter((r) => r.points.length <= 5).length;
    console.log(`cards=${cards} wires=${wires}: ${ms.toFixed(0)} ms, crossings=${totalCrossings(solved)}, L-fallbacks=${fallbacks} stats=${JSON.stringify(stats)}`);
  }
});
