import { describe, expect, it } from "vitest";
import { PROJECT_SCHEMA_VERSION, type FactoryNode, type FactoryProject, type Recipe, type ResourceAmount } from "@/lib/model/types";
import { calculateThroughput } from "@/lib/solver/throughput";
import { buildRailPorts, deriveNodeVerdict, type RailPort } from "./node-verdict";
import { buildCountTooltip, buildPortTooltip, buildStatusTooltip, resourceTooltipActions } from "./recipe-tooltip-data";
import { buildMachineTooltip } from "./machine-tooltip-data";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { getNodePowerReport } from "@/lib/solver/power-report";

const input = { kind: "fluid" as const, id: "chlorine", displayName: "Chlorine", amount: 100 };
const output = { kind: "item" as const, id: "product", displayName: "Product", amount: 1 };
const recipe: Recipe = { id: "r", name: "Test reaction", machineType: "Chemical Reactor", minimumTier: "LV", durationTicks: 20, eut: 30, inputs: [input], outputs: [output] };
const node: FactoryNode = { id: "n", recipeId: "r", machineCount: 2, parallel: 1, overclockTier: "LV", enabled: true, position: { x: 0, y: 0 } };
function project(extra: Partial<FactoryProject> = {}): FactoryProject {
  return { schemaVersion: PROJECT_SCHEMA_VERSION, id: "tooltip", name: "Tooltip", recipes: [recipe], nodes: [node], edges: [], fuelProfiles: [], ...extra } as FactoryProject;
}
function port(resource: ResourceAmount = input, side: "input" | "output" = "input"): RailPort {
  return { side, kind: resource.kind, key: `${resource.kind}:${resource.id}`, resourceId: resource.id, displayName: resource.displayName ?? resource.id,
    resource, handleId: `${side}:${resource.kind}:${resource.id}`, connected: true, unsupplied: false, boundaryFree: false,
    nameplatePerSecond: 100, currentPerSecond: 50, wantedPerSecond: 100, couldPerSecond: 100, showNameplate: false, fillFraction: 0.5, tone: "calm" };
}
function calculated(p: FactoryProject) {
  const result = calculateThroughput(p, { generatedAt: "fixed" });
  const verdict = deriveNodeVerdict(p, result, "n");
  const rails = buildRailPorts(p, result, "n", recipe, verdict);
  return { result, verdict, rails };
}
const pool = () => project({ poolMode: true, solveMode: true, nodes: [{ ...node, solvePin: 2 }] });

