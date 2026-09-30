import type { Recipe } from "./types";

/**
 * The LEGACY trash can node: a pure void with an empty recipe that eats
 * anything wired into it. The load funnel converts cans to trash-mode drawers
 * (project-normalize.ts); this remains for recognising them and as dead-path
 * safety in the solver (equilibrium.ts, role "trash").
 */
export const TRASH_MACHINE_TYPE = "Trash Can";
/** The can's universal wire-here port: accepts any concrete resource. */
export const TRASH_ANY_RESOURCE_ID = "trash-any";

export function isTrashRecipe(recipe: Pick<Recipe, "machineType"> | undefined): boolean {
  return recipe?.machineType === TRASH_MACHINE_TYPE;
}

export function createTrashPlaceholderRecipe(id: string): Recipe {
  return {
    id,
    name: "Trash Can",
    kind: "custom",
    category: "trash",
    machineType: TRASH_MACHINE_TYPE,
    minimumTier: "NONE",
    durationTicks: 20,
    eut: 0,
    inputs: [],
    outputs: [],
    notes: "Voids everything piped in. Trashed resources never show as outputs.",
    source: { recipeMap: "trash" },
  };
}

/** Trash node ids in a project — the solver and balance layers key off this. */
export function collectTrashNodeIds(project: {
  nodes: Array<{ id: string; recipeId: string }>;
  recipes: Array<Pick<Recipe, "id" | "machineType">>;
}): Set<string> {
  const trashRecipeIds = new Set<string>();
  for (const recipe of project.recipes) {
    if (isTrashRecipe(recipe)) {
      trashRecipeIds.add(recipe.id);
    }
  }
  const ids = new Set<string>();
  if (trashRecipeIds.size === 0) {
    return ids;
  }
  for (const node of project.nodes) {
    if (trashRecipeIds.has(node.recipeId)) {
      ids.add(node.id);
    }
  }
  return ids;
}
