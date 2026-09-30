import type { CustomRateMode, FactoryNode, Recipe, ResourceAmount } from "./types";

/**
 * The custom rate node: a source/sink you dial by hand. Supply mode makes a
 * chosen resource at a fixed rate for requesters; request mode is the
 * negative: a constant drain that asks for the resource. Modeled as a
 * synthetic one-second recipe (amount per craft == rate per second), so the
 * solver treats it like any other machine with no special cases.
 *
 * A card holds its resource only while wired. Pull the last wire and it lets
 * go and offers its universal ports again (`releaseCustomRates`), so it never
 * refuses a different resource. The dial survives on the node
 * (`FactoryNode.customRate`); the resource does not.
 */
export const CUSTOM_RATE_MACHINE_TYPE = "Custom Rate";
export const CUSTOM_RATE_DURATION_TICKS = 20;
/** The placeholder's universal wire-here ports adopt whatever connects. */
export const CUSTOM_RATE_ANY_RESOURCE_ID = "custom-any";
/** The rate a card starts on, before anyone has dialed one. */
export const CUSTOM_RATE_DEFAULT_PER_SECOND = 1;

export type { CustomRateMode };

export function isCustomRateRecipe(
  recipe: Pick<Recipe, "machineType"> | undefined,
): boolean {
  return recipe?.machineType === CUSTOM_RATE_MACHINE_TYPE;
}

/**
 * Is this card a custom rate card? The CARD is the socket, not the port id it
 * is showing: a card holding water still accepts a drop of lava.
 */
export function isCustomRateNodeId(
  project: {
    nodes: Array<Pick<FactoryNode, "id" | "recipeId">>;
    recipes: Array<Pick<Recipe, "id" | "machineType">>;
  },
  nodeId: string | null | undefined,
): boolean {
  if (!nodeId) {
    return false;
  }
  const node = project.nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    return false;
  }
  return isCustomRateRecipe(project.recipes.find((entry) => entry.id === node.recipeId));
}

export function getCustomRateSlot(
  recipe: Pick<Recipe, "inputs" | "outputs">,
): { resource: ResourceAmount; mode: CustomRateMode } | undefined {
  if (recipe.outputs[0]) {
    return { resource: recipe.outputs[0], mode: "supply" };
  }
  if (recipe.inputs[0]) {
    return { resource: recipe.inputs[0], mode: "request" };
  }
  return undefined;
}

export function createCustomRatePlaceholderRecipe(id: string): Recipe {
  return {
    id,
    name: "Custom Rate",
    kind: "custom",
    category: "custom-rate",
    machineType: CUSTOM_RATE_MACHINE_TYPE,
    minimumTier: "NONE",
    durationTicks: CUSTOM_RATE_DURATION_TICKS,
    eut: 0,
    inputs: [],
    outputs: [],
    notes: "Wire any port to this and it adopts that resource.",
    source: { recipeMap: "custom-rate" },
  };
}

/** The empty recipe again: same id, same node, no resource and no name. */
export function withoutCustomRateSlot(recipe: Recipe): Recipe {
  return { ...recipe, name: "Custom Rate", inputs: [], outputs: [] };
}

/**
 * The dial a card is set to: what the panel shows and what the next adoption
 * starts from. The remembered value on the node wins over the live slot, so
 * dialing a rate and then rewiring the card keeps the number you typed.
 */
export function getCustomRateDial(
  node: Pick<FactoryNode, "customRate">,
  recipe: Pick<Recipe, "inputs" | "outputs">,
): { perSecond: number; mode: CustomRateMode } {
  const slot = getCustomRateSlot(recipe);
  return {
    perSecond:
      node.customRate?.perSecond ?? slot?.resource.amount ?? CUSTOM_RATE_DEFAULT_PER_SECOND,
    mode: node.customRate?.mode ?? slot?.mode ?? "supply",
  };
}

/**
 * Every custom rate card left holding a resource with nothing wired to it,
 * emptied. Returns the same project when there is nothing to release, so the
 * common mutation costs one pass over the nodes and allocates nothing.
 * Runs from `touchProject` after EVERY project edit, so no path (wire delete,
 * far-end delete, undo) can leave a card stuck on an unconnected resource.
 */
export function releaseCustomRates<
  Project extends {
    nodes: FactoryNode[];
    recipes: Recipe[];
    edges: Array<{ source: string; target: string }>;
  },
>(project: Project): Project {
  const customRecipeIds = new Set<string>();
  for (const recipe of project.recipes) {
    if (isCustomRateRecipe(recipe) && getCustomRateSlot(recipe)) {
      customRecipeIds.add(recipe.id);
    }
  }
  if (customRecipeIds.size === 0) {
    return project;
  }

  const wired = new Set<string>();
  for (const edge of project.edges) {
    wired.add(edge.source);
    wired.add(edge.target);
  }
  const releasedRecipeIds = new Set<string>();
  for (const node of project.nodes) {
    if (customRecipeIds.has(node.recipeId) && !wired.has(node.id)) {
      releasedRecipeIds.add(node.recipeId);
    }
  }
  if (releasedRecipeIds.size === 0) {
    return project;
  }

  return {
    ...project,
    recipes: project.recipes.map((recipe) =>
      releasedRecipeIds.has(recipe.id) ? withoutCustomRateSlot(recipe) : recipe,
    ),
  };
}

/**
 * The recipe with its single slot set: `perSecond` is the amount per craft
 * because the craft takes exactly one second.
 */
export function withCustomRateSlot(
  recipe: Recipe,
  resource: Pick<
    ResourceAmount,
    "kind" | "id" | "displayName" | "iconPath" | "iconAtlas" | "dominantColor" | "tooltip"
  >,
  mode: CustomRateMode,
  perSecond: number,
): Recipe {
  const slot: ResourceAmount = {
    kind: resource.kind,
    id: resource.id,
    amount: Math.max(0, perSecond),
    displayName: resource.displayName,
    iconPath: resource.iconPath,
    iconAtlas: resource.iconAtlas,
    dominantColor: resource.dominantColor,
    tooltip: resource.tooltip,
  };
  return {
    ...recipe,
    name: `Custom Rate: ${resource.displayName ?? resource.id}`,
    inputs: mode === "request" ? [slot] : [],
    outputs: mode === "supply" ? [slot] : [],
  };
}
