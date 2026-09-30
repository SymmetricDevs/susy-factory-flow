import { makeResourceKey } from "@/lib/model/resources";
import type { FactoryProject, FactoryStorage, ResourceBalance } from "@/lib/model/types";

/**
 * Outputs are ONE section: product vs byproduct matters to the drawer's
 * machine, but here both are simply what leaves the line, and splitting them
 * would list one resource twice with neither figure being the total.
 */
export type FlowSectionId = "need" | "output" | "internal";

export type FlowSectionTone = FlowSectionId;

export interface FlowSection {
  id: FlowSectionId;
  label: string;
  empty: string;
  tone: FlowSectionTone;
  /** Sign applied to the headline rate. Needs read negative, outputs positive. */
  sign: -1 | 0 | 1;
  items: ResourceBalance[];
  /** Total before the filter was applied, for the "12 / 187" count. */
  totalCount: number;
}

export type FlowRow =
  // A source or product drawer behind an Inputs or Outputs row, hung under
  // it like a file in a folder, with its own rule and rate.
  | { type: "drawer"; key: string; section: FlowSection; storage: FactoryStorage; last: boolean }
  | { type: "header"; key: string; section: FlowSection; collapsed: boolean }
  | { type: "item"; key: string; section: FlowSection; balance: ResourceBalance }
  // A starred resource carries its chart in the row directly beneath it, so a
  // watched figure and its history read as one block while the list scrolls.
  | { type: "chart"; key: string; section: FlowSection; balance: ResourceBalance }
  | { type: "empty"; key: string; section: FlowSection };

/**
 * Headline rate for a balance, in its section's terms: needs report what is
 * missing, outputs what is spare, internal rows throughput.
 */
export function getFlowRowValue(section: FlowSectionId, balance: ResourceBalance) {
  switch (section) {
    case "need":
      return balance.deficitPerSecond;
    // The whole spare figure: product drawers, byproduct drawers and unclaimed
    // surplus are one number, because they are one answer to "how much of this
    // leaves the line".
    case "output":
      return balance.surplusPerSecond;
    case "internal":
    default:
      return balance.consumedPerSecond;
  }
}

/**
 * The NET reading: one signed figure per item, filed under the side its sign
 * says (RAW keeps both boundary figures). Pure arithmetic on the shown totals,
 * not a claim about wiring; an exactly-covered item stays an output at 0/s.
 * Netted lists are re-ranked by their new size, like the raw lists.
 */
export function applyNetFlow(
  needs: ResourceBalance[],
  outputs: ResourceBalance[],
): { needs: ResourceBalance[]; outputs: ResourceBalance[] } {
  const nettedNeeds: ResourceBalance[] = [];
  const nettedOutputs: ResourceBalance[] = [];

  for (const balance of needs) {
    const net = balance.surplusPerSecond - balance.deficitPerSecond;
    if (net < 0 && balance.surplusPerSecond <= 0) {
      nettedNeeds.push(balance);
    } else if (net < 0) {
      nettedNeeds.push({ ...balance, deficitPerSecond: -net, surplusPerSecond: 0 });
    }
    // net >= 0: the outputs pass below files it on the other side.
  }

  for (const balance of outputs) {
    const net = balance.surplusPerSecond - balance.deficitPerSecond;
    if (balance.deficitPerSecond <= 0) {
      nettedOutputs.push(balance);
    } else if (net >= 0) {
      nettedOutputs.push({ ...balance, surplusPerSecond: net, deficitPerSecond: 0 });
    }
    // net < 0: already filed as a need above.
  }

  nettedNeeds.sort((left, right) => right.deficitPerSecond - left.deficitPerSecond);
  nettedOutputs.sort((left, right) => right.surplusPerSecond - left.surplusPerSecond);
  return { needs: nettedNeeds, outputs: nettedOutputs };
}

export function filterFlowBalances(items: ResourceBalance[], filter: string) {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((balance) => {
    if (balance.displayName && balance.displayName.toLowerCase().includes(normalized)) {
      return true;
    }

    return (
      balance.resourceId.toLowerCase().includes(normalized) ||
      balance.key.toLowerCase().includes(normalized)
    );
  });
}

export interface ResourceMarks {
  hidden: ReadonlySet<string>;
  favourites: ReadonlySet<string>;
  /** Hidden rows stay listed, greyed, instead of dropping out. */
  showHidden: boolean;
  /** Everything except favourites drops out. */
  favouritesOnly: boolean;
}

/**
 * Applies the user's marks to one group: drops hidden rows, then floats
 * starred ones to the top. A stable partition, not a sort, so the solver's
 * size order holds within each half and equal rows never swap between
 * renders. Starring unhides, so no row is both.
 */
