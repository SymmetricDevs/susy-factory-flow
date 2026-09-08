import type { FactoryNode, MachineHandler, Recipe, ResourceAmount } from "@/lib/model/types";
import {
  applyRecipeInputOverrides,
  getRecipeMachineHandlers,
  isOreDictionaryResource,
  isRecipeInputConsumed,
} from "@/lib/model";
import { isPowerRecipe } from "@/lib/power/power-recipe";
import { isCropFarmRecipe } from "@/lib/model/passive-production";
import { isCustomRateRecipe } from "@/lib/model/custom-rate";
import { queryRecipeDatasetRecipes } from "./browser-loader";
import { MAX_RECIPE_QUERY_CLAUSES, type RecipeQueryClause } from "./recipe-query";
import { DEFAULT_DATASET_MANIFEST_URL } from "./remote";
import type { DatasetVersion, RecipeSummary } from "./types";

/**
 * A card's TWINS (Jack, 2026-09-07): every other recipe in the dataset that
 * takes exactly this card's consumed inputs and makes exactly its outputs -
 * the refactor search with both sides set to ONLY - flattened over the
 * machines each one runs on. They share the machine menu under the card's
 * name bar with the recipe's own handlers, because a swap onto one is as
 * lossless as a machine switch: every port the wires need is on the twin,
 * so every wire re-docks. Amounts, time and power may differ; non-consumed
 * slots (circuits, molds) may come and go. The swap itself is the refactor
 * (`refactorNodeWithRecipe`), one undo step.
 */
export interface RecipeTwin {
  recipe: RecipeSummary;
  handler: MachineHandler;
}

/** How many twins the menu asks for; more than this is a search, not a menu. */
export const RECIPE_TWIN_LIMIT = 200;

/**
 * The ONLY conditions a card's recipe poses. Undefined when the card has no
 * twins to ask about: generators (their product is EU, a pseudo resource),
 * crop farms and custom rate cards (synthesized, never in the dataset), and
 * a recipe with no consumed input or no output.
 */
export function buildRecipeTwinClauses(
  recipe: Recipe,
  node: Pick<FactoryNode, "recipeInputOverrides">,
): RecipeQueryClause[] | undefined {
  if (isPowerRecipe(recipe) || isCropFarmRecipe(recipe) || isCustomRateRecipe(recipe)) {
    return undefined;
  }
  const effective = applyRecipeInputOverrides(recipe, node);
  const clauses: RecipeQueryClause[] = [];
  const seen = new Set<string>();
  const push = (role: RecipeQueryClause["role"], resource: ResourceAmount) => {
    // An oredict slot asks as its first concrete face, like the refactor
    // seed: a condition is a thing, not a dictionary entry.
    const face =
      (isOreDictionaryResource(resource) ? resource.alternatives?.[0] : undefined) ?? resource;
    const key = `${role}:${face.kind}:${face.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    clauses.push({ role, kind: face.kind, id: face.id });
  };
  for (const input of effective.inputs) {
    if (isRecipeInputConsumed(input)) push("takes", input);
  }
  for (const output of effective.outputs) {
    push("makes", output);
  }
  const hasTakes = clauses.some((clause) => clause.role === "takes");
  const hasMakes = clauses.some((clause) => clause.role === "makes");
  if (!hasTakes || !hasMakes || clauses.length > MAX_RECIPE_QUERY_CLAUSES) {
    return undefined;
  }
  return clauses;
}

/** Whether a card can have twins at all, so the chevron knows to show. */
export function recipeMayHaveTwins(recipe: Recipe, node: Pick<FactoryNode, "recipeInputOverrides">): boolean {
  return buildRecipeTwinClauses(recipe, node) !== undefined;
}

const slotKey = (slot: ResourceAmount) => `${slot.kind}:${slot.id}:${slot.amount}`;

/**
 * The card's own recipe, seen through the dataset. Ids alone do not settle
 * it - an older plan can carry a recipe under a pre-rebuild id - so a
 * candidate that runs on the same map for the same time and power with the
 * same slots and amounts is the card's recipe, not a twin.
 */
export function isSameRecipeContent(
  recipe: Pick<Recipe, "id" | "durationTicks" | "eut" | "inputs" | "outputs" | "source" | "machineType">,
  candidate: RecipeSummary,
): boolean {
  if (candidate.id === recipe.id) return true;
  const recipeMap = recipe.source?.recipeMap ?? recipe.machineType;
  if (candidate.recipeMap !== recipeMap) return false;
  if (candidate.durationTicks !== recipe.durationTicks || candidate.eut !== recipe.eut) return false;
  const sameSlots = (a: ResourceAmount[], b: ResourceAmount[]) => {
    if (a.length !== b.length) return false;
    const keys = new Set(a.map(slotKey));
    return b.every((slot) => keys.has(slotKey(slot)));
  };
  return sameSlots(recipe.inputs, candidate.inputs) && sameSlots(recipe.outputs, candidate.outputs);
}

/**
 * Flatten twin recipes over their machines, the card's own recipe left out.
 * A twin on the same map as the card (an Assembler recipe differing only in
 * circuit) keeps its rows: same machine, different figures, an honest
 * alternative.
 */
export function flattenRecipeTwins(recipe: Recipe, candidates: RecipeSummary[]): RecipeTwin[] {
  const twins: RecipeTwin[] = [];
  for (const candidate of candidates) {
    if (isSameRecipeContent(recipe, candidate)) continue;
    for (const handler of getRecipeMachineHandlers(candidate)) {
      twins.push({ recipe: candidate, handler });
    }
  }
  return twins;
}

export async function fetchRecipeTwins(
  version: DatasetVersion,
  recipe: Recipe,
  node: Pick<FactoryNode, "recipeInputOverrides">,
  options: { signal?: AbortSignal } = {},
): Promise<RecipeTwin[]> {
  const clauses = buildRecipeTwinClauses(recipe, node);
  if (!clauses) return [];
  const result = await queryRecipeDatasetRecipes(
    DEFAULT_DATASET_MANIFEST_URL,
    version,
    {
      query: "",
      mode: "recipes",
      clauses,
      takesOp: "only",
      makesOp: "only",
      allMaps: true,
      maxTier: "all",
      offset: 0,
      limit: RECIPE_TWIN_LIMIT,
    },
    options,
  );
  return flattenRecipeTwins(recipe, result.recipes);
}
