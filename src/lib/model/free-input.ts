import type { ResourceAmount } from "./types";

/**
 * Inputs the GAME hands out for nothing. GregTech's Rock Breaker lists a
 * placeholder item literally named "IT'S FREE! Place Lava on Side": the
 * recipe wants lava touching the machine, not a stack fed into it, so no
 * pipe, no drawer and no rate can ever be the honest answer for that slot.
 *
 * The board treats such a slot as never consumed - the solver never asks
 * for it, no wire lands on it, no bare-slot mark names it - but the card
 * still DRAWS it, greyed, so the player knows to set the lava down.
 */
export const FREE_INPUT_ITEM_IDS: ReadonlySet<string> = new Set([
  "gregtech:gt.metaitem.02@32765",
]);

export function isFreeRecipeInput(resource: Pick<ResourceAmount, "id"> & { kind?: string }): boolean {
  return (resource.kind === undefined || resource.kind === "item") && FREE_INPUT_ITEM_IDS.has(resource.id);
}