export function applyResourceMarks(
  items: ResourceBalance[],
  marks: ResourceMarks,
): ResourceBalance[] {
  const starred: ResourceBalance[] = [];
  const rest: ResourceBalance[] = [];

  for (const balance of items) {
    const isFavourite = marks.favourites.has(balance.key);
    if (marks.favouritesOnly && !isFavourite) {
      continue;
    }
    if (marks.hidden.has(balance.key) && !marks.showHidden) {
      continue;
    }
    (isFavourite ? starred : rest).push(balance);
  }

  return starred.length === 0 ? rest : [...starred, ...rest];
}

/** The drawers whose rates the panel sets: sources behind Inputs rows,
 * products behind Outputs rows, by resource key. */
export interface BoundaryDrawers {
  need: ReadonlyMap<string, FactoryStorage[]>;
  output: ReadonlyMap<string, FactoryStorage[]>;
}

export function drawersBehindRow(
  drawers: BoundaryDrawers | undefined,
  section: FlowSectionId,
  key: string,
): FactoryStorage[] | undefined {
  return section === "internal" ? undefined : drawers?.[section].get(key);
}

/**
 * Flattens the sections into the row list the virtualiser walks.
 *
 * A collapsed section contributes only its header, so folding a 200-row group
 * costs nothing to render. `drawers` is given only while rates can be set.
 */
export function buildFlowRows(
  sections: FlowSection[],
  collapsed: Record<FlowSectionId, boolean>,
  favourites: ReadonlySet<string> = new Set(),
  drawers?: BoundaryDrawers,
): FlowRow[] {
  const rows: FlowRow[] = [];
  for (const section of sections) {
    const isCollapsed = collapsed[section.id];
    rows.push({
      type: "header",
      key: `header:${section.id}`,
      section,
      collapsed: isCollapsed,
    });

    if (isCollapsed) {
      continue;
    }

    if (section.items.length === 0) {
      rows.push({ type: "empty", key: `empty:${section.id}`, section });
      continue;
    }

    for (const balance of section.items) {
      rows.push({ type: "item", key: `${section.id}:${balance.key}`, section, balance });
      const behind = drawersBehindRow(drawers, section.id, balance.key) ?? [];
      behind.forEach((storage, index) => {
        rows.push({
          type: "drawer",
          key: `drawer:${storage.id}`,
          section,
          storage,
          last: index === behind.length - 1,
        });
      });
      if (favourites.has(balance.key)) {
        rows.push({
          type: "chart",
          key: `chart:${section.id}:${balance.key}`,
          section,
          balance,
        });
      }
    }
  }

  return rows;
}

/**
 * Running offset of every row plus the total, so the virtualiser can seek to a
 * scroll position without measuring the DOM.
 */
export function measureFlowRows(
  rows: FlowRow[],
  heights: { header: number; item: number; empty: number; chart: number; drawer?: number },
  /**
   * Per-row height scale, for rows mid-arrival or mid-departure (the panel's
   * presence animation). The windowing math reads the ANIMATED height, so
   * the spacers and the scroll length stay exact while a row grows or
   * shrinks. Absent = every row at full height.
   */
  factorFor?: (row: FlowRow) => number,
) {
  const offsets = new Array<number>(rows.length + 1);
  let offset = 0;
  for (let index = 0; index < rows.length; index += 1) {
    offsets[index] = offset;
    const base = heights[rows[index].type] ?? 28;
    offset += factorFor ? Math.round(base * factorFor(rows[index])) : base;
  }

  offsets[rows.length] = offset;
  return { offsets, totalHeight: offset };
}

/** Index of the last row starting at or before `scrollTop`. */
export function findRowIndexAtOffset(offsets: number[], scrollTop: number) {
  let low = 0;
  let high = offsets.length - 2;
  let result = 0;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] <= scrollTop) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

/**
 * Every card on the board that touches one resource, in project card order
 * (so stepping through matches is stable). Recipe cards match on raw inputs
 * and outputs, oredict alternatives included: the same test the board
 * highlight uses, so the two never disagree. Drawers and tanks match on the
 * resource they hold.
 */
export function findResourceCardIds(project: FactoryProject, resourceKey: string): string[] {
  const recipesById = new Map(project.recipes.map((recipe) => [recipe.id, recipe]));
  const ids: string[] = [];

  for (const node of project.nodes) {
    const recipe = recipesById.get(node.recipeId);
    if (!recipe) {
      continue;
    }
    const matches = [...recipe.inputs, ...recipe.outputs].some(
      (resource) =>
        makeResourceKey(resource.kind, resource.id) === resourceKey ||
        resource.alternatives?.some(
          (alternative) => makeResourceKey(alternative.kind, alternative.id) === resourceKey,
        ),
    );
    if (matches) {
      ids.push(node.id);
    }
  }

  for (const storage of project.storages ?? []) {
    if (makeResourceKey(storage.kind, storage.resourceId) === resourceKey) {
      ids.push(storage.id);
    }
  }

  return ids;
}
