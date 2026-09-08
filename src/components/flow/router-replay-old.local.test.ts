import { readFileSync } from "node:fs";
import { it } from "vitest";
import { solveGridRoutes, type GridPoint } from "./grid-edge-router-old.local";
import { geometricCrossings } from "./router-crossings.local";
it("replays a capture", () => {
  const cap = JSON.parse(readFileSync(process.env.CAPTURE ?? "benzene-capture.local.json", "utf8"));
  const stats = {};
  const t0 = performance.now();
  const solved = solveGridRoutes(cap.obstacles, cap.requests);
  const ms = performance.now() - t0;
  const per = geometricCrossings(solved);
  let total = 0; for (const n of per.values()) total += n;
  console.log(`ms=${ms.toFixed(1)} stats=${JSON.stringify(stats)} geometric crossings=${total / 2}`);
  for (const [id, r] of solved) console.log(`${id.slice(0, 12)} x${per.get(id) ?? 0}`, r.points.map((p) => `${p.x},${p.y}`).join(" "));
});
