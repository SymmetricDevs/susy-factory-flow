import type {
  FactoryProject,
  NodeThroughputResult,
  ResourceAmount,
  ThroughputResult,
} from "@/lib/model/types";

/** Icon fields ResourceIcon needs; recipe-map icons and recipe outputs both fit. */
export type UsageIconResource = Pick<
  ResourceAmount,
  "kind" | "id" | "amount" | "displayName" | "iconPath" | "iconAtlas" | "dominantColor"
>;

export interface UsageCell {
  nodeId: string;
  /** Machine type when known, recipe name otherwise. */
  label: string;
  recipeName: string;
  machineCount: number;
  /** Solved utilization, 0..n — over 1 means the node is overdemanded. */
  utilization: number;
  status: NodeThroughputResult["status"];
  icon?: UsageIconResource;
}

/**
 * One cell per board node, not per machine type, so each cell points at a
 * specific card. Sorted busiest first; disabled and broken nodes are skipped
 * because they have no usage to report.
 */
export function buildUsageCells(
  project: Pick<FactoryProject, "nodes" | "recipes">,
  result: Pick<ThroughputResult, "nodes">,
  machineIconsByRecipeMap?: Map<string, UsageIconResource>,
): UsageCell[] {
  const recipesById = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  const cells: UsageCell[] = [];

  for (const node of project.nodes) {
    const nodeResult = result.nodes[node.id];
    if (!nodeResult || !nodeResult.enabled || nodeResult.status === "missing-recipe") {
      continue;
    }

    const recipe = recipesById.get(node.recipeId);
    const recipeMap = recipe?.source?.recipeMap;
    const machineIcon = recipeMap ? machineIconsByRecipeMap?.get(recipeMap) : undefined;
    // The machine item's icon when the dataset names one; otherwise the main
    // output, which is how the node is recognised on the canvas anyway.
    const icon = machineIcon ?? recipe?.outputs[0];

    const utilization = Number.isFinite(nodeResult.utilization)
      ? Math.max(0, nodeResult.utilization)
      : 0;

    cells.push({
      nodeId: node.id,
      label: recipe?.machineType || nodeResult.recipeName,
      recipeName: nodeResult.recipeName,
      machineCount: node.machineCount,
      utilization,
      status: nodeResult.status,
      icon,
    });
  }

  return cells.sort((left, right) => right.utilization - left.utilization);
}