describe("mode-aware resource tooltips", () => {
  it("shows normal automatic imports without wiring advice", () => {
    const p = pool();
    const { result, verdict, rails } = calculated(p);
    const view = buildPortTooltip(p, result, "n", rails.inputs[0]!, verdict);
    expect(view.subtitle).toBe("Imported input");
    expect(view.rows[0]?.label).toBe("Imported");
    expect(view.requirement).toBeUndefined();
    expect(view.actions?.map(a => a.label)).toEqual(["Recipes", "Uses"]);
    expect(JSON.stringify(view)).not.toMatch(/source drawer|pool:|pool-edge:/);
  });
  it("does not label locally produced pool resources as automatic imports", () => {
    const p = pool();
    p.recipes = [...p.recipes, { ...recipe, id: "producer", name: "Producer", inputs: [], outputs: [input] }];
    p.nodes = [...p.nodes, { ...node, id: "producer", recipeId: "producer", solvePin: 1 }];
    const { result, verdict, rails } = calculated(p);
    const view = buildPortTooltip(p, result, "n", rails.inputs[0]!, verdict);
    expect(view.subtitle).toBe("Input");
    expect(view.rows.some(r => r.label === "Imported")).toBe(false);
  });
  it.each([false, true])("requires a connection in closed mode (solve=%s)", solveMode => {
    const p = project({ solveMode, nodes: [{ ...node, solvePin: 2 }] });
    const { result, verdict } = calculated(p);
    const view = buildPortTooltip(p, result, "n", { ...port(), connected: false }, verdict);
    expect(view.requirement).toBe("You must connect this input.");
    expect(view.actions?.map(a => a.label)).toContain("Drag to connect");
  });
  it("omits Pool product drawer creation when the resource already has one", () => {
    const p = pool();
    expect(resourceTooltipActions(p, port(output, "output"))).toHaveLength(3);
    const withDrawer = { ...p, storages: [{ id: "out", kind: output.kind, resourceId: output.id, position: { x: 0, y: 0 }, poolSide: "drain" as const }] };
    expect(resourceTooltipActions(withDrawer, port(output, "output"))).toHaveLength(2);
    expect(resourceTooltipActions(p, port())).toHaveLength(2);
  });
  it("does not invent rates without a target or result", () => {
    const p = project({ solveMode: true, poolMode: true });
    const { result, verdict } = calculated(p);
    expect(buildPortTooltip(p, result, "n", port(), verdict).rows).toEqual([]);
    expect(buildPortTooltip(project(), undefined, "n", port(), verdict).reason).toBe("Calculation unavailable.");
  });
  it("labels partial consumption separately from full-rate capacity", () => {
    const p = project();
    const { result } = calculated(p);
    const view = buildPortTooltip(p, result, "n", port(), { kind: "demand-set", pct: 50 } as ReturnType<typeof deriveNodeVerdict>);
    expect(view.rows.map(r => r.label)).toEqual(["Consumed", "At full capacity"]);
  });
  it("preserves concrete identity and cell item units", () => {
    const p = project();
    const { result, verdict } = calculated(p);
    const cell = port({ kind: "item", id: "chlorine-cell", displayName: "Chlorine Cell", amount: 1 });
    const view = buildPortTooltip(p, result, "n", cell, verdict);
    expect(view.title).toBe("Chlorine Cell");
    expect(view.rows[0]?.value).not.toMatch(/L\//);
  });
  it("labels chance-weighted production and does not attach whole-pool demand to one output", () => {
    const p = pool();
    const { result, verdict } = calculated(p);
    const chancePort = port({ ...output, chance: 0.5 } as ResourceAmount, "output");
    const view = buildPortTooltip(p, result, "n", chancePort, verdict);
    expect(view.rows.map(r => r.label)).toEqual(["Average output"]);
    expect(view.reason).toContain("shared resource pool");
  });
  it("does not recommend scaling a machine with a blocked output", () => {
    const view = buildStatusTooltip({ kind: "clogged", pct: 0, clog: { displayName: "Product", stoppedTakerName: "Consumer" } } as ReturnType<typeof deriveNodeVerdict>, "solve");
    expect(view.reason).toBe("Consumer has stopped.");
    expect(JSON.stringify(view)).not.toMatch(/more machines|add machines/i);
  });
});

describe("machine tooltip counts and effective statistics", () => {
  it("distinguishes calculated, pinned, and unavailable counts", () => {
    expect(buildCountTooltip(2.5).rows).toContainEqual({ label: "Whole machines", value: "3" });
    expect(buildCountTooltip(2.5, 4).rows[0]).toEqual({ label: "Fixed count", value: "4" });
    expect(buildCountTooltip(undefined).reason).toBe("Calculation unavailable.");
    expect(buildCountTooltip(0.0001).rows[0]?.value).toBe("<0.001");
  });
  it.each(["build", "solve", "pool"] as const)("uses effective stats and correct count basis in %s", mode => {
    const { result } = calculated(pool());
    const handler = { id: "reactor", label: "Chemical Reactor", machineType: "Chemical Reactor", minimumTier: "LV", kind: "single" as const };
    const view = buildMachineTooltip(recipe, handler, node, mode, result.nodes.n);
    expect(view.rows[0]?.label).toBe(mode === "build" ? "Installed machines" : "Required machines");
    const stats = getOverclockedRecipeStats(recipe, { ...node, machineHandlerId: handler.id });
    expect(view.rows).toContainEqual({ label: "Time per operation", value: `${stats.durationTicks / 20} s` });
  });
  it("uses curated multiblock stats even when exported handler values disagree", () => {
    const multi: Recipe = { ...recipe, machineType: "Volcanus", durationTicks: 200, eut: 120,
      machineHandlers: [{ id: "volcanus", label: "Volcanus", machineType: "Volcanus", minimumTier: "LV", kind: "multiblock", durationTicks: 9999, eut: 9999 }] };
    const handler = multi.machineHandlers![0]!;
    const view = buildMachineTooltip(multi, handler, { ...node, machineHandlerId: handler.id }, "build");
    const power = getNodePowerReport(multi, { ...node, machineHandlerId: handler.id });
    expect(view.subtitle).toBe("Multiblock");
    expect(view.rows.find(r => r.label === "Draw per machine")?.value).toContain(String(power.drawEuT));
    expect(JSON.stringify(view)).not.toMatch(/Exact|Estimated|9999/);
  });
});
