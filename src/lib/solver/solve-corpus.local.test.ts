import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import { parseFactoryProjectJson } from "@/lib/import-export/factory-json";
import { calculateThroughput } from "./throughput";

// Scratch harness: time the solver over the downloaded community corpus to
// find boards whose solve blocks the main thread for seconds or minutes.
const CORPUS_DIR = path.join(
  "C:/Users/jack/AppData/Local/Temp/claude/C--Users-jack-gtnh-factory-flow/cf8ae0c6-ab38-4496-abf0-e8e30d48870c/scratchpad/community-plans",
);

describe("solver timing over community corpus", () => {
  it("times each board", () => {
    const rows: Array<{ file: string; name: string; nodes: number; ms: number }> = [];
    for (const file of readdirSync(CORPUS_DIR)) {
      const raw = JSON.parse(readFileSync(path.join(CORPUS_DIR, file), "utf8")) as {
        name?: string;
        plan?: unknown;
      };
      let project;
      try {
        project = parseFactoryProjectJson(JSON.stringify(raw.plan ?? raw));
      } catch (error) {
        console.log(file, "parse failed:", String(error).slice(0, 120));
        continue;
      }
      const start = performance.now();
      try {
        calculateThroughput(project);
      } catch (error) {
        console.log(file, "solve failed:", String(error).slice(0, 120));
        continue;
      }
      rows.push({
        file: file.slice(0, 8),
        name: raw.name ?? "?",
        nodes: project.nodes.length,
        ms: Math.round(performance.now() - start),
      });
    }
    rows.sort((a, b) => b.ms - a.ms);
    const lines = rows.map(
      (row) => `${String(row.ms).padStart(7)}ms  ${String(row.nodes).padStart(4)} nodes  ${row.name}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").writeFileSync(path.join(CORPUS_DIR, "..", "solve-times.txt"), lines.join("\n") + `\nfiles=${readdirSync(CORPUS_DIR).length} solved=${rows.length}\n`);
  }, 600000);

  it("scaling: platline cloned N times in one project", () => {
    const raw = JSON.parse(
      readFileSync(path.join(CORPUS_DIR, "52315cf8-d058-4219-a124-2b5c328b77b6.json"), "utf8"),
    ) as { plan?: unknown };
    const base = parseFactoryProjectJson(JSON.stringify(raw.plan));
    const results: string[] = [];
    for (const copies of [1, 2, 4, 8, 16]) {
      const project = structuredClone(base);
      project.nodes = [];
      project.edges = [];
      for (let c = 0; c < copies; c++) {
        const suffix = `-copy${c}`;
        for (const node of base.nodes) {
          project.nodes.push({ ...structuredClone(node), id: node.id + suffix });
        }
        for (const edge of base.edges) {
          const clone = structuredClone(edge);
          clone.id = edge.id + suffix;
          clone.source = edge.source + suffix;
          clone.target = edge.target + suffix;
          project.edges.push(clone);
        }
      }
      const start = performance.now();
      calculateThroughput(project);
      results.push(
        `${copies}x (${project.nodes.length} nodes): ${Math.round(performance.now() - start)}ms`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").writeFileSync(path.join(CORPUS_DIR, "..", "scaling.txt"), results.join("\n") + "\n");
  }, 600000);
});
