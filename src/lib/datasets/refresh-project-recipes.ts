import type { DatasetVersion } from "./types";
import type { Recipe } from "@/lib/model/types";
import { isPowerRecipe } from "@/lib/power/power-recipe";
import { recipeContentRef } from "@/lib/import-export/recipe-ref-match";
import { getRecipeDatasetRecipe, resolveRecipeDatasetRecipes } from "./browser-loader";

/**
 * The dataset's current bodies for a plan's stored recipes.
 *
 * By id first. A stored id the dataset no longer has (recipe ids were
 * re-keyed when the pipeline moved to content ids, and every rebuild can
 * re-key again) is matched by what it takes and makes, the way import does,
 * and comes back with a `migration` entry from the stored id to the id that
 * now stands for it - so a card placed before a rebuild still picks up the
 * dataset's handlers (a tier cap, a new face) instead of keeping a stale
 * body forever. Power cards are synthesized on the way in and are skipped.
 */
export async function resolveProjectRecipes(
  manifestUrl: string,
  version: DatasetVersion,
  recipes: Recipe[],
): Promise<{ refreshed: Recipe[]; migration: Record<string, string> }> {
  const byId = await Promise.allSettled(
    recipes.map((recipe) => getRecipeDatasetRecipe(manifestUrl, version, recipe.id)),
  );
  const refreshed = byId
    .filter((result): result is PromiseFulfilledResult<Recipe> => result.status === "fulfilled")
    .map((result) => result.value);
  const stale = recipes.filter(
    (recipe, index) => byId[index]?.status === "rejected" && !isPowerRecipe(recipe),
  );
  const migration: Record<string, string> = {};
  if (stale.length > 0) {
    try {
      const resolved = await resolveRecipeDatasetRecipes(manifestUrl, version, stale.map(recipeContentRef));
      const fetched = await Promise.allSettled(
        resolved.matches.map(async (match) => ({
          importedId: match.importedId,
          recipe: await getRecipeDatasetRecipe(manifestUrl, version, match.recipeId),
        })),
      );
      for (const result of fetched) {
        if (result.status === "fulfilled") {
          migration[result.value.importedId] = result.value.recipe.id;
          refreshed.push(result.value.recipe);
        }
      }
    } catch {
      // No match service: the stored bodies keep working as they are.
    }
  }
  return { refreshed, migration };
}
