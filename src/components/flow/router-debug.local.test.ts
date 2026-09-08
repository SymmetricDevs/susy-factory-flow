import { it } from "vitest";
import { solveGridRoutes, type GridEndpoint, type GridObstacle } from "./grid-edge-router";
function card(id: string, x: number, y: number, width = 360, height = 160): GridObstacle {
  return { id, left: x, top: y, right: x + width, bottom: y + height };
}
function rim(o: GridObstacle): GridEndpoint[] {
  const out: GridEndpoint[] = [];
  for (let x = o.left + 40; x <= o.right - 40; x += 20) out.push({ x, y: o.top, side: "top" }, { x, y: o.bottom, side: "bottom" });
  for (let y = o.top + 40; y <= o.bottom - 40; y += 20) out.push({ x: o.left, y, side: "left" }, { x: o.right, y, side: "right" });
  return out;
}
it("debug", () => {
  const tower = card("tower", -320, 400, 600, 500);
  const drawers = [card("creosote", 200, 80, 140, 120), card("phenol", 400, 80, 140, 120), card("benzene", 560, 80, 140, 120), card("naphtha", 480, 320, 140, 120)];
  const requests = drawers.map((d, i) => ({ edgeId: `to-${d.id}`, order: i, sources: rim(tower), targets: rim(d), strokeWidth: 8, sourceCardId: "tower", targetCardId: d.id }));
  const solved = solveGridRoutes([tower, ...drawers], requests);
  for (const [id, r] of solved) console.log(id, JSON.stringify(r.points));
});
