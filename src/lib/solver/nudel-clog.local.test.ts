import { describe, it, vi } from "vitest";
import fs from "node:fs";
let calls = 0; let lpMs = 0;
vi.mock("@/lib/solver/equations-core", async (importOriginal) => {
  const mod: any = await importOriginal();
  return { ...mod, solveEquationsCore: (...a: any[]) => { calls++; const s = performance.now(); const r = mod.solveEquationsCore(...a); lpMs += performance.now() - s; return r; } };
});
import { normalizeLoadedProject } from "@/lib/model/project-normalize";
import { calculateThroughput } from "@/lib/solver/throughput";
import { findClogLocks } from "@/components/flow/clog-lock";
import { findDeathSpirals } from "@/components/flow/death-spiral";

describe("nudel plan", () => {
  it("counts LP solves in diagnosis", () => {
    const raw = JSON.parse(fs.readFileSync(process.env.TEMP + "/claude/nudel/plan.json", "utf8")).plan;
    const project = normalizeLoadedProject(raw);
    let t = performance.now();
    const result = calculateThroughput(project);
    console.log("main solve ms", Math.round(performance.now() - t), "LP calls in main solve", calls, "lpMs", Math.round(lpMs));
    const frozen = project.nodes.filter((n) => n.enabled !== false && (result.nodes[n.id]?.utilization ?? 1) <= 1e-6);
    console.log("frozen machines", frozen.length, "of", project.nodes.length);
    calls = 0; lpMs = 0;
    t = performance.now();
    const locks = findClogLocks(project, result);
    console.log("clog-lock: ms", Math.round(performance.now() - t), "LP calls", calls, "LP ms", Math.round(lpMs), "locks", locks.locks.length);
    calls = 0; lpMs = 0; t = performance.now();
    const ds = findDeathSpirals(project, result);
    console.log("death-spiral ms", Math.round(performance.now() - t), "LP calls", calls, "rings", (ds as any).rings?.length);
  });
});
