import { it } from "vitest";
import { solveGridRoutes, WIRE_NODE_MARGIN, type GridObstacle, type GridRouteRequest, type GridEndpoint, type GridPoint, type GridSolveStats } from "./grid-edge-router";

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
function violates(points: GridPoint[], o: GridObstacle): boolean {
  const l = o.left - WIRE_NODE_MARGIN, r = o.right + WIRE_NODE_MARGIN, t = o.top - WIRE_NODE_MARGIN, b = o.bottom + WIRE_NODE_MARGIN;
  for (let i = 1; i + 2 < points.length; i += 1) {
    const a = points[i], c = points[i + 1];
    const loX = Math.min(a.x, c.x), hiX = Math.max(a.x, c.x), loY = Math.min(a.y, c.y), hiY = Math.max(a.y, c.y);
    if (hiX > l + 0.01 && loX < r - 0.01 && hiY > t + 0.01 && loY < b - 0.01) return true;
  }
  return false;
}
it("fan-out diag", () => {
  const tower: GridObstacle = { id: "tower", left: 0, top: 400, right: 440, bottom: 700 };
  const d1: GridObstacle = { id: "d1", left: 200, top: 80, right: 340, bottom: 200 };
  const d2: GridObstacle = { id: "d2", left: 400, top: 80, right: 540, bottom: 200 };
  const d3: GridObstacle = { id: "d3", left: 560, top: 80, right: 700, bottom: 200 };
  const d4: GridObstacle = { id: "d4", left: 480, top: 320, right: 620, bottom: 440 };
  const obstacles = [tower, d1, d2, d3, d4];
  const reqs: GridRouteRequest[] = [d1, d2, d3, d4].map((d, i) => ({
    edgeId: `e${i}`, order: i, sources: perimeter(tower), targets: perimeter(d), strokeWidth: 6,
    sourceCardId: "tower", targetCardId: d.id,
  }));
  const stats: GridSolveStats = { crossings: 0, rerouted: 0, fallbacks: 0 };
  const solved = solveGridRoutes(obstacles, reqs, stats);
  console.log(JSON.stringify(stats));
  for (const [id, r] of solved) {
    const bad = obstacles.filter((o) => violates(r.points, o)).map((o) => o.id);
    console.log(id, bad.length ? `VIOLATES ${bad}` : "ok", JSON.stringify(r.points));
  }
});
