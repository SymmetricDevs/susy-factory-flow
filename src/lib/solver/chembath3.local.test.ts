import { it } from "vitest";
import fs from "node:fs";
import { normalizeLoadedProject } from "@/lib/model/project-normalize";
import { calculateThroughput } from "@/lib/solver/throughput";
it("slim vs full", () => {
  for (const f of ["src/components/flow/__fixtures__/titanium-line-chembath.json", "src/components/flow/__fixtures__/titanium-line-chembath.json.slim.json"]) {
    const project = normalizeLoadedProject(JSON.parse(fs.readFileSync(f, "utf8")));
    const r = calculateThroughput(project, { generatedAt: "fixed" });
    console.log(f.split("/").pop(), project.nodes.map((n) => (r.nodes[n.id].utilization * 100).toFixed(1)).join(" "));
  }
});
