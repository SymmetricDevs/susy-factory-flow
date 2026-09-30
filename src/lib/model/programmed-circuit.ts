import type { Recipe, RecipeInput, ResourceAmount } from "./types";

/**
 * The one item GregTech's circuit slot holds. A recipe that dials it lists it
 * as a non-consumed input, which is why it never shows up on a card's rails:
 * the board only draws inputs something has to supply.
 */
export const PROGRAMMED_CIRCUIT_ITEM_ID = "gregtech:gt.integrated_circuit";

export function isProgrammedCircuitResource(
  resource: Pick<ResourceAmount, "kind" | "id">,
): boolean {
  return (
    resource.kind === "item" &&
    resource.id.replace(/@\d+$/, "") === PROGRAMMED_CIRCUIT_ITEM_ID
  );
}

export interface RecipeProgrammedCircuit {
  /** The number the slot has to be dialled to, or undefined for "any". */
  setting?: string;
  /** The circuit item itself, when the recipe carries one to draw. */
  resource?: RecipeInput;
}

/**
 * The circuit slot a recipe runs on, or undefined for a recipe that has no
 * such slot at all.
 *
 * Every GregTech machine has the slot, so a GregTech recipe always answers:
 * with a number, or with an empty slot meaning any setting. The card draws
 * the slot so those two cases look different.
 */
export function getRecipeProgrammedCircuit(
  recipe: Pick<Recipe, "kind" | "inputs" | "programmedCircuit">,
): RecipeProgrammedCircuit | undefined {
  if (recipe.kind !== "gregtech_machine") {
    return undefined;
  }

  // A circuit setting is a small number. Older datasets put a whole item name
  // in this field ("Circuit Board (configuration 32100)"); ignore those.
  const raw = recipe.programmedCircuit;
  const setting = raw && /^\d{1,2}$/.test(raw) ? raw : undefined;

  return {
    setting,
    resource: recipe.inputs.find((input) => isProgrammedCircuitResource(input)),
  };
}
