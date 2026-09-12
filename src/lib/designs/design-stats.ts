import { computeCommunityPlanStats } from "@/lib/community/plan-stats";
import { getNodeMachineBuildCount } from "@/lib/model/passive-production";
import { GT_VOLTAGE_TIERS, getVoltageTierIndex } from "@/lib/model/tiers";
import type { FactoryProject, MachineTier, ThroughputResult } from "@/lib/model/types";

export type VoltageTierName = Exclude<MachineTier, "DEMO">;

/**
 * The little stat row a library tile wears: the same figures a shared
 * setup carries, computed for your own designs at save time so a design and
 * a post read identically. EU/t needs a solve, so it is present only when
 * the design was saved from the canvas with its books in hand.
 */
export interface DesignStats {
  cards: number;
  machines: number;
  tier?: VoltageTierName;
  tierIndex: number;
  euT?: number;
  /**
   * What the design takes in and gives out, as "kind:resourceId" keys, for
   * the library's item filter. Needs the books, like EU/t, so present only
   * for a design saved from the canvas.
   */
  takes?: string[];
  makes?: string[];
}

function isVoltageTier(value: unknown): value is VoltageTierName {
  return typeof value === "string" && GT_VOLTAGE_TIERS.some((entry) => entry.tier === value);
}

export function computeDesignStats(
  project: FactoryProject,
  result?: ThroughputResult,
): DesignStats {
  let tierIndex = -1;
  let tier: VoltageTierName | undefined;
  let machines = 0;
  const recipesById = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  for (const node of project.nodes) {
    if (!node.enabled) {
      continue;
    }
    machines += getNodeMachineBuildCount(recipesById.get(node.recipeId), node);
    if (isVoltageTier(node.overclockTier)) {
      const index = getVoltageTierIndex(node.overclockTier);
      if (index > tierIndex) {
        tierIndex = index;
        tier = node.overclockTier;
      }
    }
  }
  const stats: DesignStats = {
    cards: project.nodes.length + (project.storages?.length ?? 0),
    machines,
    tierIndex,
  };
  if (tier) {
    stats.tier = tier;
  }
  if (result && Number.isFinite(result.totalEuT)) {
    stats.euT = result.totalEuT;
  }
  if (result) {
    const flows = computeCommunityPlanStats(project, result);
    stats.takes = flows.needs.map((stat) => `${stat.kind}:${stat.resourceId}`);
    stats.makes = flows.outputs.map((stat) => `${stat.kind}:${stat.resourceId}`);
  }
  return stats;
}
