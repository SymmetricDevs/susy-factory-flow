import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { solveGridRoutes } from "./grid-edge-router";
it("dumps routes", { timeout: 120000 }, () => {
  const cap = JSON.parse(readFileSync(process.env.SOLVE_CAPTURE!, "utf8"));
  const solved = solveGridRoutes(cap.obstacles, cap.requests);
  writeFileSync(process.env.ROUTES_OUT!, JSON.stringify([...solved.entries()]));
});
