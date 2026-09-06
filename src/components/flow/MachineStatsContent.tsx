"use client";

import type { FactoryNode, MachineHandler, NodeThroughputResult, Recipe } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";
import { RecipeTooltip } from "./RecipeTooltip";
import { tooltipMode } from "./recipe-tooltip-data";
import { buildMachineTooltip } from "./machine-tooltip-data";
import {
  cropsNhCropsPerMachine,
  cropsNhEnvironmentFromTiers,
  cropsNhExpectedDrop,
  cropsNhGrowthSpeedMultiplier,
  cropsNhHarvestRoundMultiplier,
  cropsNhHarvestTicks,
  cropsNhHarvesterEnvironment,
  cropsNhHarvesterFromTiers,
  cropsNhNutrientScore,
  getCropsNhStats,
} from "@/lib/model/passive-production";


function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/**
 * Hover panel for a crop source node: the crop's card data plus the full
 * rate derivation with the node's CURRENT stats and environment plugged into
 * the real in-game formulas.
 */
function CropSourceStatsContent({
  recipe,
  handler,
  node,
  title,
}: {
  recipe: Recipe;
  handler?: Pick<MachineHandler, "id" | "label">;
  node?: Pick<FactoryNode, "machineConfigTiers" | "machineCount">;
  title?: string;
}) {
  const stats = getCropsNhStats(recipe);
  if (!stats) {
    return null;
  }
  const cropName = recipe.name.includes(": ")
    ? recipe.name.slice(recipe.name.indexOf(": ") + 2)
    : recipe.name;
  const displayNamesById = new Map(
    recipe.outputs.map((output) => [output.id, output.displayName ?? output.id] as const),
  );
  // The node's current knobs, reshaped by the picked harvester. The worked
  // formulas live on the card's own FORMULAS strip; this hover is only the
  // figures they land on.
  const setup = cropsNhHarvesterFromTiers(
    node?.machineConfigTiers,
    handler?.id,
    stats.minSeedBedTier,
    stats.subSoil !== undefined,
  );
  const env = cropsNhHarvesterEnvironment(setup, cropsNhEnvironmentFromTiers(node?.machineConfigTiers));
  const supply = cropsNhNutrientScore(env) * 5;
  const demand = stats.tier * 10;
  const speedPercent =
    supply >= demand ? 100 + (supply - demand) : Math.max(0, 100 - (demand - supply) * 4);
  const harvestSeconds = cropsNhHarvestTicks(stats, env) / cropsNhGrowthSpeedMultiplier(setup) / 20;
  const roundMultiplier = cropsNhHarvestRoundMultiplier(setup);
  const drops = stats.drops.map((drop) => ({
    name: displayNamesById.get(drop.id) ?? drop.id,
    expected: cropsNhExpectedDrop(stats, env.gain, drop) * roundMultiplier,
  }));
  const perHarvest = drops.reduce((sum, drop) => sum + drop.expected, 0);
  const perSeed = harvestSeconds > 0 ? perHarvest / harvestSeconds : 0;
  const rows = [
    { label: "Growth speed", value: `${formatNumber(speedPercent, 0)}%` },
    { label: "Harvest every", value: Number.isFinite(harvestSeconds) && harvestSeconds > 0 ? `${formatNumber(harvestSeconds, 1)} s` : "Never" },
    ...(drops.length > 1
      ? drops.map((drop) => ({ label: drop.name, value: `${formatNumber(drop.expected, 2)} per harvest` }))
      : [{ label: "Per harvest", value: `${formatNumber(perHarvest, 2)} ${drops[0]?.name ?? "items"}` }]),
    { label: "Per seed", value: `${formatNumber(perSeed, 3)}/s` },
    { label: "Crops per machine", value: cropsNhCropsPerMachine(setup).toLocaleString() },
  ];
  return (
    <RecipeTooltip
      view={{
        title: title ?? handler?.label ?? "Crop farm",
        subtitle: `${cropName} · Tier ${stats.tier}`,
        rows,
        reason: stats.machineOnly ? "Grows only in an Industrial Farm." : undefined,
      }}
    />
  );
}

/**
 * Hover panel for a machine choice. Only says what the screen does not
 * already show: what this exact machine changes (speed, power discount,
 * parallels, structure tuning) and how the simulator overclocks it.
 */
export function MachineStatsContent({ recipe, handler, node, result, title }: {
  recipe: Recipe; handler: MachineHandler; node: FactoryNode; result?: NodeThroughputResult;
  /** The machine's real name at the card's tier, when it differs from the family label. */
  title?: string;
}) {
  const mode = useFactoryStore((state) => tooltipMode(state.project));
  if (getCropsNhStats(recipe)) {
    return <CropSourceStatsContent recipe={recipe} handler={handler} node={node} title={title} />;
  }
  return <RecipeTooltip view={buildMachineTooltip(recipe, handler, node, mode, result, title)} />;
}
