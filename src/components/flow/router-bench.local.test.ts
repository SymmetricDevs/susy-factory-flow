import { readFileSync } from "node:fs";
import { it } from "vitest";
import { solveGridRoutes } from "./grid-edge-router";
const __routerStats: any = undefined;

const CAPTURE = process.env.SOLVE_CAPTURE ?? "";

it("benchmarks the captured solve", { timeout: 120000 }, () => {
  const cap = JSON.parse(readFileSync(CAPTURE, "utf8"));
  // warm
  solveGridRoutes(cap.obstacles, cap.requests);
  const runs = 3;
  const t0 = performance.now();
  let solved;
  for (let i = 0; i < runs; i += 1) solved = solveGridRoutes(cap.obstacles, cap.requests);
  const ms = (performance.now() - t0) / runs;
  const fallbacks = [...solved!.values()].filter((r) => r.points.length <= 5).length;
  console.log(`solve: ${ms.toFixed(0)} ms avg over ${runs}; edges ${solved!.size}; short/fallback routes ${fallbacks}`);
  if (__routerStats) {
    const s = __routerStats;
    console.log(JSON.stringify({ legs: s.legs, pops: s.pops, exhausted: s.exhausted, attempts: s.attempts, maxStates: s.maxStates, usedWidthCalls: s.usedWidthCalls }, null, 0));
    const slow = [...s.perEdge.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
    for (const [id, e] of slow) console.log(`${e.ms.toFixed(1).padStart(8)}ms pops=${String(e.pops).padStart(7)} attempts=${e.attempts} states=${e.states} ${id.slice(0, 40)}`);
  }
});
